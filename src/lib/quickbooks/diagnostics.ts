import { QuickBooksSyncJob } from '@prisma/client';
import { transaction } from '../db';
import { Actor, requireCapability } from '../permissions';
import { ensure, AppError } from '../errors';
import { buildRequest } from './requests';
import { preflight, exitChecks } from './pilot';
import { object, qbRequest } from './xml';
import { lockConnection } from './state';

export async function previewRequest(
  actor: Actor,
  input: { connectionId: string; operation: 'PURCHASE_ORDER' | 'TIME'; entityId: string },
) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_QUEUE', tx);
    await lockConnection(tx, input.connectionId);
    const c = await tx.quickBooksConnection.findUniqueOrThrow({
      where: { id: input.connectionId },
    });
    // No queue insert, request evidence, version update or remote call during preview.
    const job = {
      operation: input.operation,
      entityId: input.entityId,
      payload: {},
      phase: 'INITIAL',
    } as QuickBooksSyncJob;
    try {
      const request = await buildRequest(tx, c, job, true);
      const ids = JSON.stringify(request.data);
      const refs = await tx.accountingSyncMapping.findMany({
        where: { connectionId: c.id, quickBooksListId: { not: null } },
        select: { entityType: true, quickBooksListId: true, quickBooksFullName: true },
      });
      return {
        ready: true,
        blocker: null,
        operation: request.operation,
        sourceId: input.entityId,
        values: request.data,
        references: refs.filter((r) => ids.includes(JSON.stringify(r.quickBooksListId))),
        xml: qbRequest(request.operation, request.data, 'preview'),
      };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      return {
        ready: false,
        blocker: e instanceof Error ? e.message : 'Preflight failed.',
        operation: input.operation,
        sourceId: input.entityId,
        values: {},
        references: [],
        xml: null,
      };
    }
  });
}
export async function pilotDashboard(actor: Actor, id: string) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_VIEW', tx);
    const c = await tx.quickBooksConnection.findUniqueOrThrow({ where: { id } });
    const checks = await preflight(tx, c),
      exit = await exitChecks(tx, c);
    const discovered = await tx.quickBooksSyncJob.findMany({
      where: {
        connectionId: id,
        operation: { in: ['Customer', 'Vendor', 'Employee', 'Item'] },
        status: 'SUCCEEDED',
      },
      select: { operation: true, completedAt: true },
    });
    const bills = await tx.quickBooksBillMirror.findMany({
      where: { connectionId: id },
      take: 100,
      orderBy: { observedAt: 'desc' },
    });
    const actuals = await tx.actualCost.findMany({
      where: { externalSystem: 'QB:' + id },
      select: {
        id: true,
        quickBooksTxnId: true,
        amount: true,
        commitmentLineId: true,
        reversedAt: true,
        projectId: true,
        costCodeId: true,
      },
    });
    const commitments = await tx.commitmentLine.findMany({
      where: { commitment: { projectId: (object(c.pilotConfig).projectId as string) ?? '' } },
      select: {
        id: true,
        description: true,
        committedAmount: true,
        consumedAmount: true,
        costCodeId: true,
      },
    });
    return {
      checks,
      exit,
      discovered,
      mode: c.mode,
      unrestricted: c.mode === 'ACTIVE',
      authenticatedAt: c.lastAuthenticatedAt,
      companyName: c.companyName,
      bound: !!c.boundCompanyHash && !c.companyMismatch,
      status: c.companyMismatch
        ? 'COMPANY MISMATCH — FINANCIAL PROCESSING STOPPED'
        : c.liveValidatedAt
          ? c.mode === 'ACTIVE'
            ? 'PRODUCTION ACTIVE'
            : 'LIVE VALIDATED'
          : exit.evidence.length
            ? 'LIVE VALIDATION IN PROGRESS'
            : 'IMPLEMENTED — LIVE VALIDATION PENDING',
      bills: bills.map((b) => ({
        id: b.id,
        txnId: b.txnId,
        status: b.status,
        lastError: b.lastError,
        payload: b.payload,
        editSequence: b.editSequence,
        suppressedAt: b.suppressedAt,
        lineDecisions: b.lineDecisions,
        lineLinks: b.lineLinks,
        actuals: actuals.filter((a) => a.quickBooksTxnId === b.txnId),
      })),
      commitments,
    };
  });
}
export async function runDetail(actor: Actor, id: string) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_VIEW', tx);
    const run = await tx.quickBooksSyncRun.findUnique({
      where: { id },
      include: { session: { select: { id: true } } },
    });
    ensure(run, 'Run not found.', 404);
    const requests = await tx.quickBooksRequest.findMany({
      where: { sessionId: run.session?.id ?? '' },
      select: {
        id: true,
        operation: true,
        isWrite: true,
        createdAt: true,
        completedAt: true,
        statusCode: true,
        result: true,
        job: {
          select: { id: true, entityType: true, entityId: true, status: true, lastError: true },
        },
      },
    });
    const jobs = await tx.quickBooksSyncJob.findMany({
      where: { sessionId: run.session?.id ?? '' },
      select: { id: true, operation: true, entityId: true, status: true, lastError: true },
    });
    return {
      run: {
        id: run.id,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        mode: run.mode,
        companyName: run.companyName,
        qbXmlVersion: run.qbXmlVersion,
        status: run.status,
        requestsSent: run.requestsSent,
      },
      requests,
      jobs,
    };
  });
}
