import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, transaction } from '../src/lib/db';
import { configure, configureSchema, dashboard } from '../src/lib/quickbooks/admin';
import {
  authenticate,
  sendRequest,
  receiveResponse,
  connectorCallback,
} from '../src/lib/quickbooks/engine';
import { queue, queueSchema } from '../src/lib/quickbooks/queue';
import { stageBill, applyBill } from '../src/lib/quickbooks/bills';
import { buildXml, parseXml, object, XmlNode } from '../src/lib/quickbooks/xml';
import { digest } from '../src/lib/crypto';
import { saveMapping, mappingSchema } from '../src/lib/quickbooks/mapping';
import { savePurchasing, purchasingSchema, purchasingAction } from '../src/lib/purchasing';
import { transitionSchema } from '../src/lib/financial-documents';
import { reconcile } from '../src/lib/quickbooks/admin';
import { jobCost } from '../src/lib/financial';
import listFixtures from './fixtures/quickbooks/lists.json';
import { POST as soapPost } from '../src/app/api/quickbooks/web-connector/route';
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  process.env.APP_SECRET = 'phase7-integration-test-only-secret-32-characters';
  process.env.APP_URL = 'https://cw.example.test';
});
afterAll(() => db.$disconnect());
async function fixture() {
  const key = randomUUID();
  const actor = await db.user.create({
    data: {
      firstName: 'QB',
      lastName: 'Controller',
      email: key + '@example.test',
      roles: ['OWNER'],
    },
  });
  const c = await configure(
    actor,
    configureSchema.parse({ name: 'QB ' + key, username: 'qb-' + key }),
  );
  return { actor, c, key };
}
async function send(ticket: string, path = 'C:\\QB\\Test.qbw') {
  return sendRequest({
    ticket,
    strHCPResponse: '',
    strCompanyFileName: path,
    qbXMLCountry: 'CA',
    qbXMLMajorVers: 16,
    qbXMLMinorVers: 0,
  });
}
function req(xml: string) {
  const msgs = object(object(parseXml(xml).QBXML).QBXMLMsgsRq);
  const op = Object.keys(msgs).find((k) => k.endsWith('Rq'))!;
  return { op, id: String(object(msgs[op])['@_requestID']), data: object(msgs[op]) };
}
function response(xml: string, body: XmlNode = {}, status = '0') {
  const r = req(xml);
  return buildXml({
    QBXML: {
      QBXMLMsgsRs: {
        [r.op.replace('Rq', 'Rs')]: {
          '@_requestID': r.id,
          '@_statusCode': status,
          '@_statusSeverity': status === '0' ? 'Info' : 'Error',
          ...body,
        },
      },
    },
  });
}
async function receive(ticket: string, xml: string, body: XmlNode = {}, status = '0') {
  return receiveResponse({
    ticket,
    response: response(xml, body, status),
    hresult: '',
    message: '',
  });
}
async function bound() {
  const f = await fixture();
  const [ticket] = await authenticate('qb-' + f.key, f.c.password!);
  await receive(ticket, await send(ticket), {
    CompanyRet: { CompanyName: 'Cedar Winds Test ' + f.key, LegalCompanyName: 'CW Test' },
  });
  await configure(
    f.actor,
    configureSchema.parse({
      id: f.c.id,
      name: 'Test',
      username: 'qb-' + f.key,
      confirmCompany: true,
      mode: 'ACTIVE',
      importStartDate: '2026-01-01',
    }),
  );
  return { ...f, ticket };
}
async function mappedProject(f: Awaited<ReturnType<typeof bound>>) {
  const project = await db.project.create({ data: { name: 'QB ' + f.key, number: f.key } });
  const code = await db.costCode.create({
    data: { code: f.key, name: 'Electrical', type: 'SUBCONTRACT' },
  });
  for (const [type, entityId, qtype, listId] of [
    ['PROJECT', project.id, 'Customer', 'job'],
    ['COST_CODE', code.id, 'Item', 'item'],
  ]) {
    const candidate = await db.quickBooksCandidate.create({
      data: {
        connectionId: f.c.id,
        type: qtype,
        listId,
        fullName: listId,
        subtype: 'ItemServiceRet',
      },
    });
    await saveMapping(
      f.actor,
      mappingSchema.parse({ connectionId: f.c.id, type, entityId, candidateId: candidate.id }),
    );
  }
  return { project, code };
}
describe('QBWC persistent protocol and financial integration', () => {
  it('adopts an uncertain time write only after a matching transaction query, without resending Add', async () => {
    const f = await bound(),
      { project, code } = await mappedProject(f);
    const candidate = await db.quickBooksCandidate.create({
      data: { connectionId: f.c.id, type: 'Employee', listId: 'employee', fullName: 'Employee' },
    });
    await saveMapping(
      f.actor,
      mappingSchema.parse({
        connectionId: f.c.id,
        type: 'EMPLOYEE',
        entityId: f.actor.id,
        candidateId: candidate.id,
      }),
    );
    const start = new Date('2026-09-24T12:00:00Z'),
      end = new Date('2026-09-24T13:00:00Z'),
      task = await db.task.create({ data: { name: 'Adopt time ' + f.key } }),
      day = await db.workDay.create({
        data: {
          userId: f.actor.id,
          date: '2026-09-24',
          timezone: 'America/Toronto',
          originalStart: start,
          paidStart: start,
          endedAt: end,
        },
      });
    const segment = await db.timeSegment.create({
      data: {
        userId: f.actor.id,
        workDayId: day.id,
        jobsiteId: project.id,
        costCodeId: code.id,
        taskId: task.id,
        type: 'SITE',
        originalStart: start,
        effectiveStart: start,
        end,
        status: 'PM_APPROVED',
        approvals: { create: { approverId: f.actor.id, segmentVersion: 1 } },
      },
    });
    await queue(
      f.actor,
      queueSchema.parse({ connectionId: f.c.id, operation: 'TIME', entityId: segment.id }),
    );
    const original = await send(f.ticket),
      originalData = object(req(original).data.TimeTrackingAdd);
    await connectorCallback('closeConnection', { ticket: f.ticket });
    const job = await db.quickBooksSyncJob.findFirstOrThrow({
      where: { connectionId: f.c.id, entityId: segment.id },
    });
    await reconcile(f.actor, {
      action: 'verify-write',
      id: job.id,
      txnId: 'known-time',
      note: 'Controller located the original transaction.',
    });
    const [ticket] = await authenticate('qb-' + f.key, f.c.password!);
    await receive(ticket, await send(ticket), {
      CompanyRet: { CompanyName: 'Cedar Winds Test ' + f.key, LegalCompanyName: 'CW Test' },
    });
    const verify = await send(ticket);
    expect(req(verify).op).toBe('TimeTrackingQueryRq');
    await receive(ticket, verify, {
      TimeTrackingRet: { ...originalData, TxnID: 'known-time', EditSequence: '1' },
    });
    expect((await db.quickBooksSyncJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      'SUCCEEDED',
    );
    expect(await db.quickBooksRequest.count({ where: { jobId: job.id, isWrite: true } })).toBe(1);
  });
  it('serves SOAP rather than JSON and rejects malformed/incorrect content types', async () => {
    const xml =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><serverVersion xmlns="http://developer.intuit.com"/></soap:Body></soap:Envelope>';
    const response = await soapPost(
      new Request('https://cw.example.test/api/quickbooks/web-connector', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'http://developer.intuit.com/serverVersion',
        },
        body: xml,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('serverVersionResult');
    expect(
      (
        await soapPost(
          new Request('https://cw.example.test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await soapPost(
          new Request('https://cw.example.test', {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: '<broken>',
          }),
        )
      ).status,
    ).toBe(500);
  });
  it('discovers all supported lists and updates inactive/deleted candidate availability', async () => {
    const f = await bound();
    await queue(f.actor, queueSchema.parse({ connectionId: f.c.id, operation: 'DISCOVERY' }));
    await receive(f.ticket, await send(f.ticket), {
      CompanyRet: { CompanyName: 'Cedar Winds Test ' + f.key, LegalCompanyName: 'CW Test' },
    });
    for (const [kind, body] of Object.entries(listFixtures)) {
      const xml = await send(f.ticket);
      expect(req(xml).op).toBe(kind + 'QueryRq');
      await receive(f.ticket, xml, body);
    }
    expect(await db.quickBooksCandidate.count({ where: { connectionId: f.c.id } })).toBe(5);
    const item = await db.quickBooksCandidate.findFirstOrThrow({
      where: { connectionId: f.c.id, type: 'Item' },
    });
    expect(item.subtype).toBe('ItemServiceRet');
  });
  it('quarantines malformed and transport-failed responses without changing accounting records', async () => {
    const f = await bound();
    await queue(f.actor, queueSchema.parse({ connectionId: f.c.id, operation: 'BILLS' }));
    await send(f.ticket);
    expect(
      await receiveResponse({ ticket: f.ticket, response: '<broken>', hresult: '', message: '' }),
    ).toBe(-1);
    expect(await db.actualCost.count({ where: { externalSystem: 'QB:' + f.c.id } })).toBe(0);
    expect(
      (
        await db.quickBooksSyncJob.findFirstOrThrow({
          where: { connectionId: f.c.id, operation: 'BILLS' },
        })
      ).status,
    ).toBe('FAILED');
    expect(
      await connectorCallback('connectionError', {
        ticket: f.ticket,
        hresult: '0x800',
        message: 'Never persist raw transport data',
      }),
    ).toBe('done');
  });
  it('imports multiple Projects by line, skips overhead and reverses removed lines', async () => {
    const f = await bound(),
      { project, code } = await mappedProject(f);
    const other = await db.project.create({ data: { name: 'Other', number: randomUUID() } });
    const candidate = await db.quickBooksCandidate.create({
      data: { connectionId: f.c.id, type: 'Customer', listId: 'other', fullName: 'Other' },
    });
    await saveMapping(
      f.actor,
      mappingSchema.parse({
        connectionId: f.c.id,
        type: 'PROJECT',
        entityId: other.id,
        candidateId: candidate.id,
      }),
    );
    const rows = [
      {
        TxnLineID: 'a',
        Amount: '5000',
        CustomerRef: { ListID: 'job' },
        ItemRef: { ListID: 'item' },
      },
      {
        TxnLineID: 'b',
        Amount: '3000',
        CustomerRef: { ListID: 'other' },
        ItemRef: { ListID: 'item' },
      },
      { TxnLineID: 'overhead', Amount: '900', ItemRef: { ListID: 'unmapped' } },
    ];
    await transaction(async (tx) => {
      const b = await stageBill(tx, f.c.id, {
        TxnID: 'multi',
        EditSequence: '1',
        TxnDate: '2026-09-24',
        ItemLineRet: rows,
      });
      await applyBill(tx, f.actor, b.id);
    });
    expect(
      (
        await db.actualCost.findFirstOrThrow({
          where: { projectId: other.id, costCodeId: code.id, reversedAt: null },
        })
      ).amount.toString(),
    ).toBe('3000');
    await transaction(async (tx) => {
      const b = await stageBill(tx, f.c.id, {
        TxnID: 'multi',
        EditSequence: '2',
        TxnDate: '2026-09-24',
        ItemLineRet: [rows[0]],
      });
      await applyBill(tx, f.actor, b.id);
    });
    expect(await db.actualCost.count({ where: { projectId: other.id, reversedAt: null } })).toBe(0);
    expect(
      (
        await db.actualCost.aggregate({
          where: { projectId: project.id, reversedAt: null },
          _sum: { amount: true },
        })
      )._sum.amount?.toString(),
    ).toBe('5000');
  });
  it('synchronizes an issued PO, maps its Bill into the existing job-cost ledger, and safely modifies a later revision', async () => {
    const f = await bound(),
      { project, code } = await mappedProject(f);
    const vendor = await db.contact.create({
      data: { firstName: 'Supplier', lastName: f.key, types: ['VENDOR'] },
    });
    const candidate = await db.quickBooksCandidate.create({
      data: { connectionId: f.c.id, type: 'Vendor', listId: 'vendor', fullName: 'Supplier' },
    });
    await saveMapping(
      f.actor,
      mappingSchema.parse({
        connectionId: f.c.id,
        type: 'VENDOR_CONTACT',
        entityId: vendor.id,
        candidateId: candidate.id,
      }),
    );
    const budget = await db.budget.create({
      data: {
        projectId: project.id,
        name: 'Budget',
        versions: {
          create: [1, 2].map((version) => ({
            version,
            type: version === 1 ? 'ORIGINAL' : 'CURRENT',
            createdById: f.actor.id,
            lines: {
              create: {
                costCodeId: code.id,
                costCodeSnapshot: code.code,
                costCodeNameSnapshot: code.name,
                costType: 'SUBCONTRACT',
                description: 'Scope',
                amount: 100000,
              },
            },
          })),
        },
      },
    });
    expect(budget).toBeTruthy();
    const p = await savePurchasing(
      f.actor,
      purchasingSchema.parse({
        projectId: project.id,
        type: 'PURCHASE_ORDER',
        vendorContactId: vendor.id,
        title: 'Test PO',
        lines: [
          {
            costCodeId: code.id,
            costType: 'SUBCONTRACT',
            description: 'Scope',
            quantity: '1',
            unit: 'LS',
            unitCost: '25000',
            taxable: false,
            sortOrder: 0,
          },
        ],
      }),
    );
    for (const action of ['review', 'approve', 'issue']) {
      const r = await db.purchasingRevision.findUniqueOrThrow({ where: { id: p.id } });
      await purchasingAction(
        f.actor,
        transitionSchema.parse({ id: r.id, expectedVersion: r.version, action }),
      );
    }
    await queue(
      f.actor,
      queueSchema.parse({ connectionId: f.c.id, operation: 'PURCHASE_ORDER', entityId: p.id }),
    );
    const xml = await send(f.ticket);
    expect(req(xml).op).toBe('PurchaseOrderAddRq');
    expect(xml).toContain('<ListID>vendor</ListID>');
    const ret = {
      TxnID: 'po',
      EditSequence: '1',
      PurchaseOrderLineRet: { TxnLineID: 'poline', ItemRef: { ListID: 'item' }, Amount: '25000' },
    };
    await receive(f.ticket, xml, { PurchaseOrderRet: ret });
    await receive(f.ticket, xml, { PurchaseOrderRet: ret });
    await queue(f.actor, queueSchema.parse({ connectionId: f.c.id, operation: 'BILLS' }));
    const query = await send(f.ticket);
    expect(req(query).op).toBe('BillQueryRq');
    await receive(f.ticket, query, {
      BillRet: {
        TxnID: 'bill',
        EditSequence: '1',
        TxnDate: '2026-09-24',
        LinkedTxn: { TxnID: 'po', TxnType: 'PurchaseOrder' },
        ItemLineRet: {
          TxnLineID: 'line',
          CustomerRef: { ListID: 'job' },
          ItemRef: { ListID: 'item' },
          Amount: '10000',
        },
      },
    });
    const line = await db.commitmentLine.findFirstOrThrow({
      where: { commitment: { purchasingDocumentId: p.documentId } },
    });
    expect(line.committedAmount.sub(line.consumedAmount).toString()).toBe('15000');
    const report = await jobCost(f.actor, project.id);
    expect(report.totals.current.toString()).toBe('100000');
    expect(report.totals.committed.toString()).toBe('15000');
    expect(report.totals.actual.toString()).toBe('10000');
    expect(report.totals.forecast.toString()).toBe('100000');
    expect(report.totals.variance.toString()).toBe('0');
    expect(await db.actualCost.count({ where: { projectId: project.id, reversedAt: null } })).toBe(
      1,
    );
    const original = await db.purchasingRevision.findUniqueOrThrow({ where: { id: p.id } });
    await purchasingAction(
      f.actor,
      transitionSchema.parse({ id: p.id, expectedVersion: original.version, action: 'revise' }),
    );
    const revision = await db.purchasingRevision.findFirstOrThrow({
      where: { documentId: p.documentId, status: 'DRAFT' },
    });
    for (const action of ['review', 'approve', 'issue']) {
      const r = await db.purchasingRevision.findUniqueOrThrow({ where: { id: revision.id } });
      await purchasingAction(
        f.actor,
        transitionSchema.parse({ id: r.id, expectedVersion: r.version, action }),
      );
    }
    await queue(
      f.actor,
      queueSchema.parse({
        connectionId: f.c.id,
        operation: 'PURCHASE_ORDER',
        entityId: revision.id,
      }),
    );
    await receive(f.ticket, await send(f.ticket), {
      PurchaseOrderRet: { ...ret, EditSequence: 'external-2' },
    });
    const job = await db.quickBooksSyncJob.findFirstOrThrow({ where: { entityId: revision.id } });
    expect(job.status).toBe('RECONCILIATION_REQUIRED');
    await reconcile(f.actor, {
      action: 'approve-po',
      id: job.id,
      note: 'Reviewed external changes and approved issued revision.',
    });
    await receive(f.ticket, await send(f.ticket), {
      PurchaseOrderRet: { ...ret, EditSequence: 'external-2' },
    });
    const mod = await send(f.ticket);
    expect(req(mod).op).toBe('PurchaseOrderModRq');
    expect(mod).toContain('<EditSequence>external-2</EditSequence>');
    expect(mod).toContain('<TxnLineID>poline</TxnLineID>');
    await receive(f.ticket, mod, { PurchaseOrderRet: { ...ret, EditSequence: '3' } });
  });
  it('exports only current approved time once and flags edits after synchronization', async () => {
    const f = await bound(),
      { project, code } = await mappedProject(f);
    const employee = await db.quickBooksCandidate.create({
      data: { connectionId: f.c.id, type: 'Employee', listId: 'employee', fullName: 'Employee' },
    });
    await saveMapping(
      f.actor,
      mappingSchema.parse({
        connectionId: f.c.id,
        type: 'EMPLOYEE',
        entityId: f.actor.id,
        candidateId: employee.id,
      }),
    );
    const start = new Date('2026-09-24T12:00:00Z'),
      end = new Date('2026-09-24T13:30:00Z');
    const day = await db.workDay.create({
      data: {
        userId: f.actor.id,
        date: '2026-09-24',
        timezone: 'America/Toronto',
        originalStart: start,
        paidStart: start,
        endedAt: end,
      },
    });
    const task = await db.task.create({ data: { name: 'QB time ' + f.key } });
    const segment = await db.timeSegment.create({
      data: {
        userId: f.actor.id,
        workDayId: day.id,
        jobsiteId: project.id,
        costCodeId: code.id,
        type: 'SITE',
        taskId: task.id,
        originalStart: start,
        effectiveStart: start,
        end,
        status: 'PM_APPROVED',
        approvals: { create: { approverId: f.actor.id, segmentVersion: 1 } },
      },
    });
    await queue(
      f.actor,
      queueSchema.parse({ connectionId: f.c.id, operation: 'TIME', entityId: segment.id }),
    );
    const xml = await send(f.ticket);
    expect(req(xml).op).toBe('TimeTrackingAddRq');
    expect(xml).toContain('<Duration>PT1H30M</Duration>');
    const ret = { TimeTrackingRet: { TxnID: 'time', EditSequence: '1' } };
    await receive(f.ticket, xml, ret);
    await receive(f.ticket, xml, ret);
    await queue(
      f.actor,
      queueSchema.parse({ connectionId: f.c.id, operation: 'TIME', entityId: segment.id }),
    );
    expect(
      await db.quickBooksSyncJob.count({ where: { connectionId: f.c.id, operation: 'TIME' } }),
    ).toBe(1);
    await db.timeSegment.update({
      where: { id: segment.id },
      data: { version: { increment: 1 }, status: 'PENDING_PM_APPROVAL' },
    });
    expect(
      (
        await db.accountingSyncMapping.findFirstOrThrow({
          where: { connectionId: f.c.id, entityType: 'TIME' },
        })
      ).status,
    ).toBe('CONFLICT');
  });
  it('rejects bad authentication, creates hashed tickets, completes discovery and replays response safely', async () => {
    const f = await fixture();
    expect(await authenticate('unknown', 'bad')).toEqual(['', 'nvu']);
    expect(await authenticate('qb-' + f.key, 'bad')).toEqual(['', 'nvu']);
    const [ticket] = await authenticate('qb-' + f.key, f.c.password!);
    expect(ticket.length).toBeGreaterThan(30);
    const s = await db.quickBooksSyncSession.findUniqueOrThrow({
      where: { tokenHash: digest(ticket) },
    });
    expect(s.tokenHash).not.toBe(ticket);
    const xml = await send(ticket);
    expect(req(xml).op).toBe('CompanyQueryRq');
    const payload = response(xml, { CompanyRet: { CompanyName: 'Test' } });
    const result = await receiveResponse({ ticket, response: payload, hresult: '', message: '' });
    expect(await receiveResponse({ ticket, response: payload, hresult: '', message: '' })).toBe(
      result,
    );
    expect(await send(ticket)).toBe('');
    await connectorCallback('closeConnection', { ticket });
    await expect(send(ticket)).rejects.toThrow();
  });
  it('isolates browser accounting capabilities from external identities', async () => {
    const f = await fixture();
    for (const role of ['CLIENT', 'SUBTRADE', 'VENDOR', 'PROJECT_MANAGER'] as const) {
      const actor = await db.user.create({
        data: {
          email: role + f.key + '@example.test',
          firstName: role,
          lastName: 'Test',
          roles: [role],
        },
      });
      await expect(dashboard(actor)).rejects.toThrow();
    }
    const safe = await dashboard(f.actor);
    expect(JSON.stringify(safe)).not.toContain('passwordHash');
    expect(JSON.stringify(safe)).not.toContain(f.c.password);
  });
  it('stops on wrong company path and expires tickets', async () => {
    const f = await bound();
    expect(await send(f.ticket, 'C:\\Wrong.qbw')).toBe('');
    expect(
      (await db.quickBooksConnection.findUniqueOrThrow({ where: { id: f.c.id } })).companyMismatch,
    ).toBe(true);
    await db.quickBooksSyncSession.updateMany({
      where: { connectionId: f.c.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(send(f.ticket)).rejects.toThrow('expired');
  });
  it('queues one deterministic source job and blocks missing prerequisites', async () => {
    const f = await bound();
    await Promise.all([
      queue(
        f.actor,
        queueSchema.parse({
          connectionId: f.c.id,
          operation: 'PURCHASE_ORDER',
          entityId: 'missing',
        }),
      ),
      queue(
        f.actor,
        queueSchema.parse({
          connectionId: f.c.id,
          operation: 'PURCHASE_ORDER',
          entityId: 'missing',
        }),
      ),
    ]);
    expect(
      await db.quickBooksSyncJob.count({
        where: { connectionId: f.c.id, operation: 'PURCHASE_ORDER' },
      }),
    ).toBe(1);
    expect(await send(f.ticket)).toBe('');
    expect(
      (
        await db.quickBooksSyncJob.findFirstOrThrow({
          where: { connectionId: f.c.id, operation: 'PURCHASE_ORDER' },
        })
      ).status,
    ).toBe('BLOCKED');
  });
  it('does not resend an uncertain accounting write after restart or concurrent send', async () => {
    const f = await bound();
    const p = await db.project.create({ data: { name: 'Explicit', number: randomUUID() } });
    await queue(
      f.actor,
      queueSchema.parse({
        connectionId: f.c.id,
        operation: 'CREATE_PROJECT',
        entityId: p.id,
        name: 'Explicit Test',
      }),
    );
    const responses = await Promise.all([send(f.ticket), send(f.ticket)]);
    expect(responses.filter(Boolean)).toHaveLength(1);
    const request = await db.quickBooksRequest.findFirstOrThrow({
      where: { session: { connectionId: f.c.id }, isWrite: true },
    });
    expect(
      (await db.quickBooksSyncJob.findUniqueOrThrow({ where: { id: request.jobId } })).status,
    ).toBe('RECONCILIATION_REQUIRED');
    await db.$disconnect();
    const xml = responses.find(Boolean)!;
    await receive(f.ticket, xml, {
      CustomerRet: { ListID: 'customer1', EditSequence: '1', FullName: 'Explicit Test' },
    });
    expect(
      await db.accountingSyncMapping.count({
        where: { connectionId: f.c.id, entityType: 'PROJECT', entityId: p.id },
      }),
    ).toBe(1);
  });
  it('imports 10k against 25k commitment; changed Bill becomes 12k rather than 22k; retries are idempotent', async () => {
    const f = await bound();
    const { project, code } = await mappedProject(f);
    const commitment = await db.commitment.create({
      data: {
        projectId: project.id,
        reference: 'TEST',
        sourceType: 'MANUAL',
        status: 'COMMITTED',
        lines: {
          create: {
            costCodeId: code.id,
            costType: 'SUBCONTRACT',
            description: 'Scope',
            committedAmount: 25000,
          },
        },
      },
      include: { lines: true },
    });
    const bill = (amount: string, edit: string) => ({
      TxnID: 'bill1',
      EditSequence: edit,
      TxnDate: '2026-09-24',
      ItemLineRet: {
        TxnLineID: 'line1',
        Amount: amount,
        CustomerRef: { ListID: 'job' },
        ItemRef: { ListID: 'item' },
      },
    });
    const apply = async (amount: string, edit: string) =>
      transaction(async (tx) => {
        const mirror = await stageBill(tx, f.c.id, bill(amount, edit));
        await tx.quickBooksBillMirror.update({
          where: { id: mirror.id },
          data: { lineLinks: { line1: commitment.lines[0].id } },
        });
        await applyBill(tx, f.actor, mirror.id);
      });
    await apply('10000', '1');
    await apply('10000', '1');
    expect(await db.actualCost.count({ where: { projectId: project.id, reversedAt: null } })).toBe(
      1,
    );
    expect(
      (
        await db.commitmentLine.findUniqueOrThrow({ where: { id: commitment.lines[0].id } })
      ).consumedAmount.toString(),
    ).toBe('10000');
    await apply('12000', '2');
    expect(
      (
        await db.actualCost.aggregate({
          where: { projectId: project.id, reversedAt: null },
          _sum: { amount: true },
        })
      )._sum.amount?.toString(),
    ).toBe('12000');
    expect(
      (
        await db.commitmentLine.findUniqueOrThrow({ where: { id: commitment.lines[0].id } })
      ).consumedAmount.toString(),
    ).toBe('12000');
    expect(
      await db.actualCost.count({ where: { projectId: project.id, reversedAt: { not: null } } }),
    ).toBe(1);
    await apply('30000', '3');
    expect(
      (
        await db.commitmentLine.findUniqueOrThrow({ where: { id: commitment.lines[0].id } })
      ).consumedAmount.toString(),
    ).toBe('12000');
    expect(
      (
        await db.quickBooksBillMirror.findUniqueOrThrow({
          where: { connectionId_txnId: { connectionId: f.c.id, txnId: 'bill1' } },
        })
      ).status,
    ).toBe('REVIEW');
  });
  it('preserves all prior actuals when a changed Bill contains an unmapped project line', async () => {
    const f = await bound();
    const { project } = await mappedProject(f);
    await transaction(async (tx) => {
      const b = await stageBill(tx, f.c.id, {
        TxnID: 'b',
        EditSequence: '1',
        TxnDate: '2026-09-24',
        ItemLineRet: {
          TxnLineID: 'a',
          Amount: '100',
          CustomerRef: { ListID: 'job' },
          ItemRef: { ListID: 'item' },
        },
      });
      await applyBill(tx, f.actor, b.id);
    });
    await transaction(async (tx) => {
      const b = await stageBill(tx, f.c.id, {
        TxnID: 'b',
        EditSequence: '2',
        TxnDate: '2026-09-24',
        ItemLineRet: [
          {
            TxnLineID: 'a',
            Amount: '200',
            CustomerRef: { ListID: 'job' },
            ItemRef: { ListID: 'item' },
          },
          {
            TxnLineID: 'b',
            Amount: '300',
            CustomerRef: { ListID: 'other' },
            ItemRef: { ListID: 'item' },
          },
        ],
      });
      await applyBill(tx, f.actor, b.id);
    });
    expect(
      (
        await db.actualCost.aggregate({
          where: { projectId: project.id, reversedAt: null },
          _sum: { amount: true },
        })
      )._sum.amount?.toString(),
    ).toBe('100');
  });
});
