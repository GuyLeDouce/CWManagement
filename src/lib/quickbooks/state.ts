import { Tx, audit } from '../db';
import { Actor, can, requireCapability } from '../permissions';
import { isExternal } from '../external-identity';
import { ensure } from '../errors';
export async function lockConnection(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quickbooks:${id}`}, 0))`;
}
export async function qbActor(tx: Tx, id: string) {
  const actor = await tx.user.findUnique({ where: { id } });
  ensure(actor?.active && !isExternal(actor), 'Configured accounting operator is unavailable.');
  await requireCapability(actor, 'QUICKBOOKS_QUEUE', tx);
  return actor;
}
export async function qbAudit(
  tx: Tx,
  actorId: string | null,
  action: string,
  id: string,
  metadata: object = {},
) {
  await audit(tx, actorId, action, 'QuickBooks', id, null, metadata);
}
export async function issue(
  tx: Tx,
  connectionId: string,
  key: string,
  code: string,
  message: string,
  jobId?: string,
  qbStatusCode?: string,
  retryable = false,
) {
  const previous = await tx.quickBooksSyncIssue.findUnique({ where: { key } });
  const row = await tx.quickBooksSyncIssue.upsert({
    where: { key },
    create: { connectionId, key, code, message, jobId, qbStatusCode, retryable },
    update: {
      code,
      message,
      qbStatusCode,
      retryable,
      resolvedAt: null,
      resolvedById: null,
      resolution: null,
    },
  });
  if (!previous || previous.resolvedAt) {
    const users = await tx.user.findMany({ where: { active: true } });
    for (const user of users)
      if (!isExternal(user) && (await can(user, 'QUICKBOOKS_VIEW', tx)))
        await tx.notification.create({
          data: {
            userId: user.id,
            type: 'GENERAL',
            title: 'QuickBooks requires attention',
            message,
            actionUrl: '/financials/quickbooks',
            entityType: 'QuickBooksSyncIssue',
            entityId: row.id,
          },
        });
    await qbAudit(tx, null, 'QUICKBOOKS_ISSUE', row.id, { code, jobId, qbStatusCode });
  }
  return row;
}
export async function resolveIssue(tx: Tx, actor: Actor, id: string, note: string) {
  await tx.quickBooksSyncIssue.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedById: actor.id, resolution: note },
  });
  await qbAudit(tx, actor.id, 'QUICKBOOKS_ISSUE_RESOLVED', id, { note });
}
export async function changedTime(tx: Tx, segmentId: string) {
  const mappings = await tx.accountingSyncMapping.findMany({
    where: {
      entityType: 'TIME',
      entityId: segmentId,
      connectionId: { not: null },
      status: 'CONFLICT',
    },
  });
  for (const m of mappings)
    await issue(
      tx,
      m.connectionId!,
      'time:' + segmentId,
      'TIME_CHANGED',
      'Approved time changed after QuickBooks synchronization. Controller reconciliation is required.',
    );
}
