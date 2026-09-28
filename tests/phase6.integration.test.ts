import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { manageTradeAccess, requireTradeProjectAccess, tradeFile } from '../src/lib/trade-access';
import { tradeProject, tradeProjects } from '../src/lib/trade-projections';
import { dispatchTrade, dispatchTradeManagement } from '../src/lib/trade-api';
import { dispatchClient } from '../src/lib/client-api';
import {
  acknowledgementSchema,
  acknowledgeTrade,
  scheduleResponseSchema,
  respondTradeSchedule,
  instructionSchema,
  saveInstruction,
  instructionAction,
  deficiencySchema,
  createDeficiency,
  deficiencyActionSchema,
  deficiencyAction,
} from '../src/lib/trade-workflows';
import {
  tradeMessageSchema,
  sendTradeMessage,
  tradeConversations,
  readTradeConversation,
} from '../src/lib/trade-messages';
import { conversations, sendProjectMessage, messageSchema } from '../src/lib/client-messages';
import { savePurchasing, purchasingSchema, purchasingAction } from '../src/lib/purchasing';
import { transitionSchema } from '../src/lib/financial-documents';
import { can } from '../src/lib/permissions';
import { uploadTradeFile, tradeUploadSchema } from '../src/lib/trade-uploads';
import { storage } from '../src/lib/storage';
import { sendEmail } from '../src/lib/email';
import { resetPassword } from '../src/lib/auth';
import { verifyPassword } from '../src/lib/crypto';
import { archiveFile, fileActionSchema } from '../src/lib/operations';
vi.mock('../src/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  appUrl: () => 'http://localhost:3000',
}));
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  process.env.APP_SECRET = 'phase6-test-only-secret-at-least-32-characters';
});
afterAll(() => db.$disconnect());
async function fixture() {
  const key = randomUUID();
  const owner = await db.user.create({
    data: {
      email: `owner-${key}@example.test`,
      firstName: 'Owner',
      lastName: 'Test',
      roles: ['OWNER'],
    },
  });
  const project = await db.project.create({
    data: {
      number: key,
      name: 'Trade project ' + key,
      address: '123 Site Road',
      internalNotes: 'PRIVATE-PROJECT',
      contractAmount: 99999,
    },
  });
  const other = await db.project.create({
    data: { number: 'OTHER-' + key, name: 'Private project ' + key },
  });
  const company = await db.company.create({ data: { name: 'Shared company ' + key } });
  const users = [];
  const contacts = [];
  for (const name of ['A', 'B', 'C']) {
    const user = await db.user.create({
      data: {
        email: `${name}-${key}@example.test`,
        firstName: name,
        lastName: 'Trade',
        roles: [name === 'B' ? 'VENDOR' : 'SUBTRADE'],
      },
    });
    const contact = await db.contact.create({
      data: {
        firstName: name,
        lastName: 'Trade',
        types: [name === 'B' ? 'VENDOR' : 'SUBTRADE'],
        email: user.email,
        portalUserId: user.id,
        companyId: company.id,
        projects: {
          create: {
            projectId: name === 'C' ? other.id : project.id,
            role: name === 'B' ? 'VENDOR' : 'ELECTRICIAN',
          },
        },
      },
    });
    await manageTradeAccess(
      owner,
      name === 'C' ? other.id : project.id,
      contact.id,
      'invite',
      name === 'B' ? 'VENDOR' : 'SUBTRADE',
    );
    users.push(user);
    contacts.push(contact);
  }
  const client = await db.user.create({
    data: {
      email: `client-${key}@example.test`,
      firstName: 'Client',
      lastName: 'Private',
      roles: ['CLIENT'],
    },
  });
  const code = await db.costCode.create({
    data: { code: key, name: 'Electrical', type: 'SUBCONTRACT' },
  });
  return {
    owner,
    project,
    other,
    company,
    a: users[0],
    b: users[1],
    c: users[2],
    ca: contacts[0],
    cb: contacts[1],
    cc: contacts[2],
    client,
    code,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function work(f: Fixture, contactId = f.ca.id) {
  const r = await savePurchasing(
    f.owner,
    purchasingSchema.parse({
      projectId: f.project.id,
      type: 'WORK_ORDER',
      vendorContactId: contactId,
      title: 'Electrical scope',
      scope: 'Install fixtures',
      internalNotes: 'PRIVATE-WORK',
      lines: [
        {
          costCodeId: f.code.id,
          costType: 'SUBCONTRACT',
          description: 'Rough in',
          quantity: '1',
          unitCost: '10000',
          unit: 'lot',
          sortOrder: 0,
          taxable: false,
        },
      ],
    }),
  );
  return r;
}
async function issued(f: Fixture, contactId = f.ca.id) {
  let r = await work(f, contactId);
  for (const action of ['review', 'approve', 'issue'])
    r = await purchasingAction(
      f.owner,
      transitionSchema.parse({ id: r.id, expectedVersion: r.version, action }),
    );
  return r;
}
async function instruction(f: Fixture) {
  const r = await saveInstruction(
    f.owner,
    instructionSchema.parse({
      projectId: f.project.id,
      title: 'Set fixture height',
      description: 'Install 48 inches above floor.',
      internalNotes: 'PRIVATE-INSTRUCTION',
      contactIds: [f.ca.id],
    }),
  );
  await instructionAction(f.owner, {
    projectId: f.project.id,
    id: r.id,
    expectedVersion: 1,
    action: 'issue',
  });
  return db.siteInstruction.findUniqueOrThrow({ where: { id: r.id } });
}
describe('Phase 6 identity and record isolation', () => {
  it('sets up a new external account through a hashed single-use token without emailing a password', async () => {
    const f = await fixture();
    const email = `new-${randomUUID()}@example.test`;
    const contact = await db.contact.create({
      data: {
        firstName: 'New',
        lastName: 'Trade',
        email,
        types: ['VENDOR'],
        projects: { create: { projectId: f.project.id, role: 'SUPPLIER' } },
      },
    });
    await manageTradeAccess(f.owner, f.project.id, contact.id, 'invite', 'VENDOR');
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeNull();
    expect(user.roles).toEqual(['VENDOR']);
    const mail = vi.mocked(sendEmail).mock.calls.find(([m]) => m.to === email)?.[0];
    expect(mail).toBeDefined();
    const token = new URL(mail!.text!.split('\n').at(-1)!).searchParams.get('token')!;
    expect(token).toBeTruthy();
    expect(
      JSON.stringify(await db.actionToken.findMany({ where: { userId: user.id } })),
    ).not.toContain(token);
    await resetPassword(token, 'new-trade-password-test-123');
    await expect(resetPassword(token, 'different-test-password-123')).rejects.toThrow();
    expect(
      await verifyPassword(
        'new-trade-password-test-123',
        (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash,
      ),
    ).toBe(true);
    await manageTradeAccess(f.owner, f.project.id, contact.id, 'invite', 'VENDOR');
    expect(await db.user.count({ where: { email } })).toBe(1);
  });
  it('explicit grants, company identity and portal roles stay separate', async () => {
    const f = await fixture();
    expect((await tradeProjects(f.a)).map((p) => p.id)).toEqual([f.project.id]);
    await expect(requireTradeProjectAccess(f.a, f.other.id)).rejects.toThrow();
    await expect(
      dispatchClient(f.a, true, 'project', { projectId: f.project.id }, null),
    ).rejects.toThrow();
    await expect(
      dispatchTrade(f.client, true, 'project', { projectId: f.project.id }, null),
    ).rejects.toThrow();
    expect(await can(f.a, 'PROJECT_VIEW_ASSIGNED')).toBe(false);
    expect(await can({ ...f.a, roles: ['SUBTRADE', 'OWNER'] }, 'PROJECT_VIEW_ALL')).toBe(false);
    await db.userCapability.create({
      data: { userId: f.a.id, capability: 'PROJECT_VIEW_ALL', granted: true },
    });
    expect(await can(f.a, 'PROJECT_VIEW_ALL')).toBe(false);
    await manageTradeAccess(f.owner, f.project.id, f.ca.id, 'revoke', 'SUBTRADE');
    await expect(tradeProject(f.a, f.project.id)).rejects.toThrow();
    await manageTradeAccess(f.owner, f.project.id, f.ca.id, 'invite', 'SUBTRADE');
    expect(await tradeProjects(f.a)).toHaveLength(1);
  });
  it('does not merge identities by email or allow client/internal invitations', async () => {
    const f = await fixture();
    const c = await db.contact.create({
      data: {
        firstName: 'Collision',
        lastName: 'Contact',
        email: f.client.email,
        types: ['SUBTRADE'],
        projects: { create: { projectId: f.project.id, role: 'SUBTRADE' } },
      },
    });
    await expect(
      manageTradeAccess(f.owner, f.project.id, c.id, 'invite', 'SUBTRADE'),
    ).rejects.toThrow('account link');
    await db.contact.update({ where: { id: c.id }, data: { portalUserId: f.client.id } });
    await expect(
      manageTradeAccess(f.owner, f.project.id, c.id, 'invite', 'SUBTRADE'),
    ).rejects.toThrow('compatible');
  });
  it('draft and internal review work are absent; own issued work only, with no internal leakage', async () => {
    const f = await fixture();
    const draft = await work(f);
    await purchasingAction(
      f.owner,
      transitionSchema.parse({ id: draft.id, expectedVersion: draft.version, action: 'review' }),
    );
    await issued(f, f.cb.id);
    const own = await issued(f);
    const p = await tradeProject(f.a, f.project.id);
    expect(p.work.map((w) => w.id)).toEqual([own.id]);
    expect(p.work[0].document.total).toBe('10000');
    for (const forbidden of [
      'markup',
      'clientPrice',
      'grossProfit',
      'grossMargin',
      'budget',
      'actualCost',
      'forecast',
      'consumedAmount',
      'passwordHash',
      'quickBooks',
      'internalNotes',
      'PRIVATE',
      'clientId',
    ])
      expect(JSON.stringify(p)).not.toContain(forbidden);
    await expect(
      acknowledgeTrade(
        f.b,
        acknowledgementSchema.parse({
          projectId: f.project.id,
          id: own.id,
          kind: 'work',
          typedName: 'Wrong trade',
        }),
      ),
    ).rejects.toThrow();
  });
  it('acknowledgement retries and concurrent requests produce one immutable receipt; revision requires a new receipt', async () => {
    const f = await fixture();
    const r = await issued(f);
    const i = acknowledgementSchema.parse({
      projectId: f.project.id,
      id: r.id,
      kind: 'work',
      typedName: 'Trade A',
    });
    await Promise.all([acknowledgeTrade(f.a, i), acknowledgeTrade(f.a, i)]);
    await acknowledgeTrade(f.a, i);
    expect(await db.tradeAcknowledgement.count({ where: { purchasingRevisionId: r.id } })).toBe(1);
    const ack = await db.tradeAcknowledgement.findFirstOrThrow({
      where: { purchasingRevisionId: r.id },
    });
    await expect(
      db.tradeAcknowledgement.update({ where: { id: ack.id }, data: { typedName: 'Rewrite' } }),
    ).rejects.toThrow();
    await db.contact.update({ where: { id: f.ca.id }, data: { firstName: 'Renamed' } });
    expect(
      (await db.tradeAcknowledgement.findUniqueOrThrow({ where: { id: ack.id } })).snapshot,
    ).toEqual(ack.snapshot);
    const old = await db.purchasingRevision.findUniqueOrThrow({ where: { id: r.id } });
    let next = await purchasingAction(
      f.owner,
      transitionSchema.parse({ id: r.id, expectedVersion: old.version, action: 'revise' }),
    );
    for (const action of ['review', 'approve', 'issue'])
      next = await purchasingAction(
        f.owner,
        transitionSchema.parse({ id: next.id, expectedVersion: next.version, action }),
      );
    await expect(acknowledgeTrade(f.a, i)).rejects.toThrow();
    expect(
      (await tradeProject(f.a, f.project.id)).work.find((w) => w.id === next.id)?.acknowledgement,
    ).toBeNull();
    await acknowledgeTrade(f.a, { ...i, id: next.id });
    expect(await db.tradeAcknowledgement.count({ where: { contactId: f.ca.id } })).toBe(2);
  });
  it('assigned schedule is scoped and conflicts never change master dates', async () => {
    const f = await fixture();
    const start = new Date('2026-10-01');
    const task = await db.projectTask.create({
      data: {
        projectId: f.project.id,
        name: 'Rough in',
        description: 'PRIVATE-TASK',
        startDate: start,
        createdById: f.owner.id,
        assignees: { create: { contactId: f.ca.id } },
      },
    });
    await db.projectTask.create({
      data: {
        projectId: f.project.id,
        name: 'Other trade',
        createdById: f.owner.id,
        assignees: { create: { contactId: f.cb.id } },
      },
    });
    await db.projectTask.create({
      data: { projectId: f.project.id, name: 'Internal', createdById: f.owner.id },
    });
    expect((await tradeProject(f.a, f.project.id)).schedule.map((t) => t.id)).toEqual([task.id]);
    const i = scheduleResponseSchema.parse({
      projectId: f.project.id,
      taskId: task.id,
      requestId: randomUUID(),
      response: 'CONFLICT',
      comment: 'Material arrives later.',
    });
    await respondTradeSchedule(f.a, i);
    await respondTradeSchedule(f.a, i);
    await expect(respondTradeSchedule(f.b, { ...i, requestId: randomUUID() })).rejects.toThrow();
    expect((await db.projectTask.findUniqueOrThrow({ where: { id: task.id } })).startDate).toEqual(
      start,
    );
    expect(await db.tradeScheduleResponse.count({ where: { taskId: task.id } })).toBe(1);
    expect(
      await db.notification.count({ where: { userId: f.owner.id, projectId: f.project.id } }),
    ).toBeGreaterThan(0);
  });
  it('instructions are immutable, recipient-scoped and acknowledgements are idempotent', async () => {
    const f = await fixture();
    const r = await instruction(f);
    expect((await tradeProject(f.b, f.project.id)).instructions).toHaveLength(0);
    const i = acknowledgementSchema.parse({
      projectId: f.project.id,
      id: r.id,
      kind: 'instruction',
      typedName: 'Trade A',
    });
    await Promise.all([acknowledgeTrade(f.a, i), acknowledgeTrade(f.a, i)]);
    expect(await db.tradeAcknowledgement.count({ where: { instructionId: r.id } })).toBe(1);
    expect((await db.siteInstruction.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'ACKNOWLEDGED',
    );
    await expect(
      db.siteInstruction.update({ where: { id: r.id }, data: { description: 'Rewrite' } }),
    ).rejects.toThrow();
    await expect(
      db.siteInstructionRecipient.create({ data: { instructionId: r.id, contactId: f.cb.id } }),
    ).rejects.toThrow();
  });
  it('deficiency completion requires staff verification and retains trade completion uploads', async () => {
    const f = await fixture();
    const d = await createDeficiency(
      f.owner,
      deficiencySchema.parse({
        projectId: f.project.id,
        title: 'Missing trim',
        description: 'Install trim',
        assignedContactId: f.ca.id,
      }),
    );
    expect((await tradeProject(f.b, f.project.id)).deficiencies).toHaveLength(0);
    const i = deficiencyActionSchema.parse({
      projectId: f.project.id,
      id: d.id,
      expectedVersion: 1,
      action: 'ready',
      comment: 'Installed and photographed.',
    });
    await expect(deficiencyAction(f.b, i, true)).rejects.toThrow();
    await expect(deficiencyAction(f.a, { ...i, action: 'close' }, true)).rejects.toThrow();
    const upload = await uploadTradeFile(
      f.a,
      tradeUploadSchema.parse({ projectId: f.project.id, deficiencyId: d.id }),
      {
        name: 'repair.png',
        type: 'image/png',
        bytes: Buffer.from('89504e470d0a1a0a00000000', 'hex'),
      },
    );
    await deficiencyAction(f.a, i, true);
    await deficiencyAction(
      f.owner,
      { ...i, expectedVersion: 2, action: 'close', comment: 'Verified on site.' },
      false,
    );
    await deficiencyAction(
      f.owner,
      { ...i, expectedVersion: 3, action: 'reopen', comment: 'Adjust trim alignment.' },
      false,
    );
    const p = await tradeProject(f.a, f.project.id);
    expect(p.deficiencies[0].status).toBe('REOPENED');
    expect(p.deficiencies[0].attachments[0].id).toBe(upload.id);
    await expect(tradeFile(f.b, upload.id)).rejects.toThrow();
    await expect(
      archiveFile(
        f.owner,
        fileActionSchema.parse({ projectId: f.project.id, id: upload.id, action: 'archive' }),
      ),
    ).rejects.toThrow();
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: upload.id } });
    await storage().remove(file.storageKey);
  });
  it('guessed files fail across classification, trade and project boundaries', async () => {
    const f = await fixture();
    for (const visibility of ['INTERNAL', 'CLIENT', 'TRADE'] as const) {
      const file = await db.storedFile.create({
        data: {
          projectId: f.project.id,
          uploaderId: f.owner.id,
          visibility,
          kind: 'DOCUMENT',
          filename: 'drawing.pdf',
          originalFilename: 'drawing.pdf',
          mimeType: 'application/pdf',
          size: 1,
          storageKey: randomUUID(),
          tradeShares: visibility === 'TRADE' ? { create: { contactId: f.cb.id } } : undefined,
        },
      });
      await expect(tradeFile(f.a, file.id)).rejects.toThrow();
      if (visibility === 'TRADE') {
        await dispatchTradeManagement(
          f.owner,
          false,
          'share-file',
          {},
          { projectId: f.project.id, id: file.id, contactId: f.ca.id, shared: true },
        );
        expect((await tradeFile(f.a, file.id)).id).toBe(file.id);
        await expect(tradeFile(f.c, file.id)).rejects.toThrow();
      }
    }
  });
  it('messages cannot cross trade, client, internal or project boundaries', async () => {
    const f = await fixture();
    const msg = tradeMessageSchema.parse({
      projectId: f.project.id,
      contactId: f.ca.id,
      subject: 'Electrical question',
      body: 'Please confirm position.',
    });
    const thread = await sendTradeMessage(f.owner, msg, false);
    await sendTradeMessage(f.a, { ...msg, conversationId: thread.id, body: 'Confirmed.' }, true);
    expect(await tradeConversations(f.b, f.project.id, true)).toHaveLength(0);
    await expect(
      sendTradeMessage(f.b, { ...msg, conversationId: thread.id }, true),
    ).rejects.toThrow();
    await expect(readTradeConversation(f.b, f.project.id, thread.id, true)).rejects.toThrow();
    await expect(tradeConversations(f.c, f.project.id, true)).rejects.toThrow();
    const internal = await sendProjectMessage(
      f.owner,
      messageSchema.parse({
        projectId: f.project.id,
        subject: 'Internal',
        body: 'PRIVATE',
        audience: 'INTERNAL',
      }),
    );
    await expect(
      sendTradeMessage(f.a, { ...msg, conversationId: internal.id }, true),
    ).rejects.toThrow();
    expect((await conversations(f.owner, f.project.id)).map((c) => c.id)).not.toContain(thread.id);
    const p = await tradeConversations(f.a, f.project.id, true);
    expect(JSON.stringify(p)).not.toContain('PRIVATE');
    expect(p[0].messages).toHaveLength(2);
  });
  it('PM project scope and revoked access cover mutations, uploads and acknowledgement', async () => {
    const f = await fixture();
    const pm = await db.user.create({
      data: {
        email: `pm-${randomUUID()}@example.test`,
        firstName: 'PM',
        lastName: 'Test',
        roles: ['PROJECT_MANAGER'],
      },
    });
    await expect(
      saveInstruction(
        pm,
        instructionSchema.parse({
          projectId: f.project.id,
          title: 'Unauthorized',
          description: 'No',
          contactIds: [f.ca.id],
        }),
      ),
    ).rejects.toThrow();
    const r = await issued(f);
    await manageTradeAccess(f.owner, f.project.id, f.ca.id, 'revoke', 'SUBTRADE');
    await expect(
      acknowledgeTrade(
        f.a,
        acknowledgementSchema.parse({
          projectId: f.project.id,
          id: r.id,
          kind: 'work',
          typedName: 'Trade A',
        }),
      ),
    ).rejects.toThrow();
    await expect(
      uploadTradeFile(f.a, tradeUploadSchema.parse({ projectId: f.project.id }), {
        name: 'test.pdf',
        type: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4'),
      }),
    ).rejects.toThrow();
  });
});
