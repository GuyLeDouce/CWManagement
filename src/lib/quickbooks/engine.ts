import { z } from 'zod';
import { db, transaction, Tx, json } from '../db';
import { digest, randomToken, verifyPassword } from '../crypto';
import { rateLimit } from '../auth';
import { ensure, AppError } from '../errors';
import { callbacks, Callback } from './soap';
import { buildRequest } from './requests';
import { qbRequest, qbResponse, qbVersion, object, list, text, required } from './xml';
import { safeStatus } from './xml';
import { lockConnection, issue, qbAudit, qbActor } from './state';
import { enqueue } from './queue';
import { recordTransactionMapping,candidateType } from './mapping';
import { applyBill, stageBill } from './bills';
import { adoptVerifiedWrite } from './reconciliation';
async function session(tx: Tx, ticket: string) {
  const s = await tx.quickBooksSyncSession.findUnique({ where: { tokenHash: digest(ticket) } });
  ensure(
    s && !s.completedAt && s.expiresAt > new Date(),
    'Connector session expired or invalid.',
    401,
  );
  await lockConnection(tx, s.connectionId);
  const c = await tx.quickBooksConnection.findUniqueOrThrow({ where: { id: s.connectionId } });
  ensure(c.active && c.syncEnabled, 'Connection disabled.', 403);
  await tx.quickBooksSyncSession.update({
    where: { id: s.id },
    data: { lastActivityAt: new Date() },
  });
  return { s, c };
}
async function quarantine(tx: Tx, sessionId: string) {
  const requests = await tx.quickBooksRequest.findMany({
    where: { sessionId, completedAt: null },
    include: { job: true },
  });
  for (const r of requests) {
    const message = r.isWrite
      ? 'The connector response was lost. Verify the transaction in QuickBooks; automatic resend is prohibited.'
      : 'Connector interrupted. Retry this read query.';
    await tx.quickBooksSyncJob.update({
      where: { id: r.jobId },
      data: { status: r.isWrite ? 'RECONCILIATION_REQUIRED' : 'FAILED', lastError: message },
    });
    await issue(
      tx,
      r.job.connectionId,
      'request:' + r.id,
      'INTERRUPTED',
      message,
      r.jobId,
      undefined,
      !r.isWrite,
    );
  }
}
export async function authenticate(username: string, password: string) {
  try {
    await rateLimit('qbwc:' + username.toLowerCase(), 20, 900);
  } catch {
    return ['', 'nvu'];
  }
  const c = await db.quickBooksConnection.findUnique({ where: { username } });
  const valid = await verifyPassword(password, c?.passwordHash ?? null);
  if (!valid || !c?.active || !c.syncEnabled) return ['', 'nvu'];
  return transaction(async (tx) => {
    await lockConnection(tx, c.id);
    const latest = await tx.quickBooksConnection.findUniqueOrThrow({ where: { id: c.id } });
    if (latest.passwordHash !== c.passwordHash || !latest.active || !latest.syncEnabled)
      return ['', 'nvu'];
    const live = await tx.quickBooksSyncSession.findFirst({
      where: { connectionId: c.id, completedAt: null, expiresAt: { gt: new Date() } },
    });
    if (live) return ['', 'none'];
    const expired = await tx.quickBooksSyncSession.findMany({
      where: { connectionId: c.id, completedAt: null },
    });
    for (const old of expired) {
      await quarantine(tx, old.id);
      await tx.quickBooksSyncSession.update({
        where: { id: old.id },
        data: { completedAt: new Date() },
      });
      await tx.quickBooksSyncRun.update({
        where: { id: old.runId },
        data: { completedAt: new Date(), status: 'INTERRUPTED' },
      });
    }
    const token = randomToken(),
      run = await tx.quickBooksSyncRun.create({
        data: {
          connectionId: c.id,
          queued: await tx.quickBooksSyncJob.count({
            where: { connectionId: c.id, status: 'PENDING' },
          }),
        },
      }),
      s = await tx.quickBooksSyncSession.create({
        data: {
          connectionId: c.id,
          runId: run.id,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
    await enqueue(tx, c.id, 'Company', `${c.id}:session:${s.id}`, c.actorId, {}, undefined, 1000);
    if (
      latest.mode === 'ACTIVE' &&
      latest.importStartDate &&
      latest.boundCompanyHash &&
      !latest.companyMismatch &&
      !(await tx.quickBooksSyncJob.findFirst({
        where: {
          connectionId: c.id,
          operation: 'BILLS',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      }))
    ) {
      await enqueue(tx, c.id, 'BILLS', `${c.id}:bills:${s.id}`, c.actorId, {
        from: latest.billCursor
          ? new Date(latest.billCursor.getTime() - 300000).toISOString()
          : null,
        startedAt: new Date().toISOString(),
      });
    }
    await tx.quickBooksConnection.update({
      where: { id: c.id },
      data: {
        lastAuthenticatedAt: new Date(),
        lastConnectedAt: new Date(),
        lastCallback: 'authenticate',
      },
    });
    return [token, c.companyFileName ?? ''];
  });
}
export async function sendRequest(input: z.infer<typeof callbacks.sendRequestXML>) {
  return transaction(async (tx) => {
    const { s, c } = await session(tx, input.ticket);
    const version = qbVersion(input.qbXMLMajorVers, input.qbXMLMinorVers);
    await tx.quickBooksConnection.update({
      where: { id: c.id },
      data: {
        lastConnectedAt: new Date(),
        lastCallback: 'sendRequestXML',
        country: input.qbXMLCountry,
        qbXmlVersion: version,
      },
    });
    const outstanding = await tx.quickBooksRequest.findFirst({
      where: { sessionId: s.id, completedAt: null },
    });
    if (outstanding) {
      if (outstanding.isWrite) {
        await quarantine(tx, s.id);
        return '';
      }
      return qbRequest(outstanding.operation, object(outstanding.data), outstanding.id, version);
    }
    if (
      c.boundCompanyHash &&
      c.companyFileName &&
      c.companyFileName.toLowerCase() !== input.strCompanyFileName.toLowerCase()
    ) {
      await tx.quickBooksConnection.update({
        where: { id: c.id },
        data: { companyMismatch: true, companyHash:null,lastError: 'QuickBooks company file path changed.' },
      });
      await issue(
        tx,
        c.id,
        'company:' + c.id,
        'COMPANY_MISMATCH',
        'QuickBooks company file changed. Transaction synchronization is stopped.',
      );
      return '';
    }
    await tx.quickBooksSyncSession.update({
      where: { id: s.id },
      data: { companyFileName: input.strCompanyFileName },
    });
    const job = await tx.quickBooksSyncJob.findFirst({
      where: {
        connectionId: c.id,
        status: 'PENDING',
        availableAt: { lte: new Date() },
        ...(!s.companyVerified
          ? { operation: 'Company' }
          : c.mode !== 'ACTIVE' || c.companyMismatch
            ? { direction: 'IMPORT' }
            : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    if (!job) return '';
    try {
      await qbActor(tx, job.actorId);
      const request = await buildRequest(tx, c, job);
      const row = await tx.quickBooksRequest.create({
        data: {
          jobId: job.id,
          sessionId: s.id,
          operation: request.operation,
          data: json(request.data),
          isWrite: request.isWrite,
        },
      });
      await tx.quickBooksSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'IN_PROGRESS',
          sessionId: s.id,
          startedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      await tx.quickBooksSyncSession.update({
        where: { id: s.id },
        data: { currentRequestId: row.id },
      });
      await tx.quickBooksSyncRun.update({
        where: { id: s.runId },
        data: { requestsSent: { increment: 1 } },
      });
      return qbRequest(request.operation, request.data, row.id, version);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      await tx.quickBooksSyncJob.update({
        where: { id: job.id },
        data: { status: 'BLOCKED', lastError: error.message },
      });
      await issue(tx, c.id, 'job:' + job.id, 'PREREQUISITE', error.message, job.id);
      return '';
    }
  });
}
export async function receiveResponse(input: z.infer<typeof callbacks.receiveResponseXML>) {
  return transaction(async (tx) => {
    const { s, c } = await session(tx, input.ticket);
    await tx.quickBooksConnection.update({
      where: { id: c.id },
      data: { lastCallback: 'receiveResponseXML', lastConnectedAt: new Date() },
    });
    if (input.hresult) {
      await quarantine(tx, s.id);
      await tx.quickBooksSyncSession.update({
        where: { id: s.id },
        data: { lastError: 'QuickBooks transport error; inspect reconciliation.' },
      });
      return -1;
    }
    let response: ReturnType<typeof qbResponse>;
    try {
      response = qbResponse(input.response);
    } catch {
      await quarantine(tx, s.id);
      return -1;
    }
    const r = await tx.quickBooksRequest.findFirst({
      where: { id: response.requestId, sessionId: s.id },
      include: { job: true },
    });
    ensure(r, 'Response does not match this session.', 409);
    const hash = digest(input.response);
    if (r.completedAt) {
      ensure(r.responseHash === hash, 'Conflicting duplicate response.', 409);
      return r.percent ?? 100;
    }
    ensure(s.currentRequestId === r.id, 'Response is not for the active request.', 409);
    ensure(
      response.operation === r.operation.replace(/Rq$/, 'Rs'),
      'Unexpected response type.',
      409,
    );
    if (response.code !== '0' && response.code !== '1') {
      const message = safeStatus(response.code);
      await tx.quickBooksSyncJob.update({
        where: { id: r.jobId },
        data: {
          status: response.code === '3200' ? 'RECONCILIATION_REQUIRED' : response.code==='3260'&&r.job.attempts<3?'PENDING':'FAILED',
          ...(response.code==='3260'&&r.job.attempts<3?{availableAt:new Date(Date.now()+Math.pow(2,r.job.attempts)*30000)}:{}),
          lastError: message,
        },
      });
      await issue(
        tx,
        c.id,
        'job:' + r.jobId,
        'QB_REJECTED',
        message,
        r.jobId,
        response.code,
        response.code === '3260',
      );
      await tx.quickBooksSyncRun.update({
        where: { id: s.runId },
        data: { failed: { increment: 1 } },
      });
      await tx.quickBooksConnection.update({
        where: { id: c.id },
        data: { lastError: message, lastErrorAt: new Date() },
      });
      await tx.quickBooksRequest.update({
        where: { id: r.id },
        data: { completedAt: new Date(), responseHash: hash, percent: -1 },
      });
      return -1;
    }
    const node = response.node;
    let completed = true;
    if (r.operation === 'CompanyQueryRq') {
      const company = object(node.CompanyRet);
      const name = required(company, 'CompanyName');
      const companyHash = digest(
        JSON.stringify([
          name,
          text(company.LegalCompanyName),
          (s.companyFileName ?? '').toLowerCase(),
        ]),
      );
      const mismatch = c.companyMismatch || (!!c.boundCompanyHash && c.boundCompanyHash !== companyHash);
      await tx.quickBooksConnection.update({
        where: { id: c.id },
        data: {
          companyName: name,
          companyHash,
          companyMismatch: mismatch,
          ...(!c.boundCompanyHash ? { companyFileName: s.companyFileName } : {}),
          lastError: mismatch ? 'Company identity changed.' : null,
        },
      });
      await tx.quickBooksSyncSession.update({
        where: { id: s.id },
        data: { companyVerified: !mismatch },
      });
      await tx.quickBooksSyncRun.update({
        where: { id: s.runId },
        data: { companyName: name, qbXmlVersion: c.qbXmlVersion },
      });
      if (mismatch)
        await issue(
          tx,
          c.id,
          'company:' + c.id,
          'COMPANY_MISMATCH',
          'Company identity changed. Transaction synchronization is stopped.',
        );
    } else if (
      [
        'CustomerQueryRq',
        'VendorQueryRq',
        'EmployeeQueryRq',
        'ItemQueryRq',
        'AccountQueryRq',
      ].includes(r.operation)
    ) {
      const type = r.operation.replace('QueryRq', '');
      await tx.quickBooksCandidate.updateMany({
        where: { connectionId: c.id, type },
        data: { active: false },
      });
      for (const [key, value] of Object.entries(node)) {
        if (!key.endsWith('Ret')) continue;
        for (const ret of list(value)) {
          const listId = required(ret, 'ListID'),
            fullName = text(ret.FullName) || required(ret, 'Name');
          await tx.quickBooksCandidate.upsert({
            where: { connectionId_type_listId: { connectionId: c.id, type, listId } },
            create: {
              connectionId: c.id,
              type,
              listId,
              fullName,
              editSequence: text(ret.EditSequence) || null,
              subtype: key,
              active: text(ret.IsActive) !== 'false',
            },
            update: {
              fullName,
              editSequence: text(ret.EditSequence) || null,
              subtype: key,
              active: text(ret.IsActive) !== 'false',
              lastSeenAt: new Date(),
            },
          });
        }
      }
      const mappings=await tx.accountingSyncMapping.findMany({where:{connectionId:c.id,quickBooksListId:{not:null}}});
      for(const mapping of mappings){if(candidateType(mapping.entityType)!==type)continue;const candidate=await tx.quickBooksCandidate.findUnique({where:{connectionId_type_listId:{connectionId:c.id,type,listId:mapping.quickBooksListId!}}});if(candidate?.active)await tx.accountingSyncMapping.update({where:{id:mapping.id},data:{lastSeenInQuickBooksAt:candidate.lastSeenAt,quickBooksFullName:candidate.fullName,quickBooksEditSequence:candidate.editSequence}});else {await tx.accountingSyncMapping.update({where:{id:mapping.id},data:{status:'CONFLICT',lastError:'Mapped QuickBooks record is inactive or missing.'}});await issue(tx,c.id,'mapping:'+mapping.id,'MAPPING_UNAVAILABLE','A mapped QuickBooks '+type+' is inactive or missing. Review its mapping.');}}
    } else if (r.operation === 'BillQueryRq') {
      const actor = await qbActor(tx, r.job.actorId);
      for (const bill of list(node.BillRet)) {
        if (
          c.importStartDate &&
          text(bill.TxnDate) < c.importStartDate.toISOString().slice(0, 10) &&
          !(await tx.quickBooksBillMirror.findUnique({
            where: { connectionId_txnId: { connectionId: c.id, txnId: text(bill.TxnID) } },
          }))
        )
          continue;
        const mirror = await stageBill(tx, c.id, bill);
        await applyBill(tx, actor, mirror.id);
      }
      const remaining = Number(text(node['@_iteratorRemainingCount']) || 0);
      if (remaining > 0) {
        ensure(text(node['@_iteratorID']), 'Bill iterator ID missing.');
        await tx.quickBooksSyncJob.update({
          where: { id: r.jobId },
          data: {
            status: 'PENDING',
            payload: json({ ...object(r.job.payload), iteratorId: text(node['@_iteratorID']) }),
          },
        });
        completed = false;
      } else
        await tx.quickBooksConnection.update({
          where: { id: c.id },
          data: { billCursor: new Date(text(object(r.job.payload).startedAt)) },
        });
    } else if (r.job.operation === 'VERIFY_WRITE') {
      try {
        await adoptVerifiedWrite(
          tx,
          c.id,
          text(object(r.job.payload).requestId),
          object(node[r.operation.replace('QueryRq', 'Ret')]),
        );
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        await tx.quickBooksSyncJob.update({
          where: { id: r.jobId },
          data: { status: 'RECONCILIATION_REQUIRED', lastError: error.message },
        });
        await issue(tx, c.id, 'job:' + r.jobId, 'VERIFICATION_MISMATCH', error.message, r.jobId);
        completed = false;
      }
    } else if (r.operation === 'PurchaseOrderQueryRq') {
      // A revision or an external edit must be reviewed rather than overwritten automatically.
      const ret = object(node.PurchaseOrderRet);
      required(ret, 'TxnID');
      const editSequence = required(ret, 'EditSequence');
      const approved =
        r.job.phase === 'MOD_APPROVED' &&
        text(object(r.job.payload).reviewedEditSequence) === editSequence;
      await tx.quickBooksSyncJob.update({
        where: { id: r.jobId },
        data: {
          status: approved ? 'PENDING' : 'RECONCILIATION_REQUIRED',
          phase: approved ? 'MOD_READY' : 'MOD_REVIEW',
          payload: json({
            ...object(r.job.payload),
            reviewedEditSequence: editSequence,
            reviewedLines: list(ret.PurchaseOrderLineRet).map((l) => ({
              id: text(l.TxnLineID),
              description: text(l.Desc),
              amount: text(l.Amount),
            })),
          }),
          lastError: approved
            ? null
            : 'Review the latest QuickBooks PO and explicitly authorize replacement with the current issued CW revision.',
        },
      });
      if (!approved)
        await issue(
          tx,
          c.id,
          'job:' + r.jobId,
          'PO_REVISION',
          'Review the latest QuickBooks Purchase Order before authorizing its modification.',
          r.jobId,
        );
      completed = false;
    } else if (['PurchaseOrderAddRq', 'PurchaseOrderModRq'].includes(r.operation)) {
      const ret = object(node.PurchaseOrderRet),
        source = await tx.purchasingRevision.findUniqueOrThrow({
          where: { id: r.job.entityId! },
          include: { lines: { orderBy: { sortOrder: 'asc' } } },
        });
      await recordTransactionMapping(
        tx,
        c.id,
        'PURCHASE_ORDER',
        source.documentId,
        required(ret, 'TxnID'),
        required(ret, 'EditSequence'),
        {
          revisionId: source.id,
          lines: list(ret.PurchaseOrderLineRet).map((l, i) => ({
            lineKey: source.lines[i]?.lineKey,
            txnLineId: text(l.TxnLineID),
          })),
        },
      );
    } else if (r.operation === 'TimeTrackingAddRq') {
      const ret = object(node.TimeTrackingRet);
      await recordTransactionMapping(
        tx,
        c.id,
        'TIME',
        r.job.entityId!,
        required(ret, 'TxnID'),
        required(ret, 'EditSequence'),
        {},
        Number(object(r.job.payload).sourceVersion),
      );
      const source = await tx.timeSegment.findUniqueOrThrow({ where: { id: r.job.entityId! } });
      if (source.version !== Number(object(r.job.payload).sourceVersion)) {
        await tx.accountingSyncMapping.updateMany({
          where: { connectionId: c.id, entityType: 'TIME', entityId: source.id },
          data: { status: 'CONFLICT', lastError: 'Time changed while export was in flight.' },
        });
        await issue(
          tx,
          c.id,
          'time:' + source.id,
          'TIME_CHANGED',
          'Approved time changed after it was sent. Controller reconciliation is required.',
          r.jobId,
        );
      }
    } else if (['CustomerAddRq', 'VendorAddRq'].includes(r.operation)) {
      const type = r.operation === 'CustomerAddRq' ? 'PROJECT' : 'VENDOR_CONTACT',
        kind = type === 'PROJECT' ? 'Customer' : 'Vendor',
        ret = object(node[kind + 'Ret']);
      await tx.accountingSyncMapping.create({
        data: {
          connectionId: c.id,
          entityType: type,
          entityId: r.job.entityId!,
          quickBooksListId: required(ret, 'ListID'),
          quickBooksFullName: text(ret.FullName) || text(ret.Name),
          quickBooksEditSequence: required(ret, 'EditSequence'),
          status: 'SYNCED',
          direction: 'EXPORT',
          lastSyncedAt: new Date(),
        },
      });
    }
    if (completed) {
      await tx.quickBooksSyncJob.update({
        where: { id: r.jobId },
        data: { status: 'SUCCEEDED', completedAt: new Date(), lastError: null },
      });
      await tx.quickBooksSyncRun.update({
        where: { id: s.runId },
        data: { succeeded: { increment: 1 } },
      });
      await qbAudit(tx, null, 'QUICKBOOKS_JOB_COMPLETED', r.jobId, { operation: r.operation });
    }
    const pending = await tx.quickBooksSyncJob.count({
      where: { connectionId: c.id, status: 'PENDING' },
    });
    const percent = pending ? 50 : 100;
    await tx.quickBooksRequest.update({
      where: { id: r.id },
      data: { completedAt: new Date(), responseHash: hash, percent },
    });
    await tx.quickBooksSyncSession.update({
      where: { id: s.id },
      data: { currentRequestId: null },
    });
    return percent;
  });
}
export async function connectorCallback(
  method: Callback,
  args: unknown,
): Promise<string | number | string[]> {
  if (method === 'serverVersion') return 'CWManagement QBWC 1.0';
  if (method === 'clientVersion') {
    callbacks.clientVersion.parse(args);
    return '';
  }
  if (method === 'authenticate') {
    const a = callbacks.authenticate.parse(args);
    return authenticate(a.strUserName, a.strPassword);
  }
  if (method === 'sendRequestXML') return sendRequest(callbacks.sendRequestXML.parse(args));
  if (method === 'receiveResponseXML')
    return receiveResponse(callbacks.receiveResponseXML.parse(args));
  const a = callbacks[method].parse(args) as { ticket: string };
  return transaction(async (tx) => {
    const { s, c } = await session(tx, a.ticket);
    await tx.quickBooksConnection.update({
      where: { id: c.id },
      data: { lastCallback: method, lastConnectedAt: new Date() },
    });
    if (method === 'getLastError')
      return s.lastError ?? 'Review the QuickBooks reconciliation dashboard.';
    if (method === 'connectionError') {
      await quarantine(tx, s.id);
      await tx.quickBooksSyncSession.update({
        where: { id: s.id },
        data: { lastError: 'Web Connector could not communicate with the company file.' },
      });
      return 'done';
    }
    await quarantine(tx, s.id);
    await tx.quickBooksSyncSession.update({
      where: { id: s.id },
      data: { completedAt: new Date() },
    });
    const failed = await tx.quickBooksSyncJob.count({
      where: { sessionId: s.id, status: { in: ['FAILED', 'RECONCILIATION_REQUIRED'] } },
    });
    await tx.quickBooksSyncRun.update({
      where: { id: s.runId },
      data: { completedAt: new Date(), status: failed ? 'ERROR' : 'COMPLETED' },
    });
    if (!failed && s.companyVerified)
      await tx.quickBooksConnection.update({
        where: { id: c.id },
        data: { lastSuccessfulSyncAt: new Date() },
      });
    return 'Session closed.';
  });
}
