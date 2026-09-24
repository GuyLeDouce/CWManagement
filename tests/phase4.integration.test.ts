import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import {
  savePurchasing,
  purchasingSchema,
  purchasingAction,
  purchasingList,
} from '../src/lib/purchasing';
import {
  saveChangeOrder,
  changeOrderSchema,
  changeOrderAction,
  changeOrderList,
} from '../src/lib/change-orders';
import { createActualCost, actualCostSchema, jobCost } from '../src/lib/financial';
import { reverseActual, reconcileActual } from '../src/lib/commitments';
import { transitionSchema } from '../src/lib/financial-documents';
import {
  project,
  companySchema,
  saveCompany,
  contactSchema,
  saveContact,
} from '../src/lib/management';
import { projectActivity } from '../src/lib/operations';
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Dedicated _test database required.');
  process.env.APP_SECRET = 'integration-only-phase4-secret-not-for-deployment';
});
afterAll(() => db.$disconnect());
async function fixture() {
  const key = randomUUID();
  const owner = await db.user.create({
    data: {
      firstName: 'Owner',
      lastName: 'Phase4',
      email: key + '@example.test',
      roles: ['OWNER'],
    },
  });
  const pm = await db.user.create({
    data: {
      firstName: 'PM',
      lastName: 'Phase4',
      email: 'pm-' + key + '@example.test',
      roles: ['PROJECT_MANAGER'],
    },
  });
  const field = await db.user.create({
    data: {
      firstName: 'Field',
      lastName: 'Phase4',
      email: 'field-' + key + '@example.test',
      roles: ['FIELD'],
    },
  });
  const company = await db.company.create({
    data: { name: 'Trade ' + key, address: 'Original vendor address' },
  });
  const vendor = await db.contact.create({
    data: {
      firstName: 'Vendor',
      lastName: key,
      types: ['VENDOR', 'SUBTRADE'],
      companyId: company.id,
      email: 'vendor@example.test',
    },
  });
  const client = await db.contact.create({
    data: { firstName: 'Client', lastName: key, types: ['CLIENT'] },
  });
  const project = await db.project.create({
    data: {
      name: 'Phase4 ' + key,
      number: 'P4-' + key,
      contractAmount: '12000',
      address: 'Original project address',
      assignments: {
        create: [
          { userId: pm.id, role: 'PRIMARY_PROJECT_MANAGER' },
          { userId: field.id, role: 'FIELD_STAFF' },
        ],
      },
      contacts: { create: { contactId: client.id, role: 'CLIENT' } },
    },
  });
  const code = await db.costCode.create({
    data: { code: key, name: 'Electrical', type: 'SUBCONTRACT' },
  });
  const budget = await db.budget.create({
    data: {
      projectId: project.id,
      name: 'Initial budget',
      versions: {
        create: [1, 2].map((version) => ({
          version,
          type: version === 1 ? 'ORIGINAL' : 'CURRENT',
          createdById: owner.id,
          lines: {
            create: {
              costCodeId: code.id,
              costCodeSnapshot: code.code,
              costCodeNameSnapshot: code.name,
              costType: 'SUBCONTRACT',
              description: 'Electrical',
              amount: '10000',
            },
          },
        })),
      },
    },
  });
  const line = {
    costCodeId: code.id,
    costType: 'SUBCONTRACT',
    description: 'Electrical scope',
    quantity: '1',
    unit: 'LS',
    unitCost: '10000',
    taxable: true,
    sortOrder: 0,
  };
  const poData = {
    projectId: project.id,
    type: 'PURCHASE_ORDER',
    vendorContactId: vendor.id,
    title: 'Electrical purchase',
    lines: [line],
  };
  const coData = {
    projectId: project.id,
    clientId: client.id,
    title: 'Added electrical',
    scope: 'Additional outlets',
    lines: [
      {
        ...line,
        unitCost: '2000',
        clientDescription: 'Additional electrical',
        markupMethod: 'PERCENT_ON_COST',
        markupValue: '35',
      },
    ],
  };
  return { owner, pm, field, project, company, vendor, client, code, budget, line, poData, coData };
}
async function poAction(
  f: Awaited<ReturnType<typeof fixture>>,
  id: string,
  action: string,
  extra = {},
) {
  const r = await db.purchasingRevision.findUniqueOrThrow({ where: { id } });
  return purchasingAction(
    f.owner,
    transitionSchema.parse({ id, expectedVersion: r.version, action, ...extra }),
  );
}
async function coAction(
  f: Awaited<ReturnType<typeof fixture>>,
  id: string,
  action: string,
  extra = {},
) {
  const r = await db.changeOrderRevision.findUniqueOrThrow({ where: { id } });
  return changeOrderAction(
    f.owner,
    transitionSchema.parse({ id, expectedVersion: r.version, action, ...extra }),
  );
}
async function issuePO(f: Awaited<ReturnType<typeof fixture>>, type = 'PURCHASE_ORDER') {
  const r = await savePurchasing(f.owner, purchasingSchema.parse({ ...f.poData, type }));
  await poAction(f, r.id, 'review');
  await poAction(f, r.id, 'approve');
  await poAction(f, r.id, 'issue');
  const ledger = await db.commitment.findUniqueOrThrow({
    where: { purchasingDocumentId: r.documentId },
    include: { lines: true },
  });
  return { r, ledger };
}
async function invoice(f: Awaited<ReturnType<typeof fixture>>, lineId: string, amount: string) {
  return createActualCost(
    f.owner,
    actualCostSchema.parse({
      projectId: f.project.id,
      costCodeId: f.code.id,
      costType: 'SUBCONTRACT',
      commitmentLineId: lineId,
      amount,
      transactionDate: '2026-09-24',
      description: 'Invoice test',
    }),
  );
}
describe('Phase 4 purchasing ledger', () => {
  it('keeps draft and approved documents out of exposure; issues multiple lines once', async () => {
    const f = await fixture();
    const r = await savePurchasing(
      f.owner,
      purchasingSchema.parse({
        ...f.poData,
        lines: [f.line, { ...f.line, unitCost: '2500', sortOrder: 1 }],
      }),
    );
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toFixed(2)).toBe('0.00');
    await poAction(f, r.id, 'review');
    await poAction(f, r.id, 'approve');
    expect(await db.commitment.count({ where: { projectId: f.project.id } })).toBe(0);
    await poAction(f, r.id, 'issue');
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toFixed(2)).toBe('12500.00');
    await expect(poAction(f, r.id, 'issue')).rejects.toThrow('approved');
    expect(await db.commitment.count({ where: { projectId: f.project.id } })).toBe(1);
    expect(
      await db.notification.count({ where: { userId: f.pm.id, projectId: f.project.id } }),
    ).toBeGreaterThan(0);
  });
  it('consumes 4k of 10k without double counting, fulfills, then restores consumption on reversal', async () => {
    const f = await fixture(),
      { r, ledger } = await issuePO(f);
    const first = await invoice(f, ledger.lines[0].id, '4000');
    let report = await jobCost(f.owner, f.project.id);
    expect(report.totals.committed.toString()).toBe('6000');
    expect(report.totals.actual.toString()).toBe('4000');
    expect(report.totals.forecast.toString()).toBe('10000');
    expect((await db.purchasingRevision.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'PARTIALLY_FULFILLED',
    );
    const second = await invoice(f, ledger.lines[0].id, '6000');
    expect((await db.commitment.findUniqueOrThrow({ where: { id: ledger.id } })).status).toBe(
      'FULFILLED',
    );
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toString()).toBe('0');
    await reverseActual(f.owner, { id: second.id, reason: 'Duplicate vendor invoice' });
    report = await jobCost(f.owner, f.project.id);
    expect(report.totals.committed.toString()).toBe('6000');
    expect(report.totals.actual.toString()).toBe('4000');
    await expect(reverseActual(f.owner, { id: second.id, reason: 'Again' })).rejects.toThrow(
      'already reversed',
    );
    expect(
      (await db.actualCost.findUniqueOrThrow({ where: { id: first.id } })).reversedAt,
    ).toBeNull();
  });
  it('rejects overages, classification and cross-project mismatches atomically', async () => {
    const f = await fixture(),
      { ledger } = await issuePO(f),
      other = await fixture();
    await expect(invoice(f, ledger.lines[0].id, '10001')).rejects.toThrow('exceeds remaining');
    await expect(invoice(f, ledger.lines[0].id, '10001')).rejects.toThrow('exceeds remaining');
    expect(
      await db.notification.count({
        where: {
          userId: f.owner.id,
          entityType: 'CommitmentOverage',
          entityId: ledger.lines[0].id,
          readAt: null,
        },
      }),
    ).toBe(1);
    await expect(invoice(other, ledger.lines[0].id, '100')).rejects.toThrow('this project');
    await expect(
      createActualCost(
        f.owner,
        actualCostSchema.parse({
          projectId: f.project.id,
          costCodeId: f.code.id,
          costType: 'MATERIAL',
          commitmentLineId: ledger.lines[0].id,
          amount: '50',
          transactionDate: '2026-09-24',
          description: 'Wrong type',
        }),
      ),
    ).rejects.toThrow('classification');
    expect(await db.actualCost.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(
      (
        await db.commitmentLine.findUniqueOrThrow({ where: { id: ledger.lines[0].id } })
      ).consumedAmount.toString(),
    ).toBe('0');
  });
  it('serializes competing invoices and prevents double consumption', async () => {
    const f = await fixture(),
      { ledger } = await issuePO(f);
    const result = await Promise.allSettled([
      invoice(f, ledger.lines[0].id, '6000'),
      invoice(f, ledger.lines[0].id, '6000'),
    ]);
    expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await db.commitmentLine.findUniqueOrThrow({ where: { id: ledger.lines[0].id } })
      ).consumedAmount.toString(),
    ).toBe('6000');
    expect(await db.actualCost.count({ where: { projectId: f.project.id } })).toBe(1);
  });
  it('preserves issued snapshots and stable actual links through revisions and cancellation', async () => {
    const f = await fixture(),
      { r, ledger } = await issuePO(f, 'WORK_ORDER');
    const actual = await invoice(f, ledger.lines[0].id, '4000');
    const original = await db.purchasingRevision.findUniqueOrThrow({ where: { id: r.id } });
    await db.company.update({ where: { id: f.company.id }, data: { address: 'New address' } });
    const copy = await poAction(f, r.id, 'revise');
    const lines = await db.purchasingLine.findMany({ where: { revisionId: copy.id } });
    await savePurchasing(
      f.owner,
      purchasingSchema.parse({
        ...f.poData,
        type: 'WORK_ORDER',
        id: copy.id,
        expectedVersion: copy.version,
        lines: [{ ...f.line, lineKey: lines[0].lineKey, unitCost: '12000' }],
      }),
    );
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toString()).toBe('6000');
    await poAction(f, copy.id, 'review');
    await poAction(f, copy.id, 'approve');
    await poAction(f, copy.id, 'issue');
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toString()).toBe('8000');
    expect(
      (await db.actualCost.findUniqueOrThrow({ where: { id: actual.id } })).commitmentLineId,
    ).toBe(ledger.lines[0].id);
    expect(
      (await db.purchasingRevision.findUniqueOrThrow({ where: { id: r.id } })).snapshot,
    ).toEqual(original.snapshot);
    await expect(
      db.purchasingRevision.update({ where: { id: r.id }, data: { title: 'Tampered' } }),
    ).rejects.toThrow();
    await expect(
      db.purchasingLine.updateMany({ where: { revisionId: r.id }, data: { unitCost: 1 } }),
    ).rejects.toThrow();
    await poAction(f, copy.id, 'cancel', { reason: 'Remaining scope no longer needed' });
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toString()).toBe('0');
    expect((await jobCost(f.owner, f.project.id)).totals.actual.toString()).toBe('4000');
    await reverseActual(f.owner, { id: actual.id, reason: 'Invoice voided by vendor' });
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toString()).toBe('0');
  });
  it('rejects reducing a revised line below already consumed amounts', async () => {
    const f = await fixture(),
      { r, ledger } = await issuePO(f);
    await invoice(f, ledger.lines[0].id, '4000');
    const copy = await poAction(f, r.id, 'revise'),
      lines = await db.purchasingLine.findMany({ where: { revisionId: copy.id } });
    await savePurchasing(
      f.owner,
      purchasingSchema.parse({
        ...f.poData,
        id: copy.id,
        expectedVersion: copy.version,
        lines: [{ ...f.line, lineKey: lines[0].lineKey, unitCost: '3000' }],
      }),
    );
    await poAction(f, copy.id, 'review');
    await poAction(f, copy.id, 'approve');
    await expect(poAction(f, copy.id, 'issue')).rejects.toThrow('below consumed');
    expect((await jobCost(f.owner, f.project.id)).totals.committed.toString()).toBe('6000');
  });
  it('reconciles an existing actual exactly once', async () => {
    const f = await fixture(),
      { ledger } = await issuePO(f);
    const actual = await createActualCost(
      f.owner,
      actualCostSchema.parse({
        projectId: f.project.id,
        costCodeId: f.code.id,
        costType: 'SUBCONTRACT',
        amount: '4000',
        transactionDate: '2026-09-24',
        description: 'Unlinked invoice',
      }),
    );
    await reconcileActual(f.owner, { id: actual.id, commitmentLineId: ledger.lines[0].id });
    await expect(
      reconcileActual(f.owner, { id: actual.id, commitmentLineId: ledger.lines[0].id }),
    ).rejects.toThrow('unreconciled');
    expect((await jobCost(f.owner, f.project.id)).totals.forecast.toString()).toBe('10000');
  });
});
describe('Phase 4 change orders and authorization', () => {
  it('uses editable contact/company identities, validates vendor activity, and protects generic project responses', async () => {
    const f = await fixture();
    await saveCompany(
      f.owner,
      companySchema.parse({
        id: f.company.id,
        name: f.company.name,
        active: false,
        address: 'Updated address',
      }),
    );
    await expect(savePurchasing(f.owner, purchasingSchema.parse(f.poData))).rejects.toThrow(
      'active contact and company',
    );
    await saveCompany(
      f.owner,
      companySchema.parse({
        id: f.company.id,
        name: f.company.name,
        active: true,
        address: 'Updated address',
      }),
    );
    await saveContact(
      f.owner,
      contactSchema.parse({
        id: f.vendor.id,
        firstName: 'Inactive',
        lastName: 'Vendor',
        companyId: f.company.id,
        types: ['VENDOR'],
        active: false,
      }),
    );
    await expect(savePurchasing(f.owner, purchasingSchema.parse(f.poData))).rejects.toThrow(
      'active contact',
    );
    expect((await project(f.field, f.project.id)).contractAmount).toBeNull();
    await db.auditLog.create({
      data: {
        actorId: f.owner.id,
        projectId: f.project.id,
        action: 'TEST',
        entity: 'Project',
        entityId: f.project.id,
        description: 'Project updated.',
        before: { sensitivePrice: '999' },
      },
    });
    expect(JSON.stringify(await projectActivity(f.field, f.project.id))).not.toContain(
      'sensitivePrice',
    );
    expect(JSON.stringify((await project(f.field, f.project.id)).activity)).not.toContain(
      'sensitivePrice',
    );
  });
  it('accepts client price and internal costs separately and updates the normalized report exactly once', async () => {
    const f = await fixture(),
      { ledger } = await issuePO(f);
    await invoice(f, ledger.lines[0].id, '4000');
    const r = await saveChangeOrder(f.owner, changeOrderSchema.parse(f.coData));
    expect(r.costTotal.toString()).toBe('2000');
    expect(r.subtotal.toString()).toBe('2700');
    expect(r.taxAmount.toString()).toBe('351');
    expect(r.total.toString()).toBe('3051');
    await coAction(f, r.id, 'review');
    await coAction(f, r.id, 'approve');
    await coAction(f, r.id, 'issue');
    const issued = await db.changeOrderRevision.findUniqueOrThrow({ where: { id: r.id } });
    expect(JSON.stringify(issued.snapshot)).not.toContain('unitCost');
    expect(JSON.stringify(issued.snapshot)).not.toContain('markup');
    await db.project.update({
      where: { id: f.project.id },
      data: { address: 'New project address' },
    });
    await coAction(f, r.id, 'accept', {
      acceptedByName: 'Client Person',
      acceptanceReference: 'Email approval 2026-09-24',
    });
    const report = await jobCost(f.owner, f.project.id);
    expect(report.summary.originalContract.toString()).toBe('12000');
    expect(report.summary.approvedChanges.toString()).toBe('2700');
    expect(report.summary.contract.toString()).toBe('14700');
    expect(report.totals.original.toString()).toBe('10000');
    expect(report.totals.current.toString()).toBe('12000');
    expect(report.totals.committed.toString()).toBe('6000');
    expect(report.totals.actual.toString()).toBe('4000');
    expect(report.totals.forecast.toString()).toBe('12000');
    expect(report.summary.forecastProfit?.toString()).toBe('2700');
    expect(
      (await db.changeOrderRevision.findUniqueOrThrow({ where: { id: r.id } })).snapshot,
    ).toEqual(issued.snapshot);
    await expect(
      coAction(f, r.id, 'accept', { acceptedByName: 'Again', acceptanceReference: 'Again' }),
    ).rejects.toThrow('immutable');
    await expect(coAction(f, r.id, 'revise')).rejects.toThrow('immutable');
    expect(await db.budgetVersion.count({ where: { budgetId: f.budget.id } })).toBe(3);
    expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(1);
    await expect(
      db.project.update({ where: { id: f.project.id }, data: { contractAmount: 1 } }),
    ).rejects.toThrow();
    expect((await jobCost(f.pm, f.project.id)).summary.forecastProfit).toBeNull();
  });
  it('preserves issued change order history and rejects superseded acceptance', async () => {
    const f = await fixture(),
      r = await saveChangeOrder(f.owner, changeOrderSchema.parse(f.coData));
    await coAction(f, r.id, 'review');
    await coAction(f, r.id, 'approve');
    await coAction(f, r.id, 'issue');
    const original = await db.changeOrderRevision.findUniqueOrThrow({ where: { id: r.id } });
    const copy = await coAction(f, r.id, 'revise');
    await saveChangeOrder(
      f.owner,
      changeOrderSchema.parse({
        ...f.coData,
        id: copy.id,
        expectedVersion: copy.version,
        title: 'Revised scope',
      }),
    );
    expect(
      (await db.changeOrderRevision.findUniqueOrThrow({ where: { id: r.id } })).snapshot,
    ).toEqual(original.snapshot);
    await expect(
      coAction(f, r.id, 'accept', { acceptedByName: 'Client', acceptanceReference: 'Email' }),
    ).rejects.toThrow('latest revision');
    await expect(
      db.changeOrderLine.updateMany({
        where: { revisionId: r.id },
        data: { description: 'Tampered' },
      }),
    ).rejects.toThrow();
  });
  it('rolls back acceptance when no approved budget exists and handles simultaneous acceptance once', async () => {
    const f = await fixture(),
      r = await saveChangeOrder(f.owner, changeOrderSchema.parse(f.coData));
    await coAction(f, r.id, 'review');
    await coAction(f, r.id, 'approve');
    await coAction(f, r.id, 'issue');
    await db.budget.update({ where: { id: f.budget.id }, data: { active: false } });
    await expect(
      coAction(f, r.id, 'accept', { acceptedByName: 'Client', acceptanceReference: 'Email' }),
    ).rejects.toThrow('budget');
    expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(0);
    expect((await db.changeOrderRevision.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'ISSUED',
    );
    await db.budget.update({ where: { id: f.budget.id }, data: { active: true } });
    const version = (await db.changeOrderRevision.findUniqueOrThrow({ where: { id: r.id } }))
      .version;
    const input = transitionSchema.parse({
      id: r.id,
      expectedVersion: version,
      action: 'accept',
      acceptedByName: 'Client',
      acceptanceReference: 'Email',
    });
    const results = await Promise.allSettled([
      changeOrderAction(f.owner, input),
      changeOrderAction(f.owner, input),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await db.contractAdjustment.count({ where: { projectId: f.project.id } })).toBe(1);
  });
  it('enforces capabilities, assigned project scope, and optimistic concurrency', async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(purchasingList(f.field, f.project.id)).rejects.toThrow('access');
    await expect(changeOrderList(f.field, f.project.id)).rejects.toThrow('permission');
    await expect(savePurchasing(f.field, purchasingSchema.parse(f.poData))).rejects.toThrow(
      'permission',
    );
    await expect(savePurchasing(f.pm, purchasingSchema.parse(other.poData))).rejects.toThrow(
      'unavailable',
    );
    const r = await savePurchasing(f.pm, purchasingSchema.parse(f.poData));
    await expect(
      purchasingAction(
        f.pm,
        transitionSchema.parse({ id: r.id, expectedVersion: r.version, action: 'approve' }),
      ),
    ).rejects.toThrow('permission');
    await savePurchasing(
      f.pm,
      purchasingSchema.parse({
        ...f.poData,
        id: r.id,
        expectedVersion: r.version,
        title: 'Edited',
      }),
    );
    await expect(
      savePurchasing(
        f.pm,
        purchasingSchema.parse({ ...f.poData, id: r.id, expectedVersion: r.version }),
      ),
    ).rejects.toThrow('changed');
    await expect(jobCost(f.field, f.project.id)).rejects.toThrow('permission');
  });
});
