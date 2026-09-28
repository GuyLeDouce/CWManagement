import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction, json } from '../db';
import { Actor, requireCapability } from '../permissions';
import { ensure } from '../errors';
import { hashPassword, randomToken } from '../crypto';
import { lockConnection, qbAudit, resolveIssue } from './state';
import { saveMapping, mappingSchema } from './mapping';
import { queue, queueSchema, enqueue } from './queue';
import { applyBill, holdBill, lineDecisionSchema } from './bills';
import { qwc, quickBooksUrl } from './qwc';
import {
  preflight,
  exitChecks,
  pilotSaveSchema,
  savePilot,
  evidenceSchema,
  recordEvidence,
} from './pilot';
import { previewRequest, pilotDashboard, runDetail } from './diagnostics';
export const configureSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    username: z.string().regex(/^[a-zA-Z0-9_.-]{3,100}$/),
    intervalMinutes: z.number().int().min(5).max(1440).default(30),
    importStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    mode: z.enum(['DISCOVERY', 'PILOT', 'ACTIVE', 'PAUSED']).default('DISCOVERY'),
    confirmActivation: z.boolean().default(false),
    activationReason: z.string().trim().max(1000).optional(),
    ownerOverride: z.boolean().default(false),
    syncEnabled: z.boolean().default(true),
    confirmCompany: z.boolean().default(false),
    rotatePassword: z.boolean().default(false),
    confirmRotation: z.boolean().default(false),
  })
  .strict();
