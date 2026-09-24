import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import {
  manageClientAccess,
  requireClientProjectAccess,
  clientFile,
} from '../src/lib/client-access';
import { clientProject, clientProjects } from '../src/lib/client-projections';
import {
  saveAllowance,
  allowanceSchema,
  saveSelection,
  selectionSchema,
  selectionAction,
  decideSelection,
  decisionSchema,
} from '../src/lib/selections';
import { approveClientChangeOrder, clientApprovalSchema } from '../src/lib/client-approvals';
import { changeOrderAction } from '../src/lib/change-orders';
import { transitionSchema } from '../src/lib/financial-documents';
import { conversations, sendProjectMessage, messageSchema } from '../src/lib/client-messages';
import {
  dispatchClient,
  dispatchClientManagement,
  publicationSchema,
  publishClientContent,
} from '../src/lib/client-api';
import { jobCost } from '../src/lib/financial';
import { can } from '../src/lib/permissions';
import { resetPassword } from '../src/lib/auth';
import { sendEmail } from '../src/lib/email';
vi.mock('../src/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  appUrl: () => 'http://localhost:3000',
}));
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  process.env.APP_SECRET = 'phase5-integration-test-secret-not-for-production';
});
afterAll(() => db.$disconnect());
async function fixture(price = '14500') {
  const key = randomUUID();
  const owner = await db.user.create({
    data: {
      email: `owner-${key}@example.test`,
      firstName: 'Owner',
      lastName: 'Test',
      roles: ['OWNER'],
    },
  });
  const client = await db.user.create({
    data: {
      email: `client-${key}@example.test`,
      firstName: 'Client',
      lastName: 'Test',
      roles: ['CLIENT'],
    },
  });
  const contact = await db.contact.create({
    data: {
      firstName: 'Client',
      lastName: 'Test',
      email: client.email,
      types: ['CLIENT'],
      portalUserId: client.id,
    },
  });
  const project = await db.project.create({
    data: {
      number: key,
      name: 'Client project',
      contractAmount: 20000,
      internalNotes: 'PRIVATE-PROJECT',
      contacts: { create: { contactId: contact.id, role: 'CLIENT' } },
    },
  });
  const code = await db.costCode.create({
    data: { code: key, name: 'Fixtures', type: 'MATERIAL' },
  });
  await db.budget.create({
    data: {
      projectId: project.id,
      name: 'Contract budget',
      versions: {
        create: [1, 2].map((version) => ({
          version,
          type: version === 1 ? 'ORIGINAL' : 'CURRENT',
          createdById: owner.id,
          lines: {
            create: {
              costCodeId: code.id,
              costCodeSnapshot: key,
              costCodeNameSnapshot: 'Fixtures',
              costType: 'MATERIAL',
              description: 'Fixtures',
              amount: 8000,
            },
          },
        })),
      },
    },
  });
  await manageClientAccess(owner, project.id, contact.id, 'invite');
  const allowance = await saveAllowance(
    owner,
    allowanceSchema.parse({
      projectId: project.id,
      name: 'Fixtures allowance',
      amount: '12000',
      includedCost: '8000',
      costCodeId: code.id,
      costType: 'MATERIAL',
    }),
  );
  const cost = price === '10000' ? '7000' : price === '12000' ? '8000' : '9800';
  const selection = await saveSelection(
    owner,
    selectionSchema.parse({
      projectId: project.id,
      title: 'Kitchen fixtures',
      category: 'Plumbing',
      description: 'Choose your fixtures',
      internalNotes: 'PRIVATE-SELECTION',
      allowanceId: allowance.id,
      options: [
        {
          name: 'Brushed brass',
          costCodeId: code.id,
          costType: 'MATERIAL',
          quantity: '1',
          unit: 'each',
          unitCost: cost,
          markupMethod: 'FIXED',
          markupValue: String(Number(price) - Number(cost)),
        },
      ],
    }),
  );
  return { owner, client, contact, project, code, allowance, selection };
}
async function publishAndDecide(f: Awaited<ReturnType<typeof fixture>>) {
  await selectionAction(f.owner, f.selection.id, 1, 'publish');
  const dto = await clientProject(f.client, f.project.id),
    s = dto.selections[0];
  const input = decisionSchema.parse({
    projectId: f.project.id,
    selectionId: s.id,
    optionId: s.options[0].id,
    expectedVersion: s.version,
    comments: 'My choice',
  });
  await Promise.all([decideSelection(f.client, input), decideSelection(f.client, input)]);
  return input;
}
async function issue(f: Awaited<ReturnType<typeof fixture>>) {
  const s = await db.selection.findUniqueOrThrow({ where: { id: f.selection.id } });
  let rev = await db.changeOrderRevision.findFirstOrThrow({
    where: { changeOrderId: s.changeOrderId! },
  });
  for (const action of ['review', 'approve', 'issue'])
    rev = await changeOrderAction(
      f.owner,
      transitionSchema.parse({ id: rev.id, expectedVersion: rev.version, action }),
    );
  return (await clientProject(f.client, f.project.id)).changeOrders.find((c) => c.id === rev.id)!;
}
describe('Phase 5 financial approvals', () => {
  it.each([
    ['14500', '2500', '1800', '22500', '9800'],
    ['10000', '-2000', '-1000', '18000', '7000'],
  ])(
    'applies selection price %s only as an allowance difference',
    async (price, variance, costDelta, contract, budget) => {
      const f = await fixture(price);
      const input = await publishAndDecide(f);
      const s = await db.selection.findUniqueOrThrow({
        where: { id: f.selection.id },
        include: { decisions: true },
      });
      expect(JSON.parse(JSON.stringify(s.decisions[0].snapshot)).variance).toBe(variance);
      const rev = await db.changeOrderRevision.findFirstOrThrow({
        where: { changeOrderId: s.changeOrderId! },
      });
      expect(rev.subtotal.toString()).toBe(variance);
      expect(rev.costTotal.toString()).toBe(costDelta);
      expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(0);
      await decideSelection(f.client, input);
      expect(await db.selectionDecision.count({ where: { selectionId: s.id } })).toBe(1);
      const shown = await issue(f);
      expect(shown.document.tax).toBe(price === '10000' ? '-260' : '325');
      const approval = clientApprovalSchema.parse({
        projectId: f.project.id,
        revisionId: shown.id,
        documentHash: shown.documentHash,
        action: 'APPROVE',
        typedName: 'Client Test',
      });
      await Promise.all([
        approveClientChangeOrder(f.client, approval),
        approveClientChangeOrder(f.client, approval),
      ]);
      await approveClientChangeOrder(f.client, approval);
      expect(await db.clientApproval.count({ where: { revisionId: shown.id } })).toBe(1);
      expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(1);
      expect(await db.budgetVersion.count({ where: { changeOrderRevisionId: shown.id } })).toBe(1);
      const report = await jobCost(f.owner, f.project.id);
      expect(JSON.stringify(report)).toContain(contract);
      const versions = await db.budgetVersion.findMany({
        where: { budget: { projectId: f.project.id } },
        include: { lines: true },
        orderBy: { version: 'asc' },
      });
      expect(versions[0].lines[0].amount.toString()).toBe('8000');
      expect(versions[2].lines[0].amount.toString()).toBe(budget);
      expect((await db.selection.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(
        'APPROVED',
      );
      await expect(
        db.clientApproval.updateMany({
          where: { revisionId: shown.id },
          data: { typedName: 'Rewritten' },
        }),
      ).rejects.toThrow();
      await expect(
        db.selectionDecision.updateMany({
          where: { selectionId: s.id },
          data: { comments: 'Rewritten' },
        }),
      ).rejects.toThrow();
      await expect(
        db.selectionOption.update({ where: { id: input.optionId }, data: { name: 'Rewritten' } }),
      ).rejects.toThrow();
    },
  );
  it('approves a zero variance without changing any ledger', async () => {
    const f = await fixture('12000');
    await publishAndDecide(f);
    const s = await db.selection.findUniqueOrThrow({ where: { id: f.selection.id } });
    expect(s.status).toBe('APPROVED');
    expect(s.changeOrderId).toBeNull();
    expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(0);
    await expect(selectionAction(f.owner, s.id, s.version, 'unpublish')).rejects.toThrow();
  });
  it('records a decline with no financial effects and rejects a stale document hash', async () => {
    const f = await fixture();
    await publishAndDecide(f);
    const shown = await issue(f);
    const input = clientApprovalSchema.parse({
      projectId: f.project.id,
      revisionId: shown.id,
      documentHash: '0'.repeat(64),
      action: 'DECLINE',
      typedName: 'Client Test',
    });
    await expect(approveClientChangeOrder(f.client, input)).rejects.toThrow(/changed/);
    await approveClientChangeOrder(f.client, { ...input, documentHash: shown.documentHash });
    expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(
      (await db.changeOrderRevision.findUniqueOrThrow({ where: { id: shown.id } })).status,
    ).toBe('REJECTED');
  });
});
describe('Phase 5 client isolation and allowlists', () => {
  it('omits drafts, private fields and raw snapshot metadata', async () => {
    const f = await fixture();
    expect((await clientProject(f.client, f.project.id)).selections).toHaveLength(0);
    await publishAndDecide(f);
    await issue(f);
    await db.dailyLog.create({
      data: {
        projectId: f.project.id,
        authorId: f.owner.id,
        date: new Date(),
        clientVisible: true,
        clientSummary: 'Good progress',
        manpowerNotes: 'PRIVATE-MANPOWER',
        workCompleted: 'PRIVATE-WORK',
        delaysIssues: 'PRIVATE-DELAY',
      },
    });
    await db.projectTask.create({
      data: {
        projectId: f.project.id,
        createdById: f.owner.id,
        name: 'PRIVATE-TASK',
        description: 'PRIVATE-DESCRIPTION',
        clientVisible: true,
        clientTitle: 'Framing milestone',
      },
    });
    const dto = JSON.stringify(await clientProject(f.client, f.project.id));
    for (const forbidden of [
      'unitCost',
      'estimatedCost',
      'markup',
      'markupValue',
      'grossMargin',
      'grossProfit',
      'actualCost',
      'committedAmount',
      'consumedAmount',
      'internalNotes',
      'quickBooks',
      'storageKey',
      'passwordHash',
      'PRIVATE-',
    ])
      expect(dto).not.toContain(forbidden);
    expect(dto).toContain('Good progress');
    expect(dto).toContain('Framing milestone');
    expect((await clientProjects(f.client)).map((p) => p.id)).toEqual([f.project.id]);
    await expect(
      dispatchClientManagement(f.client, true, 'selections', { projectId: f.project.id }, null),
    ).rejects.toThrow();
    await db.userCapability.create({
      data: { userId: f.client.id, capability: 'PROJECT_VIEW_ALL', granted: true },
    });
    expect(await can(f.client, 'PROJECT_VIEW_ALL')).toBe(false);
  });
  it('rejects every cross-project object and revoked access', async () => {
    const a = await fixture(),
      b = await fixture();
    await selectionAction(b.owner, b.selection.id, 1, 'publish');
    const option = await db.selectionOption.findFirstOrThrow({
      where: { selectionId: b.selection.id },
    });
    await expect(clientProject(a.client, b.project.id)).rejects.toThrow();
    await expect(
      decideSelection(
        a.client,
        decisionSchema.parse({
          projectId: a.project.id,
          selectionId: b.selection.id,
          optionId: option.id,
          expectedVersion: 2,
        }),
      ),
    ).rejects.toThrow();
    await expect(conversations(a.client, b.project.id)).rejects.toThrow();
    const thread = await sendProjectMessage(
      b.owner,
      messageSchema.parse({
        projectId: b.project.id,
        subject: 'Private project',
        body: 'Private message',
        audience: 'CLIENT',
      }),
    );
    await expect(
      sendProjectMessage(
        a.client,
        messageSchema.parse({
          projectId: a.project.id,
          conversationId: thread.id,
          subject: 'Guess',
          body: 'Attempt',
        }),
      ),
    ).rejects.toThrow();
    const file = await db.storedFile.create({
      data: {
        projectId: b.project.id,
        uploaderId: b.owner.id,
        kind: 'PHOTO',
        visibility: 'CLIENT',
        filename: 'photo.png',
        originalFilename: 'photo.png',
        mimeType: 'image/png',
        size: 1,
        storageKey: randomUUID(),
      },
    });
    await expect(clientFile(a.client, file.id)).rejects.toThrow();
    await clientFile(b.client, file.id);
    await db.storedFile.update({ where: { id: file.id }, data: { visibility: 'INTERNAL' } });
    await expect(clientFile(b.client, file.id)).rejects.toThrow();
    await manageClientAccess(a.owner, a.project.id, a.contact.id, 'revoke');
    await expect(requireClientProjectAccess(a.client, a.project.id)).rejects.toThrow();
    expect(await clientProjects(a.client)).toEqual([]);
  });
  it('isolates internal threads, records project conversations and read state', async () => {
    const f = await fixture();
    await sendProjectMessage(
      f.owner,
      messageSchema.parse({
        projectId: f.project.id,
        subject: 'Internal',
        body: 'PRIVATE-INTERNAL',
        audience: 'INTERNAL',
      }),
    );
    const t = await sendProjectMessage(
      f.client,
      messageSchema.parse({
        projectId: f.project.id,
        subject: 'Fixture question',
        body: 'Can we discuss the finish?',
      }),
    );
    const rows = await conversations(f.client, f.project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].messages[0].body).toContain('finish');
    await dispatchClient(f.client, false, 'read', {}, { projectId: f.project.id, id: t.id });
    expect((await conversations(f.client, f.project.id))[0].unread).toBe(false);
  });
  it('requires staff publishing permission and safe update wording', async () => {
    const f = await fixture();
    const field = await db.user.create({
      data: {
        email: randomUUID() + '@example.test',
        firstName: 'Field',
        lastName: 'Test',
        roles: ['FIELD'],
      },
    });
    await expect(
      publishClientContent(
        field,
        publicationSchema.parse({
          projectId: f.project.id,
          id: f.project.id,
          kind: 'project',
          visible: true,
          description: 'Hello',
        }),
      ),
    ).rejects.toThrow();
  });
  it('creates one contact-linked account, sets up securely, resends and reactivates without duplication', async () => {
    const f = await fixture();
    const c = await db.contact.create({
      data: {
        firstName: 'New',
        lastName: 'Client',
        email: randomUUID() + '@example.test',
        types: ['CLIENT'],
      },
    });
    await db.projectContact.create({
      data: { projectId: f.project.id, contactId: c.id, role: 'CLIENT' },
    });
    await manageClientAccess(f.owner, f.project.id, c.id, 'invite');
    const linked = await db.contact.findUniqueOrThrow({ where: { id: c.id } });
    expect(linked.portalUserId).toBeTruthy();
    const mail = vi.mocked(sendEmail).mock.calls.at(-1)![0];
    const token = new URL(mail.text.match(/http:\/\/\S+/)![0]).searchParams.get('token')!;
    await resetPassword(token, 'a-long-secure-client-test-password');
    await expect(resetPassword(token, 'a-long-secure-client-test-password')).rejects.toThrow();
    await manageClientAccess(f.owner, f.project.id, c.id, 'revoke');
    await manageClientAccess(f.owner, f.project.id, c.id, 'invite');
    expect((await db.contact.findUniqueOrThrow({ where: { id: c.id } })).portalUserId).toBe(
      linked.portalUserId,
    );
    expect(await db.user.count({ where: { email: c.email! } })).toBe(1);
  });
});

describe('Phase 5 publication and adjustment boundaries', () => {
  it('treats an option without an allowance as full additional scope', async () => {
    const f = await fixture();
    const s = await saveSelection(
      f.owner,
      selectionSchema.parse({
        projectId: f.project.id,
        title: 'Extra appliance',
        category: 'Appliances',
        options: [
          {
            name: 'Oven',
            costCodeId: f.code.id,
            costType: 'MATERIAL',
            quantity: '1',
            unit: 'each',
            unitCost: '3000',
            markupMethod: 'FIXED',
            markupValue: '2000',
          },
        ],
      }),
    );
    await selectionAction(f.owner, s.id, 1, 'publish');
    const visible = (await clientProject(f.client, f.project.id)).selections.find(
      (x) => x.id === s.id,
    )!;
    await decideSelection(
      f.client,
      decisionSchema.parse({
        projectId: f.project.id,
        selectionId: s.id,
        optionId: visible.options[0].id,
        expectedVersion: visible.version,
      }),
    );
    const saved = await db.selection.findUniqueOrThrow({ where: { id: s.id } });
    const co = await db.changeOrderRevision.findFirstOrThrow({
      where: { changeOrderId: saved.changeOrderId! },
    });
    expect(co.subtotal.toString()).toBe('5000');
    expect(co.costTotal.toString()).toBe('3000');
  });
  it('rejects stale publication versions and avoids notification creation on reads', async () => {
    const f = await fixture();
    await selectionAction(f.owner, f.selection.id, 1, 'publish');
    const s = (await clientProject(f.client, f.project.id)).selections[0];
    await selectionAction(f.owner, s.id, s.version, 'unpublish');
    expect((await clientProject(f.client, f.project.id)).selections).toHaveLength(0);
    await selectionAction(f.owner, s.id, s.version + 1, 'publish');
    await expect(
      decideSelection(
        f.client,
        decisionSchema.parse({
          projectId: f.project.id,
          selectionId: s.id,
          optionId: s.options[0].id,
          expectedVersion: s.version,
        }),
      ),
    ).rejects.toThrow(/changed/);
    const count = await db.notification.count({ where: { projectId: f.project.id } });
    await clientProject(f.client, f.project.id);
    await clientProject(f.client, f.project.id);
    expect(await db.notification.count({ where: { projectId: f.project.id } })).toBe(count);
  });
  it('denies cross-project and other named-client change order approvals', async () => {
    const a = await fixture(),
      b = await fixture();
    await publishAndDecide(b);
    const shown = await issue(b);
    const input = clientApprovalSchema.parse({
      projectId: a.project.id,
      revisionId: shown.id,
      documentHash: shown.documentHash,
      action: 'APPROVE',
      typedName: 'Wrong client',
    });
    await expect(approveClientChangeOrder(a.client, input)).rejects.toThrow();
    await db.projectContact.create({
      data: { projectId: b.project.id, contactId: a.contact.id, role: 'CLIENT' },
    });
    await manageClientAccess(b.owner, b.project.id, a.contact.id, 'invite');
    expect((await clientProject(a.client, b.project.id)).changeOrders).toHaveLength(0);
    await expect(
      approveClientChangeOrder(a.client, { ...input, projectId: b.project.id }),
    ).rejects.toThrow();
    expect(await db.contractAdjustment.count({ where: { projectId: b.project.id } })).toBe(0);
  });
  it('rolls back approval evidence when a credit would make its budget negative', async () => {
    const f = await fixture('10000');
    await publishAndDecide(f);
    const s = await db.selection.findUniqueOrThrow({ where: { id: f.selection.id } });
    const revision = await db.changeOrderRevision.findFirstOrThrow({
      where: { changeOrderId: s.changeOrderId! },
    });
    await db.changeOrderLine.updateMany({
      where: { revisionId: revision.id },
      data: { unitCost: -9000, markupValue: 7000 },
    });
    await db.changeOrderRevision.update({ where: { id: revision.id }, data: { costTotal: -9000 } });
    const shown = await issue(f);
    await expect(
      approveClientChangeOrder(
        f.client,
        clientApprovalSchema.parse({
          projectId: f.project.id,
          revisionId: shown.id,
          documentHash: shown.documentHash,
          action: 'APPROVE',
          typedName: 'Client Test',
        }),
      ),
    ).rejects.toThrow(/budget/);
    expect(await db.clientApproval.count({ where: { revisionId: shown.id } })).toBe(0);
    expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(0);
  });
});
