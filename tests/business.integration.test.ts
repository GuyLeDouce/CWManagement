import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { crm, configureCrm, saveOpportunity, saveCrmActivity } from '../src/lib/crm';
import { setupProject, setupSchema } from '../src/lib/project-setup';
import {
  createWarranty,
  actWarranty,
  warrantyProjection,
  tradeWarrantyProjection,
} from '../src/lib/warranty';
import { clientProject } from '../src/lib/client-projections';
import { clientPreview } from '../src/lib/client-vision';
import { clientFile } from '../src/lib/client-access';
import { uploadWarrantyFile } from '../src/lib/warranty-files';
import { runReport, saveReport } from '../src/lib/portfolio-reports';
import {
  enqueueReminder,
  runAutomation,
  deliveryAllowed,
  reviewDelivery,
} from '../src/lib/automation';
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated database required');
  await db.settings.upsert({
    where: { id: 'company' },
    create: {},
    update: { automationEnabled: false },
  });
});
afterAll(() => db.$disconnect());
async function fixture() {
  const key = randomUUID();
  const user = async (role: 'OWNER' | 'PM' | 'CLIENT' | 'SUBTRADE') =>
    db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        firstName: 'Business',
        lastName: role,
        roles: [role],
      },
    });
  const owner = await user('OWNER'),
    pm = await user('PM'),
    client = await user('CLIENT'),
    otherClient = await user('CLIENT'),
    trade = await user('SUBTRADE'),
    otherTrade = await user('SUBTRADE');
  const contact = await db.contact.create({
    data: { firstName: 'Test', lastName: 'Client', types: ['CLIENT'], portalUserId: client.id },
  });
  const contactB = await db.contact.create({
    data: {
      firstName: 'Other',
      lastName: 'Client',
      types: ['CLIENT'],
      portalUserId: otherClient.id,
    },
  });
  const t = await db.contact.create({
    data: { firstName: 'Test', lastName: 'Trade', types: ['SUBTRADE'], portalUserId: trade.id },
  });
  const tb = await db.contact.create({
    data: {
      firstName: 'Other',
      lastName: 'Trade',
      types: ['SUBTRADE'],
      portalUserId: otherTrade.id,
    },
  });
  const p = await db.project.create({
    data: {
      number: key,
      name: 'Phase8A ' + key,
      assignments: { create: { userId: pm.id, role: 'PRIMARY_PROJECT_MANAGER' } },
      contacts: {
        create: [
          { contactId: contact.id, role: 'CLIENT' },
          { contactId: contactB.id, role: 'CLIENT' },
          { contactId: t.id, role: 'SUBTRADE' },
          { contactId: tb.id, role: 'SUBTRADE' },
        ],
      },
      portalAccess: {
        create: [
          { userId: client.id, contactId: contact.id, invitedById: owner.id },
          { userId: otherClient.id, contactId: contactB.id, invitedById: owner.id },
        ],
      },
      tradeAccess: {
        create: [
          { userId: trade.id, contactId: t.id, invitedById: owner.id },
          { userId: otherTrade.id, contactId: tb.id, invitedById: owner.id },
        ],
      },
    },
  });
  const other = await db.project.create({
    data: { number: key + '-other', name: 'Private project ' + key },
  });
  return {
    key,
    owner,
    pm,
    client,
    otherClient,
    trade,
    otherTrade,
    contact,
    contactB,
    t,
    tb,
    p,
    other,
  };
}
describe('Phase 8A operational boundaries', () => {
  it('requires authorized review for uncertain email and prevents concurrent scheduler claims', async () => {
    const f = await fixture();
    const d = await db.deliveryRecord.create({
      data: {
        dedupeKey: f.key,
        userId: f.owner.id,
        kind: 'DIGEST',
        entityId: f.owner.id,
        title: 'Digest',
        actionUrl: '/my-work',
        status: 'REVIEW_REQUIRED',
      },
    });
    await expect(
      reviewDelivery(f.client, {
        id: d.id,
        action: 'retry',
        reason: 'Checked provider logs carefully',
        acknowledgeDuplicateRisk: true,
      }),
    ).rejects.toBeTruthy();
    await expect(
      reviewDelivery(f.owner, {
        id: d.id,
        action: 'retry',
        reason: 'Checked provider logs carefully',
      }),
    ).rejects.toBeTruthy();
    await reviewDelivery(f.owner, {
      id: d.id,
      action: 'retry',
      reason: 'Provider confirmed no acceptance',
      acknowledgeDuplicateRisk: true,
    });
    expect((await db.deliveryRecord.findUniqueOrThrow({ where: { id: d.id } })).status).toBe(
      'PENDING',
    );
    await db.automationLease.upsert({
      where: { id: 'reminders' },
      create: { id: 'reminders', token: f.key, expiresAt: new Date(Date.now() + 60000) },
      update: { token: f.key, expiresAt: new Date(Date.now() + 60000) },
    });
    try {
      expect(await runAutomation()).toEqual({ busy: true });
    } finally {
      await db.automationLease.deleteMany({ where: { id: 'reminders', token: f.key } });
    }
  });
  it('keeps opportunities separate from contacts, preserves lost history, and converts a won opportunity exactly once', async () => {
    const f = await fixture();
    const stage = await configureCrm(f.owner, { kind: 'stage', name: f.key });
    const o = await saveOpportunity(f.owner, {
      title: 'Potential cottage',
      contactId: f.contact.id,
      stageId: stage.id,
      ownerId: f.owner.id,
      estimatedValue: '123456.78',
      status: 'LOST',
      lostReason: 'Timing',
    });
    expect((await crm(f.pm)).opportunities.some((x) => x.id === o.id)).toBe(false);
    await expect(saveOpportunity(f.owner, { ...o, version: 0 })).rejects.toBeTruthy();
    const won = await saveOpportunity(f.owner, {
      id: o.id,
      version: o.version,
      title: o.title,
      contactId: o.contactId,
      stageId: o.stageId,
      ownerId: o.ownerId,
      status: 'WON',
    });
    const input = setupSchema.parse({
      opportunityId: won.id,
      name: won.title,
      number: f.key.slice(0, 28) + '-converted',
      contactId: f.contact.id,
      managerId: f.owner.id,
      startDate: '2026-10-01',
    });
    const [a, b] = await Promise.all([setupProject(f.owner, input), setupProject(f.owner, input)]);
    expect(a.id).toBe(b.id);
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: o.id } })).projectId).toBe(a.id);
    expect(
      await db.auditLog.count({ where: { entityId: o.id, action: 'OPPORTUNITY_CONVERTED' } }),
    ).toBe(1);
    expect(await db.contact.count({ where: { id: f.contact.id } })).toBe(1);
  });
  it('records follow-ups with completion and rejects external CRM access', async () => {
    const f = await fixture();
    const s = await configureCrm(f.owner, { kind: 'stage', name: f.key });
    const o = await saveOpportunity(f.owner, {
      title: 'Lead',
      contactId: f.contact.id,
      stageId: s.id,
      ownerId: f.owner.id,
    });
    const a = await saveCrmActivity(f.owner, {
      opportunityId: o.id,
      title: 'Call',
      category: 'Call',
      ownerId: f.owner.id,
      dueAt: new Date().toISOString(),
    });
    expect(a.completedAt).toBeNull();
    await expect(crm(f.client)).rejects.toBeTruthy();
    await expect(
      saveOpportunity(f.trade, {
        title: 'Leak',
        contactId: f.contact.id,
        stageId: s.id,
        ownerId: f.owner.id,
      }),
    ).rejects.toBeTruthy();
    const done = await saveCrmActivity(f.owner, {
      id: a.id,
      opportunityId: o.id,
      title: a.title,
      category: a.category,
      ownerId: a.ownerId,
      dueAt: a.dueAt.toISOString(),
      complete: true,
    });
    expect(done.completedAt).not.toBeNull();
  });
  it('isolates warranty by client and trade, enforces staff verification, and matches Client Vision', async () => {
    const f = await fixture();
    const { id } = await createWarranty(f.client, {
      projectId: f.p.id,
      title: 'Door adjustment',
      description: 'Door sticks',
      location: 'Entry',
    });
    await expect(
      createWarranty(f.client, { projectId: f.other.id, title: 'Forbidden', description: 'No' }),
    ).rejects.toBeTruthy();
    let r = await db.warrantyRequest.findUniqueOrThrow({ where: { id } });
    await actWarranty(f.pm, { id, version: r.version, action: 'accept' });
    r = await db.warrantyRequest.findUniqueOrThrow({ where: { id } });
    await actWarranty(f.pm, {
      id,
      version: r.version,
      action: 'assign',
      assignedTradeId: f.t.id,
      tradeDescription: 'Adjust entry door',
      internalNotes: 'PRIVATE-NOTE',
    });
    expect(await warrantyProjection(db, f.p.id, f.contactB.id)).toHaveLength(0);
    expect(await tradeWarrantyProjection(db, f.p.id, f.tb.id)).toHaveLength(0);
    const safe = JSON.stringify(await tradeWarrantyProjection(db, f.p.id, f.t.id));
    expect(safe).not.toContain('PRIVATE-NOTE');
    expect(safe).not.toContain('clientContactId');
    r = await db.warrantyRequest.findUniqueOrThrow({ where: { id } });
    await expect(
      actWarranty(f.otherTrade, { id, version: r.version, action: 'ready' }),
    ).rejects.toBeTruthy();
    await expect(
      actWarranty(f.trade, { id, version: r.version, action: 'close' }),
    ).rejects.toBeTruthy();
    await actWarranty(f.trade, { id, version: r.version, action: 'ready', body: 'Adjusted' });
    r = await db.warrantyRequest.findUniqueOrThrow({ where: { id } });
    await actWarranty(f.pm, {
      id,
      version: r.version,
      action: 'complete',
      audience: 'CLIENT',
      body: 'Work checked',
    });
    r = await db.warrantyRequest.findUniqueOrThrow({ where: { id } });
    await expect(
      actWarranty(f.otherClient, { id, version: r.version, action: 'verify' }),
    ).rejects.toBeTruthy();
    const actual = await clientProject(f.client, f.p.id),
      preview = await clientPreview(f.owner, f.p.id, f.contact.id);
    expect(preview.warranty).toEqual(actual.warranty);
    expect(JSON.stringify(actual.warranty)).not.toContain('internalNotes');
    await actWarranty(f.client, { id, version: r.version, action: 'verify' });
    r = await db.warrantyRequest.findUniqueOrThrow({ where: { id } });
    await actWarranty(f.pm, { id, version: r.version, action: 'close' });
    expect((await db.warrantyRequest.findUniqueOrThrow({ where: { id } })).status).toBe('CLOSED');
    await expect(db.warrantyUpdate.deleteMany({ where: { requestId: id } })).rejects.toBeTruthy();
  });
  it('does not expose client warranty evidence through the general project file list or guessed IDs', async () => {
    const f = await fixture();
    const r = await createWarranty(f.client, {
      projectId: f.p.id,
      title: 'Photo',
      description: 'Evidence',
    });
    const file = await uploadWarrantyFile(
      f.client,
      { requestId: r.id },
      { name: 'safe.png', type: 'image/png', bytes: Buffer.from('89504e470d0a1a0a', 'hex') },
    );
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: file.id } })).origin).toBe(
      'CLIENT_UPLOAD',
    );
    expect((await clientFile(f.client, file.id)).id).toBe(file.id);
    await expect(clientFile(f.otherClient, file.id)).rejects.toBeTruthy();
    expect((await clientProject(f.otherClient, f.p.id)).files.some((x) => x.id === file.id)).toBe(
      false,
    );
    expect((await clientPreview(f.owner, f.p.id)).files.some((x) => x.id === file.id)).toBe(false);
  });
  it('scopes reports and saved views at execution; margins are removed from PM results', async () => {
    const f = await fixture();
    await db.projectTask.create({
      data: { projectId: f.other.id, name: 'Hidden task', createdById: f.owner.id },
    });
    await db.projectTask.create({
      data: { projectId: f.p.id, name: 'Visible task', createdById: f.owner.id },
    });
    const tasks = await runReport(f.pm, { report: 'tasks', projectId: f.other.id });
    expect(tasks.rows).toHaveLength(0);
    const visible = await runReport(f.pm, { report: 'tasks', projectId: f.p.id });
    expect(visible.rows[0].title).toBe('Visible task');
    await saveReport(f.pm, { name: f.key, filters: { report: 'tasks', projectId: f.other.id } });
    expect(
      (await runReport(f.pm, { report: 'financial', projectId: f.p.id })).rows[0],
    ).not.toHaveProperty('forecastMargin');
    await expect(runReport(f.client, { report: 'projects' })).rejects.toBeTruthy();
    await expect(runReport(f.trade, { report: 'warranty' })).rejects.toBeTruthy();
  });
  it('durably deduplicates reminders, honors disabled configuration and revoked access', async () => {
    const f = await fixture();
    const r = await createWarranty(f.client, {
      projectId: f.p.id,
      title: 'Service',
      description: 'Issue',
    });
    const c = {
      userId: f.client.id,
      projectId: f.p.id,
      kind: 'WARRANTY',
      entityId: r.id,
      title: 'Service reminder',
      actionUrl: `/client/projects/${f.p.id}/warranty`,
      period: 'test',
    };
    await Promise.all([enqueueReminder(c, true), enqueueReminder(c, true)]);
    expect(await db.deliveryRecord.count({ where: { entityId: r.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: f.client.id, title: c.title } })).toBe(1);
    await db.clientProjectAccess.updateMany({
      where: { projectId: f.p.id, userId: f.client.id },
      data: { active: false, revokedAt: new Date() },
    });
    expect(await deliveryAllowed(db, c)).toBe(false);
    expect(await runAutomation()).toEqual({ disabled: true });
  });
});