export async function configure(actor: Actor, input: z.infer<typeof configureSchema>) {
  await requireCapability(actor, 'QUICKBOOKS_CONFIGURE');
  quickBooksUrl();
  const password = !input.id || input.rotatePassword ? randomToken() : null;
  const passwordHash = password ? await hashPassword(password) : null;
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_CONFIGURE', tx);
    const old = input.id
      ? await tx.quickBooksConnection.findUniqueOrThrow({ where: { id: input.id } })
      : null;
    if (old) await lockConnection(tx, old.id);
    ensure(
      !old || !input.rotatePassword || input.confirmRotation,
      'Confirm that rotating the password disconnects the existing Web Connector configuration.',
    );
    ensure(
      !old?.companyMismatch ||
        !input.syncEnabled ||
        (input.confirmCompany && old.companyHash === old.boundCompanyHash),
      'Company mismatch must be investigated; this screen cannot silently rebind accounting history.',
    );
    const bound = old?.boundCompanyHash ?? (input.confirmCompany ? old?.companyHash : null);
    ensure(
      !['ACTIVE', 'PILOT'].includes(input.mode) || bound,
      'Connect in discovery mode and confirm the company before activation.',
    );
    let liveValidatedAt = old?.liveValidatedAt;
    if (['PILOT', 'ACTIVE'].includes(input.mode) && old?.mode !== input.mode) {
      ensure(old, 'Configure discovery and bind a company first.');
      const checks = await preflight(tx, { ...old, boundCompanyHash: bound ?? null });
      const failures = checks.filter((x) => !x.ok);
      ensure(!failures.length, failures.map((x) => x.name + ': ' + x.detail).join(' '));
      if (input.mode === 'ACTIVE') {
        ensure(
          input.confirmActivation && input.activationReason && input.activationReason.length >= 10,
          'Explicit activation confirmation and a reason are required.',
        );
        const exit = await exitChecks(tx, old);
        const complete =
          !exit.missing.length &&
          exit.discovery &&
          exit.po &&
          exit.time &&
          exit.bill &&
          exit.modified;
        ensure(
          complete || (input.ownerOverride && actor.roles.includes('OWNER')),
          'Live pilot exit checks are incomplete. Only an Owner can override with a recorded reason.',
        );
        liveValidatedAt = complete ? new Date() : null;
        await qbAudit(tx, actor.id, 'QUICKBOOKS_ACTIVATION_AUTHORIZED', old.id, {
          reason: input.activationReason,
          override: !complete,
          missing: exit.missing,
        });
      }
    }
    if (input.importStartDate)
      ensure(!Number.isNaN(Date.parse(input.importStartDate)), 'Invalid import start date.');
    const data = {
      name: input.name,
      username: input.username,
      intervalMinutes: input.intervalMinutes,
      importStartDate: input.importStartDate ? new Date(input.importStartDate) : undefined,
      mode: input.mode,
      syncEnabled: input.syncEnabled,
      boundCompanyHash: bound,
      liveValidatedAt,
      ...(old?.companyMismatch && input.confirmCompany && old.companyHash === old.boundCompanyHash
        ? { companyMismatch: false, lastError: null }
        : {}),
      actorId: actor.id,
    };
    const row = old
      ? await tx.quickBooksConnection.update({
          where: { id: old.id },
          data: { ...data, ...(passwordHash ? { passwordHash } : {}) },
        })
      : await tx.quickBooksConnection.create({
          data: {
            ...data,
            passwordHash: passwordHash!,
            ownerGuid: randomUUID(),
            fileGuid: randomUUID(),
          },
        });
    if (!old?.boundCompanyHash && bound)
      await qbAudit(tx, actor.id, 'QUICKBOOKS_COMPANY_BOUND', row.id, {
        companyName: old?.companyName,
        companyFileName: old?.companyFileName,
        companyHash: bound,
      });
    if (passwordHash && old)
      await tx.quickBooksSyncSession.updateMany({
        where: { connectionId: old.id, completedAt: null },
        data: { expiresAt: new Date() },
      });
    await qbAudit(
      tx,
      actor.id,
      password ? 'QUICKBOOKS_CREDENTIAL_ROTATED' : 'QUICKBOOKS_CONFIGURED',
      row.id,
      { mode: row.mode, companyVerified: !!bound },
    );
    return { id: row.id, password };
  });
}
export async function dashboard(actor: Actor) {
  await requireCapability(actor, 'QUICKBOOKS_VIEW');
  const [
    connections,
    candidates,
    mappings,
    jobs,
    runs,
    issues,
    bills,
    projects,
    contacts,
    companies,
    employees,
    costCodes,
    purchasing,
    time,
  ] = await Promise.all([
    db.quickBooksConnection.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        active: true,
        mode: true,
        syncEnabled: true,
        intervalMinutes: true,
        companyName: true,
        companyFileName: true,
        companyHash: true,
        boundCompanyHash: true,
        companyMismatch: true,
        country: true,
        qbXmlVersion: true,
        lastCallback: true,
        lastConnectedAt: true,
        lastAuthenticatedAt: true,
        lastSuccessfulSyncAt: true,
        lastError: true,
        importStartDate: true,
        billCursor: true,
        pilotConfig: true,
        backupConfirmedAt: true,
        liveValidatedAt: true,
        lastAuthFailureAt: true,
      },
    }),
    db.quickBooksCandidate.findMany({ orderBy: { fullName: 'asc' } }),
    db.accountingSyncMapping.findMany({ where: { connectionId: { not: null } } }),
    db.quickBooksSyncJob.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        connectionId: true,
        entityId: true,
        operation: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        phase: true,
        payload: true,
      },
    }),
    db.quickBooksSyncRun.findMany({ take: 20, orderBy: { startedAt: 'desc' } }),
    db.quickBooksSyncIssue.findMany({
      where: { resolvedAt: null },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    }),
    db.quickBooksBillMirror.findMany({
      where: { status: { not: 'APPLIED' } },
      select: {
        id: true,
        connectionId: true,
        txnId: true,
        status: true,
        lastError: true,
        observedAt: true,
      },
      take: 100,
    }),
    db.project.findMany({
      where: { active: true, archivedAt: null },
      select: { id: true, name: true },
    }),
    db.contact.findMany({
      where: { active: true, types: { hasSome: ['VENDOR', 'SUBTRADE'] } },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.company.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { active: true, NOT: { roles: { hasSome: ['CLIENT', 'SUBTRADE', 'VENDOR'] } } },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.costCode.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
    db.purchasingRevision.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
        document: { type: 'PURCHASE_ORDER', cancelledAt: null },
      },
      select: { id: true, revision: true, document: { select: { number: true } } },
    }),
    db.timeSegment.findMany({
      where: { status: { in: ['PM_APPROVED', 'EXPORTED'] }, end: { not: null } },
      select: {
        id: true,
        effectiveStart: true,
        user: { select: { firstName: true, lastName: true } },
      },
      take: 200,
      orderBy: { effectiveStart: 'desc' },
    }),
  ]);
  return {
    observedAt: Date.now(),
    connections: connections.map((c) => ({
      ...c,
      health: !c.syncEnabled
        ? 'DISABLED'
        : c.companyMismatch
          ? 'COMPANY_MISMATCH'
          : c.mode === 'PAUSED'
            ? 'PAUSED'
            : c.lastAuthFailureAt &&
                (!c.lastAuthenticatedAt || c.lastAuthFailureAt > c.lastAuthenticatedAt)
              ? 'AUTHENTICATION_FAILURE'
              : !c.lastConnectedAt
                ? 'NEVER_CONNECTED'
                : Date.now() - c.lastConnectedAt.getTime() > c.intervalMinutes * 180000
                  ? 'STALE'
                  : issues.some((i) => i.connectionId === c.id)
                    ? 'REVIEW'
                    : 'CONNECTED_RECENTLY',
    })),
    candidates,
    mappings,
    jobs,
    runs,
    issues,
    bills,
    options: {
      PROJECT: projects,
      VENDOR_CONTACT: contacts.map((x) => ({ id: x.id, name: x.firstName + ' ' + x.lastName })),
      VENDOR_COMPANY: companies,
      EMPLOYEE: employees.map((x) => ({ id: x.id, name: x.firstName + ' ' + x.lastName })),
      COST_CODE: costCodes.map((x) => ({ id: x.id, name: x.code + ' ' + x.name })),
      ACCOUNT_COST_CODE: costCodes.map((x) => ({ id: x.id, name: x.code + ' ' + x.name })),
    },
    purchasing,
    time,
  };
}
export async function downloadQwc(actor: Actor, id: string) {
  await requireCapability(actor, 'QUICKBOOKS_CONFIGURE');
  return transaction(async (tx) => {
    const c = await tx.quickBooksConnection.findUniqueOrThrow({ where: { id } });
    await qbAudit(tx, actor.id, 'QUICKBOOKS_QWC_DOWNLOADED', id);
    return qwc(c);
  });
}
const actionSchema = z
  .object({
    action: z.enum([
      'retry',
      'resolve',
      'bill',
      'bill-preview',
      'bill-allocate',
      'bill-hold',
      'bill-restore',
      'approve-po',
      'verify-write',
      'refresh-po',
    ]),
    id: z.string().min(1),
    note: z.string().trim().min(3).max(1000),
    lineLinks: z.record(z.string(), z.string()).optional(),
    lineDecisions: z.record(z.string(), lineDecisionSchema).optional(),
    reviewedHash: z.string().optional(),
    txnId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export async function reconcile(actor: Actor, input: z.infer<typeof actionSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_RECONCILE', tx);
    if (input.action === 'resolve') {
      const row = await tx.quickBooksSyncIssue.findUniqueOrThrow({ where: { id: input.id } });
      await lockConnection(tx, row.connectionId);
      await resolveIssue(tx, actor, row.id, input.note);
      return { ok: true };
    }
    if (input.action.startsWith('bill')) {
      await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
      const row = await tx.quickBooksBillMirror.findUniqueOrThrow({ where: { id: input.id } });
      await lockConnection(tx, row.connectionId);
      if (input.action === 'bill-preview') return applyBill(tx, actor, row.id, { preview: true });
      if (input.action === 'bill-hold') {
        await holdBill(tx, actor, row.id, input.note);
        return { ok: true };
      }
      if (input.action === 'bill-restore') {
        await tx.quickBooksBillMirror.update({
          where: { id: row.id },
          data: {
            suppressedAt: null,
            appliedHash: null,
            status: 'REVIEW_REQUIRED',
            lastError: null,
          },
        });
        await qbAudit(tx, actor.id, 'QUICKBOOKS_BILL_RESTORED_FOR_REVIEW', row.id, {
          reason: input.note,
        });
        return { ok: true };
      }
      if (input.action === 'bill-allocate') {
        ensure(input.lineDecisions || input.lineLinks, 'Select a reviewed allocation.');
        await tx.quickBooksBillMirror.update({
          where: { id: row.id },
          data: {
            status: 'REVIEW_REQUIRED',
            ...(input.lineDecisions ? { lineDecisions: json(input.lineDecisions) } : {}),
            ...(input.lineLinks ? { lineLinks: json(input.lineLinks) } : {}),
          },
        });
        await qbAudit(tx, actor.id, 'QUICKBOOKS_BILL_ALLOCATION_REVIEWED', row.id, {
          reason: input.note,
          lineDecisions: input.lineDecisions,
          lineLinks: input.lineLinks,
        });
        return { ok: true };
      }
      if (input.lineLinks)
        await tx.quickBooksBillMirror.update({
          where: { id: row.id },
          data: { lineLinks: json(input.lineLinks) },
        });
      await applyBill(tx, actor, row.id, { reviewedHash: input.reviewedHash, reason: input.note });
      await qbAudit(tx, actor.id, 'QUICKBOOKS_BILL_REVIEW_REQUESTED', row.id, {
        reason: input.note,
      });
      return { ok: true };
    }
    const job = await tx.quickBooksSyncJob.findUniqueOrThrow({ where: { id: input.id } });
    await lockConnection(tx, job.connectionId);
    if (input.action === 'refresh-po') {
      ensure(
        job.operation === 'PURCHASE_ORDER' && job.status === 'RECONCILIATION_REQUIRED',
        'Choose a purchasing reconciliation job.',
      );
      ensure(
        !(await tx.quickBooksRequest.findFirst({
          where: { jobId: job.id, isWrite: true, completedAt: null },
        })),
        'Verify the uncertain accounting write before refreshing.',
      );
      await tx.quickBooksSyncJob.update({
        where: { id: job.id },
        data: { phase: 'INITIAL', status: 'PENDING' },
      });
      await qbAudit(tx, actor.id, 'QUICKBOOKS_PO_REFRESH_QUEUED', job.id, { note: input.note });
      return { ok: true };
    }
    if (input.action === 'verify-write') {
      ensure(
        job.status === 'RECONCILIATION_REQUIRED' && input.txnId,
        'Choose an uncertain transaction and its exact QuickBooks TxnID.',
      );
      const request = await tx.quickBooksRequest.findFirst({
        where: { jobId: job.id, isWrite: true, completedAt: null },
        include: { session: true },
        orderBy: { createdAt: 'desc' },
      });
      ensure(
        request &&
          ['PurchaseOrderAddRq', 'PurchaseOrderModRq', 'TimeTrackingAddRq'].includes(
            request.operation,
          ),
        'This operation cannot be adopted through transaction verification.',
      );
      ensure(
        request.session.completedAt || request.session.expiresAt < new Date(),
        'Close the old Web Connector session before reconciliation.',
      );
      const verify = await enqueue(
        tx,
        job.connectionId,
        'VERIFY_WRITE',
        `verify:${request.id}:${input.txnId}`,
        actor.id,
        { requestId: request.id, sourceJobId: job.id, txnId: input.txnId },
      );
      await tx.quickBooksSyncJob.update({
        where: { id: verify.id },
        data: { direction: 'IMPORT' },
      });
      await qbAudit(tx, actor.id, 'QUICKBOOKS_WRITE_VERIFICATION_QUEUED', job.id, {
        txnId: input.txnId,
        note: input.note,
      });
      return { ok: true };
    }
    if (input.action === 'approve-po') {
      ensure(
        job.operation === 'PURCHASE_ORDER' &&
          job.phase === 'MOD_REVIEW' &&
          job.status === 'RECONCILIATION_REQUIRED',
        'A current QuickBooks PO review is required.',
      );
      await tx.quickBooksSyncJob.update({
        where: { id: job.id },
        data: { phase: 'MOD_APPROVED', status: 'PENDING', lastError: null },
      });
      await qbAudit(tx, actor.id, 'QUICKBOOKS_PO_MODIFICATION_AUTHORIZED', job.id, {
        note: input.note,
      });
      return { ok: true };
    }
    ensure(
      ['FAILED', 'BLOCKED'].includes(job.status),
      'Only rejected or blocked jobs can be retried. An uncertain write requires verified reconciliation in QuickBooks.',
    );
    const outstanding = await tx.quickBooksRequest.findFirst({
      where: { jobId: job.id, isWrite: true, completedAt: null },
    });
    ensure(!outstanding, 'An accounting write may have executed; automatic resend is prohibited.');
    ensure(
      job.attempts < 5,
      'Five attempts reached. Resolve the source problem before a new integration review.',
    );
    await tx.quickBooksSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        sessionId: null,
        ...(job.operation === 'BILLS'
          ? { payload: json({ ...((job.payload ?? {}) as object), iteratorId: null }) }
          : {}),
        availableAt: new Date(Date.now() + Math.min(300, 2 ** job.attempts) * 1000),
        lastError: null,
      },
    });
    await qbAudit(tx, actor.id, 'QUICKBOOKS_RETRIED', job.id, { note: input.note });
    return { ok: true };
  });
}
export async function dispatchQuickBooks(actor: Actor, get: boolean, path: string, body: unknown) {
  if (get && path === 'dashboard') return dashboard(actor);
  if (!get && path === 'pilot') return savePilot(actor, pilotSaveSchema.parse(body));
  if (!get && path === 'evidence') return recordEvidence(actor, evidenceSchema.parse(body));
  if (!get && path === 'preflight')
    return pilotDashboard(
      actor,
      z.object({ connectionId: z.string() }).strict().parse(body).connectionId,
    );
  if (!get && path === 'preview')
    return previewRequest(
      actor,
      z
        .object({
          connectionId: z.string(),
          operation: z.enum(['PURCHASE_ORDER', 'TIME']),
          entityId: z.string(),
        })
        .strict()
        .parse(body),
    );
  if (!get && path === 'run')
    return runDetail(actor, z.object({ id: z.string() }).strict().parse(body).id);
  if (!get && path === 'configure') return configure(actor, configureSchema.parse(body));
  if (!get && path === 'mapping') return saveMapping(actor, mappingSchema.parse(body));
  if (!get && path === 'queue') return queue(actor, queueSchema.parse(body));
  if (!get && path === 'reconcile') return reconcile(actor, actionSchema.parse(body));
  ensure(false, 'QuickBooks action not found.', 404);
}
