import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { clientPreview, previewFile, saveClientPreferences } from '../src/lib/client-vision';
import { clientProject } from '../src/lib/client-projections';
import { dispatchClient, dispatchClientManagement } from '../src/lib/client-api';
import { conversations } from '../src/lib/client-messages';
import { approveClientChangeOrder } from '../src/lib/client-approvals';
import { clientPrice } from '../src/lib/client-pricing';
import type { Role } from '@prisma/client';
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated test database required');
});
afterAll(() => db.$disconnect());
const wire = (v: unknown) => JSON.parse(JSON.stringify(v));
async function user(role: Role) {
  return db.user.create({
    data: {
      email: randomUUID() + '@example.test',
      firstName: role,
      lastName: 'Vision',
      roles: [role],
    },
  });
}
async function fixture(originalAmount = 100000, changeAmount = 27000, rate = 0.13) {
  const owner = await user('OWNER'),
    a = await user('CLIENT'),
    b = await user('CLIENT');
  const ca = await db.contact.create({
    data: { firstName: 'Client A', lastName: 'Vision', types: ['CLIENT'], portalUserId: a.id },
  });
  const cb = await db.contact.create({
    data: { firstName: 'Client B', lastName: 'Vision', types: ['CLIENT'], portalUserId: b.id },
  });
  const project = await db.project.create({
    data: {
      number: randomUUID(),
      name: 'Vision project',
      address: 'Example site',
      contractAmount: originalAmount,
      internalNotes: 'PRIVATE-SENTINEL',
      clientTaxDisplayMode: 'FINAL_TOTAL_ONLY',
      clientFinancialSummaryEnabled: true,
      contacts: { create: [ca, cb].map((c) => ({ contactId: c.id, role: 'CLIENT' })) },
    },
  });
  for (const [u, c] of [
    [a, ca],
    [b, cb],
  ])
    await db.clientProjectAccess.create({
      data: { projectId: project.id, userId: u.id, contactId: c.id, invitedById: owner.id },
    });
  const estimate = await db.estimate.create({
    data: {
      projectId: project.id,
      estimateNumber: randomUUID(),
      name: 'Source',
      revisions: { create: { revision: 0, taxRate: 0.13, createdById: owner.id } },
    },
    include: { revisions: true },
  });
  const proposal = await db.proposal.create({
    data: {
      projectId: project.id,
      proposalNumber: randomUUID(),
      title: 'Fixed contract',
      revisions: {
        create: {
          estimateRevisionId: estimate.revisions[0].id,
          revision: 0,
          status: 'ACCEPTED',
          issueDate: new Date(),
          clientId: ca.id,
          clientNameSnapshot: 'Client A',
          projectNameSnapshot: project.name,
          projectNumberSnapshot: project.number,
          companySnapshot: {},
          sectionsSnapshot: [
            {
              name: 'Client scope',
              internalNotes: 'PRIVATE-SENTINEL',
              lines: [
                {
                  description: 'Approved work',
                  quantity: '1',
                  unit: 'lot',
                  price: String(originalAmount),
                  unitCost: 'PRIVATE-SENTINEL',
                  markupValue: 'PRIVATE-SENTINEL',
                },
              ],
            },
          ],
          subtotal: originalAmount,
          taxRate: 0.13,
          taxAmount: originalAmount * rate,
          total: originalAmount * (1 + rate),
          createdById: owner.id,
          acceptedAt: new Date(),
        },
      },
    },
    include: { revisions: true },
  });
  const change = await db.changeOrder.create({
    data: {
      projectId: project.id,
      number: randomUUID(),
      revisions: {
        create: {
          revision: 0,
          status: 'ISSUED',
          clientId: ca.id,
          title: 'Additional scope',
          createdById: owner.id,
          taxRate: 0.13,
          subtotal: changeAmount,
          taxAmount: changeAmount * rate,
          total: changeAmount * (1 + rate),
          costTotal: 20000,
          issuedAt: new Date(),
          snapshot: {
            number: 'CO-VISION',
            revision: 0,
            title: 'Additional scope',
            scope: 'Safe scope',
            scheduleDays: 2,
            issuedAt: new Date().toISOString(),
            subtotal: '27000',
            tax: '3510',
            total: '30510',
            taxRate: '0.13',
            costTotal: '20000',
            internalNotes: 'PRIVATE-SENTINEL',
            lines: [
              {
                description: 'Client scope',
                quantity: '1',
                unit: 'lot',
                amount: '27000',
                taxable: true,
                unitCost: '20000',
                markupValue: '7000',
              },
            ],
          },
        },
      },
    },
    include: { revisions: true },
  });
  const code = await db.costCode.create({
    data: { code: randomUUID(), name: 'Fixtures', type: 'MATERIAL' },
  });
  const allowance = await db.allowance.create({
    data: {
      projectId: project.id,
      name: 'Allowance',
      costCodeId: code.id,
      costType: 'MATERIAL',
      amount: 12000,
      includedCost: 8000,
    },
  });
  const selection = await db.selection.create({
    data: {
      projectId: project.id,
      allowanceId: allowance.id,
      title: 'Fixtures',
      category: 'Fixtures',
      createdById: owner.id,
      status: 'DRAFT',
      internalNotes: 'PRIVATE-SENTINEL',
      options: {
        create: {
          name: 'Option',
          attachmentIds: [],
          quantity: 1,
          costCodeId: code.id,
          costType: 'MATERIAL',
          unitCost: 9800,
          markupMethod: 'FIXED',
          markupValue: 4700,
          clientPrice: 14500,
        },
      },
    },
    include: { options: true },
  });
  await db.selection.update({
    where: { id: selection.id },
    data: { publishedAt: new Date(), status: 'PUBLISHED' },
  });
  await db.projectTask.createMany({
    data: [
      {
        projectId: project.id,
        name: 'PRIVATE-SENTINEL',
        createdById: owner.id,
        clientVisible: true,
        clientTitle: 'Published milestone',
        milestone: true,
      },
      { projectId: project.id, name: 'PRIVATE-SENTINEL', createdById: owner.id },
    ],
  });
  await db.dailyLog.create({
    data: {
      projectId: project.id,
      authorId: owner.id,
      date: new Date(),
      clientVisible: true,
      clientSummary: 'Published update',
      workCompleted: 'PRIVATE-SENTINEL',
    },
  });
  for (const audience of ['CLIENT', 'INTERNAL'] as const)
    await db.conversation.create({
      data: {
        projectId: project.id,
        subject: audience === 'CLIENT' ? 'Shared conversation' : 'PRIVATE-SENTINEL',
        audience,
        messages: {
          create: {
            authorId: owner.id,
            body: audience === 'CLIENT' ? 'Shared message' : 'PRIVATE-SENTINEL',
          },
        },
      },
    });
  await db.conversation.create({
    data: {
      projectId: project.id,
      subject: 'A only',
      audience: 'CLIENT',
      changeOrderRevisionId: change.revisions[0].id,
      messages: { create: { authorId: owner.id, body: 'A addressed scope' } },
    },
  });
  await db.notification.create({
    data: {
      userId: a.id,
      projectId: project.id,
      title: 'A notice',
      message: 'Review your project',
      actionUrl: '/client',
      type: 'GENERAL',
    },
  });
  return {
    owner,
    a,
    b,
    ca,
    cb,
    project,
    change: change.revisions[0],
    selection,
    proposal: proposal.revisions[0],
  };
}
describe('Client Vision shared projection and controls', () => {
  it('matches actual client DTO including targeted messages and notices; strips private fields and values', async () => {
    const f = await fixture();
    const { preview, ...shown } = await clientPreview(f.owner, f.project.id, f.ca.id);
    expect(preview.clients).toHaveLength(2);
    expect(wire(shown)).toEqual(wire(await clientProject(f.a, f.project.id)));
    expect(wire(shown.conversations)).toEqual(wire(await conversations(f.a, f.project.id)));
    const payload = JSON.stringify(shown);
    for (const field of [
      'unitCost',
      'estimatedCost',
      'costTotal',
      'markup',
      'markupMethod',
      'markupValue',
      'grossProfit',
      'grossMargin',
      'originalBudget',
      'currentBudget',
      'committed',
      'actualCost',
      'forecast',
      'quickBooks',
      'internalNotes',
      'passwordHash',
      'storageKey',
      'PRIVATE-SENTINEL',
      '9800',
      '4700',
    ])
      expect(payload).not.toContain(field);
    expect(shown.schedule).toHaveLength(1);
    expect(shown.updates[0].clientSummary).toBe('Published update');
    expect(shown.selections[0].options[0].clientPrice.toString()).toBe('14500');
    expect(shown.selections[0].options[0].variance).toBe('2500');
    expect(shown.financialSummary?.original).toEqual({ total: '113000.00' });
  });
  it('isolates named recipients and general preview; works without invitations', async () => {
    const f = await fixture();
    const asB = await clientPreview(f.owner, f.project.id, f.cb.id),
      general = await clientPreview(f.owner, f.project.id);
    expect(asB.changeOrders).toHaveLength(0);
    expect(general.changeOrders).toHaveLength(0);
    expect(asB.proposals).toHaveLength(0);
    expect(general.proposals).toHaveLength(0);
    expect(asB.conversations.map((c) => c.subject)).toEqual(['Shared conversation']);
    expect(general.conversations.map((c) => c.subject)).toEqual(['Shared conversation']);
    await db.clientProjectAccess.deleteMany({ where: { projectId: f.project.id } });
    expect((await clientPreview(f.owner, f.project.id)).schedule).toHaveLength(1);
    await expect(clientProject(f.a, f.project.id)).rejects.toThrow();
    await expect(clientPreview(f.owner, f.project.id, randomUUID())).rejects.toThrow();
  });
  it('requires internal capability AND project access, honoring explicit denial', async () => {
    const f = await fixture();
    for (const role of ['FIELD', 'SHOP', 'CLIENT', 'SUBTRADE', 'VENDOR'] as Role[])
      await expect(clientPreview(await user(role), f.project.id)).rejects.toThrow();
    const pm = await user('PM');
    await expect(clientPreview(pm, f.project.id)).rejects.toThrow();
    await db.projectAssignment.create({
      data: { projectId: f.project.id, userId: pm.id, role: 'PRIMARY_PROJECT_MANAGER' },
    });
    expect((await clientPreview(pm, f.project.id)).project.id).toBe(f.project.id);
    await db.userCapability.create({
      data: { userId: pm.id, capability: 'CLIENT_PREVIEW', granted: false },
    });
    await expect(clientPreview(pm, f.project.id)).rejects.toThrow();
  });
  it('enforces client visibility on preview downloads and rejects cross-project IDs', async () => {
    const f = await fixture();
    const other = await db.project.create({ data: { name: 'Other', number: randomUUID() } });
    for (const [visibility, projectId] of [
      ['CLIENT', f.project.id],
      ['INTERNAL', f.project.id],
      ['TRADE', f.project.id],
      ['CLIENT', other.id],
    ] as const) {
      const file = await db.storedFile.create({
        data: {
          projectId,
          visibility,
          kind: 'DOCUMENT',
          uploaderId: f.owner.id,
          filename: 'file.pdf',
          originalFilename: 'file.pdf',
          mimeType: 'application/pdf',
          size: 1,
          storageKey: randomUUID(),
        },
      });
      if (visibility === 'CLIENT' && projectId === f.project.id)
        expect((await previewFile(f.owner, file.id, f.project.id)).id).toBe(file.id);
      else await expect(previewFile(f.owner, file.id, f.project.id)).rejects.toThrow();
    }
  });
  it('changes presentation only, inherits company defaults, audits settings, and rejects unauthorized changes', async () => {
    const f = await fixture();
    const before = wire(await db.proposalRevision.findUnique({ where: { id: f.proposal.id } }));
    await saveClientPreferences(f.owner, {
      projectId: f.project.id,
      clientTaxDisplayMode: 'SHOW_TAX_BREAKDOWN',
      clientFinancialSummaryEnabled: true,
      clientManagerVisible: false,
    });
    const shown = await clientPreview(f.owner, f.project.id, f.ca.id);
    expect(shown.financialSummary?.original).toEqual({
      subtotal: '100000.00',
      tax: '13000.00',
      total: '113000.00',
    });
    expect(wire(await db.proposalRevision.findUnique({ where: { id: f.proposal.id } }))).toEqual(
      before,
    );
    expect(
      await db.auditLog.count({
        where: { entityId: f.project.id, action: 'CLIENT_VIEW_SETTINGS_CHANGED' },
      }),
    ).toBeGreaterThan(0);
    await expect(
      saveClientPreferences(f.a, {
        projectId: f.project.id,
        clientTaxDisplayMode: null,
        clientFinancialSummaryEnabled: null,
        clientManagerVisible: null,
      }),
    ).rejects.toThrow();
    await saveClientPreferences(f.owner, {
      projectId: f.project.id,
      clientTaxDisplayMode: null,
      clientFinancialSummaryEnabled: null,
      clientManagerVisible: null,
    });
    const company = await db.settings.findUniqueOrThrow({ where: { id: 'company' } });
    expect((await clientPreview(f.owner, f.project.id)).presentation.taxDisplayMode).toBe(
      company.clientTaxDisplayMode,
    );
  });
  it('does not infer missing historical contract tax or disclose another client adjustment through totals', async () => {
    const f = await fixture();
    await db.project.update({ where: { id: f.project.id }, data: { contractAmount: 99999 } });
    expect((await clientPreview(f.owner, f.project.id, f.ca.id)).financialSummary).toBeNull();
    await db.project.update({ where: { id: f.project.id }, data: { contractAmount: 100000 } });
    await db.contractAdjustment.create({
      data: {
        projectId: f.project.id,
        changeOrderId: f.change.changeOrderId,
        revisionId: f.change.id,
        amount: 27000,
      },
    });
    const summary = (await clientPreview(f.owner, f.project.id, f.ca.id)).financialSummary;
    expect(summary?.current.total).toBe('143510.00');
    expect(summary?.approvedChanges.total).toBe('30510.00');
    expect((await clientPreview(f.owner, f.project.id, f.cb.id)).financialSummary).toBeNull();
    expect((await clientPreview(f.owner, f.project.id)).financialSummary).toBeNull();
  });
  it('preview never writes approvals, decisions, reads, messages or ledger effects', async () => {
    const f = await fixture();
    const before = [
      await db.clientApproval.count(),
      await db.selectionDecision.count(),
      await db.projectMessage.count(),
      await db.contractAdjustment.count(),
      await db.conversationRead.count(),
    ];
    const preview = await clientPreview(f.owner, f.project.id, f.ca.id);
    for (const path of ['selection-decision', 'change-order-approval', 'messages', 'read'])
      await expect(dispatchClient(f.owner, false, path, {}, {})).rejects.toThrow();
    await expect(
      dispatchClientManagement(f.owner, false, 'preview', { projectId: f.project.id }, {}),
    ).rejects.toThrow();
    await expect(
      approveClientChangeOrder(f.owner, {
        projectId: f.project.id,
        revisionId: f.change.id,
        documentHash: preview.changeOrders[0].documentHash,
        action: 'APPROVE',
        typedName: 'Staff',
      }),
    ).rejects.toThrow();
    expect([
      await db.clientApproval.count(),
      await db.selectionDecision.count(),
      await db.projectMessage.count(),
      await db.contractAdjustment.count(),
      await db.conversationRead.count(),
    ]).toEqual(before);
  });
  it('requires a fresh approval review when tax presentation changes', async () => {
    const f = await fixture();
    const old = await clientProject(f.a, f.project.id);
    await saveClientPreferences(f.owner, {
      projectId: f.project.id,
      clientTaxDisplayMode: 'SHOW_TAX_BREAKDOWN',
      clientFinancialSummaryEnabled: true,
      clientManagerVisible: false,
    });
    await expect(
      approveClientChangeOrder(f.a, {
        projectId: f.project.id,
        revisionId: f.change.id,
        documentHash: old.changeOrders[0].documentHash,
        action: 'DECLINE',
        typedName: 'Client A',
      }),
    ).rejects.toThrow(/changed/);
    const current = await clientProject(f.a, f.project.id);
    await approveClientChangeOrder(f.a, {
      projectId: f.project.id,
      revisionId: f.change.id,
      documentHash: current.changeOrders[0].documentHash,
      action: 'DECLINE',
      typedName: 'Client A',
    });
    expect(
      (await db.clientApproval.findUniqueOrThrow({ where: { revisionId: f.change.id } })).snapshot,
    ).toHaveProperty('taxDisplayMode', 'SHOW_TAX_BREAKDOWN');
  });
  it('reports a tax-free fixed contract plus an accepted adjustment without cost-ledger fields', async () => {
    const f = await fixture(1000000, 50000, 0);
    await db.contractAdjustment.create({
      data: {
        projectId: f.project.id,
        changeOrderId: f.change.changeOrderId,
        revisionId: f.change.id,
        amount: 50000,
      },
    });
    const shown = await clientPreview(f.owner, f.project.id, f.ca.id);
    expect(shown.financialSummary).toEqual({
      original: { total: '1000000.00' },
      approvedChanges: { total: '50000.00' },
      current: { total: '1050000.00' },
    });
  });
  it('formats client amounts using recorded tax without cost fields', () => {
    expect(clientPrice(27000, 3510, 30510, 'FINAL_TOTAL_ONLY')).toEqual({ total: '30510.00' });
    expect(clientPrice(27000, 3510, 30510, 'SHOW_TAX_BREAKDOWN')).toEqual({
      subtotal: '27000.00',
      tax: '3510.00',
      total: '30510.00',
    });
  });
});
