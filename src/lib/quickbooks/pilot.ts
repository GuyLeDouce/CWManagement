import { QuickBooksConnection } from '@prisma/client';
import { z } from 'zod';
import { Tx, transaction, json } from '../db';
import { Actor, requireCapability } from '../permissions';
import { ensure } from '../errors';
import { mapping, localEntity } from './mapping';
import { lockConnection, qbAudit } from './state';
import { digest } from '../crypto';

export const pilotSchema = z
  .object({
    projectId: z.string().min(1),
    vendorContactId: z.string().min(1),
    employeeId: z.string().min(1),
    costCodeIds: z.array(z.string().min(1)).min(1).max(100),
    purchasingRevisionId: z.string().min(1),
    timeSegmentIds: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();
export type Pilot = z.infer<typeof pilotSchema>;
export const scopeHash = (c: Pick<QuickBooksConnection, 'pilotConfig'>) =>
  digest(JSON.stringify(c.pilotConfig));
export function pilotConfig(c: Pick<QuickBooksConnection, 'pilotConfig'>): Pilot {
  const parsed = pilotSchema.safeParse(c.pilotConfig);
  ensure(
    parsed.success,
    'Choose and save the pilot Project, Vendor, Employee, Cost Codes, PO revision and approved time.',
  );
  return parsed.data;
}
export const liveSteps = [
  'CONNECTION',
  'COMPANY',
  'DISCOVERY',
  'MAPPINGS',
  'PO',
  'TIME',
  'BILL',
  'MODIFIED_BILL',
  'DUPLICATE_RETRY',
  'FAILURE_RECOVERY',
] as const;
export function financialMode(c: QuickBooksConnection) {
  ensure(
    c.active &&
      c.syncEnabled &&
      !c.companyMismatch &&
      c.boundCompanyHash &&
      ['PILOT', 'ACTIVE'].includes(c.mode),
    'Financial processing requires PILOT or ACTIVE mode and a verified company. DISCOVERY and PAUSED never apply costs.',
  );
}
export async function permitOutbound(
  tx: Tx,
  c: QuickBooksConnection,
  operation: string,
  entityId?: string | null,
) {
  financialMode(c);
  if (c.mode !== 'PILOT') return;
  const p = pilotConfig(c);
  ensure(
    operation === 'PURCHASE_ORDER' || operation === 'TIME',
    'Pilot permits only the allowlisted PO and time; list creation is disabled.',
  );
  if (operation === 'PURCHASE_ORDER') {
    ensure(
      entityId === p.purchasingRevisionId,
      'Purchase Order revision is not on the pilot allowlist.',
    );
    const r = await tx.purchasingRevision.findUniqueOrThrow({
      where: { id: entityId! },
      include: { document: true, lines: true },
    });
    ensure(
      r.document.projectId === p.projectId &&
        r.vendorContactId === p.vendorContactId &&
        r.lines.every((l) => p.costCodeIds.includes(l.costCodeId)),
      'Pilot PO must use only the pilot Project, Vendor and Cost Codes.',
    );
  } else {
    ensure(
      entityId && p.timeSegmentIds.includes(entityId),
      'TimeSegment is not on the pilot allowlist.',
    );
    const s = await tx.timeSegment.findUniqueOrThrow({
      where: { id: entityId! },
      include: { task: true },
    });
    ensure(
      s.jobsiteId === p.projectId &&
        s.userId === p.employeeId &&
        p.costCodeIds.includes(s.costCodeId ?? s.task?.defaultCostCodeId ?? ''),
      'Pilot time must use the pilot Project, Employee and Cost Codes.',
    );
  }
}
export async function pilotMappings(tx: Tx, c: QuickBooksConnection) {
  const p = pilotConfig(c);
  await localEntity(tx, 'PROJECT', p.projectId);
  await localEntity(tx, 'EMPLOYEE', p.employeeId);
  await localEntity(tx, 'VENDOR_CONTACT', p.vendorContactId);
  await mapping(tx, c.id, 'PROJECT', p.projectId);
  await mapping(tx, c.id, 'EMPLOYEE', p.employeeId);
  const v = await tx.contact.findUniqueOrThrow({ where: { id: p.vendorContactId } });
  const direct = await tx.accountingSyncMapping.findUnique({
    where: {
      connectionId_entityType_entityId: {
        connectionId: c.id,
        entityType: 'VENDOR_CONTACT',
        entityId: v.id,
      },
    },
  });
  await mapping(
    tx,
    c.id,
    direct ? 'VENDOR_CONTACT' : 'VENDOR_COMPANY',
    direct ? v.id : (v.companyId ?? ''),
  );
  for (const id of p.costCodeIds) {
    await localEntity(tx, 'COST_CODE', id);
    await mapping(tx, c.id, 'COST_CODE', id);
  }
  return p;
}
export async function preflight(tx: Tx, c: QuickBooksConnection) {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  let https = false;
  try {
    const u = new URL(process.env.APP_URL ?? '');
    https = u.protocol === 'https:' && !u.username && !u.password;
  } catch {}
  add('HTTPS APP_URL', https, 'The live pilot requires an explicit HTTPS application URL.');
  const migrations = await tx.$queryRaw<
    Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
  >`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
  add(
    'Database migrations',
    migrations.some((m) => m.migration_name === '202609280001_quickbooks_pilot' && m.finished_at) &&
      !migrations.some((m) => !m.finished_at && !m.rolled_back_at),
    'Pilot migration applied and no failed migrations.',
  );
  add(
    'Connector configured',
    c.active && c.syncEnabled && !!c.passwordHash,
    'Active connection with a hashed credential.',
  );
  add(
    'Company bound',
    !!c.boundCompanyHash && c.boundCompanyHash === c.companyHash && !c.companyMismatch,
    'Observed identity must match the explicitly bound company.',
  );
  add(
    'Backup confirmed',
    !!c.backupConfirmedAt,
    'Operator must confirm a recoverable QuickBooks backup.',
  );
  const critical = await tx.quickBooksSyncIssue.count({
    where: { connectionId: c.id, resolvedAt: null },
  });
  const badJobs = await tx.quickBooksSyncJob.count({
    where: {
      connectionId: c.id,
      status: { in: ['BLOCKED', 'FAILED', 'RECONCILIATION_REQUIRED', 'IN_PROGRESS'] },
    },
  });
  add(
    'Queue and errors',
    critical === 0 && badJobs === 0,
    'Finish outstanding requests and resolve blocked/failed/reconciliation jobs and issues.',
  );
  try {
    await pilotMappings(tx, c);
    add(
      'Pilot mappings',
      true,
      'Project, Vendor, Employee and Cost Codes mapped to active, recently discovered records.',
    );
  } catch (e) {
    add('Pilot mappings', false, e instanceof Error ? e.message : 'Pilot mapping review required.');
  }
  return checks;
}
export async function exitChecks(tx: Tx, c: QuickBooksConnection) {
  const parsed = pilotSchema.safeParse(c.pilotConfig);
  const p = parsed.success ? parsed.data : null;
  const revision = p
    ? await tx.purchasingRevision.findUnique({ where: { id: p.purchasingRevisionId } })
    : null;
  const imported = p
    ? await tx.actualCost.findMany({
        where: {
          externalSystem: 'QB:' + c.id,
          projectId: p.projectId,
          costCodeId: { in: p.costCodeIds },
          reversedAt: null,
        },
        select: { quickBooksTxnId: true },
      })
    : [];
  const eligibleBills = await tx.quickBooksBillMirror.findMany({
    where: {
      connectionId: c.id,
      txnId: { in: imported.map((a) => a.quickBooksTxnId!).filter(Boolean) },
      appliedAt: { not: null },
      suppressedAt: null,
    },
    select: { id: true },
  });
  const evidence = await tx.quickBooksValidationResult.findMany({
    where: { connectionId: c.id, companyHash: c.boundCompanyHash ?? '', scopeHash: scopeHash(c) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const missing = liveSteps.filter((step) => !evidence.find((e) => e.step === step)?.passed);
  const po = await tx.accountingSyncMapping.count({
    where: {
      connectionId: c.id,
      entityType: 'PURCHASE_ORDER',
      entityId: revision?.documentId ?? '',
      metadata: { path: ['revisionId'], equals: p?.purchasingRevisionId ?? '' },
      status: 'SYNCED',
      quickBooksTxnId: { not: null },
    },
  });
  const time = await tx.accountingSyncMapping.count({
    where: {
      connectionId: c.id,
      entityType: 'TIME',
      entityId: { in: p?.timeSegmentIds ?? [] },
      status: 'SYNCED',
      quickBooksTxnId: { not: null },
    },
  });
  const bill = eligibleBills.length;
  const modified = await tx.auditLog.count({
    where: {
      action: 'QUICKBOOKS_BILL_MODIFIED',
      entityId: {
        in: eligibleBills.map((b) => b.id),
      },
    },
  });
  const discovered = await tx.quickBooksSyncJob.findMany({
    where: {
      connectionId: c.id,
      status: 'SUCCEEDED',
      operation: { in: ['Customer', 'Vendor', 'Employee', 'Item'] },
    },
    select: { operation: true },
    distinct: ['operation'],
  });
  return {
    missing,
    po: po > 0,
    time: time > 0,
    bill: bill > 0,
    modified: modified > 0,
    discovery: discovered.length === 4,
    evidence,
  };
}
export const pilotSaveSchema = z
  .object({
    connectionId: z.string(),
    pilot: pilotSchema,
    backupConfirmed: z.boolean(),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export async function savePilot(actor: Actor, input: z.infer<typeof pilotSaveSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_CONFIGURE', tx);
    await lockConnection(tx, input.connectionId);
    const c = await tx.quickBooksConnection.findUniqueOrThrow({
      where: { id: input.connectionId },
    });
    ensure(
      ['DISCOVERY', 'PAUSED'].includes(c.mode),
      'Pause the connection before changing the pilot allowlist.',
    );
    ensure(
      !(await tx.quickBooksRequest.findFirst({
        where: { job: { connectionId: c.id }, completedAt: null, isWrite: true },
      })),
      'Resolve outstanding accounting writes before changing pilot scope.',
    );
    // Validate relationship scope now; full approval/mapping/tax checks also run before each export.
    const proposed = { ...c, pilotConfig: input.pilot, mode: 'PILOT' as const, syncEnabled: true };
    await pilotMappings(tx, proposed);
    await permitOutbound(tx, proposed, 'PURCHASE_ORDER', input.pilot.purchasingRevisionId);
    for (const id of input.pilot.timeSegmentIds) await permitOutbound(tx, proposed, 'TIME', id);
    await tx.quickBooksConnection.update({
      where: { id: c.id },
      data: {
        pilotConfig: json(input.pilot),
        backupConfirmedAt: input.backupConfirmed ? new Date() : null,
        liveValidatedAt: null,
      },
    });
    await qbAudit(tx, actor.id, 'QUICKBOOKS_PILOT_CONFIGURED', c.id, {
      pilot: input.pilot,
      backupConfirmed: input.backupConfirmed,
      reason: input.reason,
    });
    return { ok: true };
  });
}
export const evidenceSchema = z
  .object({
    connectionId: z.string(),
    step: z.enum(liveSteps),
    passed: z.boolean(),
    note: z.string().trim().min(10).max(4000),
    recordIds: z.string().trim().min(1).max(1000),
    desktopVersion: z.string().trim().min(1).max(100),
    connectorVersion: z.string().trim().min(1).max(100),
  })
  .strict();
export async function recordEvidence(actor: Actor, input: z.infer<typeof evidenceSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_RECONCILE', tx);
    await lockConnection(tx, input.connectionId);
    const c = await tx.quickBooksConnection.findUniqueOrThrow({
      where: { id: input.connectionId },
    });
    ensure(
      c.boundCompanyHash && !c.companyMismatch,
      'Bind and verify the company before recording live evidence.',
    );
    const result = await tx.quickBooksValidationResult.create({
      data: {
        ...input,
        actorId: actor.id,
        companyHash: c.boundCompanyHash,
        scopeHash: scopeHash(c),
      },
    });
    await tx.quickBooksConnection.update({
      where: { id: c.id },
      data: {
        liveValidatedAt: null,
        ...(!input.passed && c.mode === 'ACTIVE' ? { mode: 'PAUSED' as const } : {}),
      },
    });
    await qbAudit(tx, actor.id, 'QUICKBOOKS_LIVE_RESULT_RECORDED', result.id, {
      step: input.step,
      passed: input.passed,
    });
    return { ok: true };
  });
}
