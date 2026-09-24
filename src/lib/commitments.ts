import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, transaction, Tx } from './db';
import { ensure } from './errors';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { publishProjectEvent } from './activity';
import { money } from './financial-math';

export function fulfillmentState(
  lines: { committedAmount: Prisma.Decimal.Value; consumedAmount: Prisma.Decimal.Value }[],
) {
  const committed = lines.reduce((a, x) => a.add(x.committedAmount), money(0));
  const consumed = lines.reduce((a, x) => a.add(x.consumedAmount), money(0));
  return consumed.gte(committed)
    ? 'FULFILLED'
    : consumed.gt(0)
      ? 'PARTIALLY_FULFILLED'
      : 'COMMITTED';
}
export async function refreshCommitment(tx: Tx, id: string, actor: Actor) {
  const item = await tx.commitment.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  if (item.status === 'CANCELLED') return;
  const status = fulfillmentState(item.lines);
  await tx.commitment.update({ where: { id }, data: { status } });
  if (item.purchasingDocumentId)
    await tx.purchasingRevision.updateMany({
      where: {
        documentId: item.purchasingDocumentId,
        status: { in: ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
      },
      data: { status: status === 'COMMITTED' ? 'ISSUED' : status },
    });
  if (status !== item.status)
    await publishProjectEvent(tx, {
      projectId: item.projectId,
      actorId: actor.id,
      action: 'COMMITMENT_' + status,
      entity: 'Commitment',
      entityId: id,
      description:
        'Updated purchasing fulfillment status to ' +
        status.toLowerCase().replaceAll('_', ' ') +
        '.',
      before: { status: item.status },
      after: { status },
    });
}
export async function consumeCommitment(
  tx: Tx,
  actor: Actor,
  input: {
    projectId: string;
    costCodeId: string;
    costType: string;
    amount: Prisma.Decimal.Value;
    commitmentLineId: string;
  },
) {
  await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
  await requireProjectAccess(actor, input.projectId, tx);
  const line = await tx.commitmentLine.findUnique({
    where: { id: input.commitmentLineId },
    include: { commitment: true },
  });
  ensure(
    line && line.commitment.projectId === input.projectId,
    'Commitment line must belong to this project.',
  );
  ensure(
    line.costCodeId === input.costCodeId && line.costType === input.costType,
    'Actual cost classification must match the commitment line.',
  );
  ensure(
    ['COMMITTED', 'PARTIALLY_FULFILLED', 'FULFILLED'].includes(line.commitment.status),
    'Only an issued commitment can be fulfilled.',
  );
  const amount = money(input.amount);
  ensure(amount.gt(0), 'Linked actual cost must be positive; use reversal to correct an invoice.');
  ensure(
    line.consumedAmount.add(amount).lte(line.committedAmount),
    'Actual cost exceeds remaining commitment. Revise and issue the purchase/work order first.',
    409,
  );
  await tx.commitmentLine.update({
    where: { id: line.id },
    data: { consumedAmount: { increment: amount } },
  });
  return line;
}
export const reconcileSchema = z
  .object({ id: z.string().min(1), commitmentLineId: z.string().min(1) })
  .strict();
export async function reportOverage(actor: Actor, lineId: string | undefined, error: unknown) {
  if (
    !lineId ||
    !(error instanceof Error) ||
    !error.message.startsWith('Actual cost exceeds remaining commitment.')
  )
    return;
  await transaction(async (tx) => {
    await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
    const line = await tx.commitmentLine.findUniqueOrThrow({
      where: { id: lineId },
      include: { commitment: true },
    });
    await requireProjectAccess(actor, line.commitment.projectId, tx);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id + ':' + lineId}, 0))`;
    const pending = await tx.notification.findFirst({
      where: { userId: actor.id, entityType: 'CommitmentOverage', entityId: lineId, readAt: null },
    });
    if (pending) return;
    await tx.notification.create({
      data: {
        userId: actor.id,
        projectId: line.commitment.projectId,
        type: 'GENERAL',
        title: 'Purchasing revision required',
        message:
          'An invoice exceeds the remaining commitment. Ask an authorized approver to revise and issue the purchasing document.',
        entityType: 'CommitmentOverage',
        entityId: lineId,
        actionUrl: '/projects/' + line.commitment.projectId + '/purchase-orders',
      },
    });
    await publishProjectEvent(tx, {
      projectId: line.commitment.projectId,
      actorId: actor.id,
      action: 'COMMITMENT_OVERAGE_REJECTED',
      entity: 'Commitment',
      entityId: line.commitmentId,
      description: 'An invoice exceeded its remaining commitment; purchasing revision is required.',
    });
  });
}
export async function reconcileActual(actor: Actor, input: z.infer<typeof reconcileSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
    const actual = await tx.actualCost.findUnique({ where: { id: input.id } });
    ensure(
      actual && !actual.reversedAt && !actual.commitmentLineId,
      'Choose an unreversed, unreconciled actual cost.',
    );
    const line = await consumeCommitment(tx, actor, {
      ...actual,
      commitmentLineId: input.commitmentLineId,
    });
    const saved = await tx.actualCost.update({
      where: { id: actual.id },
      data: { commitmentLineId: line.id, vendorContactId: line.commitment.vendorContactId },
    });
    await refreshCommitment(tx, line.commitmentId, actor);
    await publishProjectEvent(tx, {
      projectId: actual.projectId,
      actorId: actor.id,
      action: 'ACTUAL_COST_RECONCILED',
      entity: 'ActualCost',
      entityId: actual.id,
      description: 'Applied an actual cost to a purchasing commitment.',
      metadata: { commitmentLineId: line.id },
    });
    return saved;
  }).catch(async (error) => {
    await reportOverage(actor, input.commitmentLineId, error);
    throw error;
  });
}
export const reversalSchema = z
  .object({ id: z.string().min(1), reason: z.string().trim().min(3).max(1000) })
  .strict();
export async function reverseActual(actor: Actor, input: z.infer<typeof reversalSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
    const actual = await tx.actualCost.findUnique({ where: { id: input.id } });
    ensure(actual, 'Actual cost not found.', 404);
    await requireProjectAccess(actor, actual.projectId, tx);
    ensure(!actual.reversedAt, 'Actual cost already reversed.', 409);
    ensure(
      actual.sourceType === 'MANUAL',
      'Imported actual costs must be corrected through their source system.',
    );
    if (actual.commitmentLineId) {
      const line = await tx.commitmentLine.findUniqueOrThrow({
        where: { id: actual.commitmentLineId },
      });
      ensure(line.consumedAmount.gte(actual.amount), 'Reversal would make consumption negative.');
      await tx.commitmentLine.update({
        where: { id: line.id },
        data: { consumedAmount: { decrement: actual.amount } },
      });
      await refreshCommitment(tx, line.commitmentId, actor);
    }
    const saved = await tx.actualCost.update({
      where: { id: actual.id },
      data: { reversedAt: new Date(), reversedById: actor.id, reversalReason: input.reason },
    });
    await publishProjectEvent(tx, {
      projectId: actual.projectId,
      actorId: actor.id,
      action: 'ACTUAL_COST_REVERSED',
      entity: 'ActualCost',
      entityId: actual.id,
      description: 'Reversed an actual cost and reconciled its commitment.',
      reason: input.reason,
      metadata: { commitmentLineId: actual.commitmentLineId },
    });
    return saved;
  });
}
export async function commitmentLedger(actor: Actor, projectId: string) {
  await requireCapability(actor, 'COMMITMENT_VIEW');
  await requireProjectAccess(actor, projectId);
  return db.commitment.findMany({
    where: { projectId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  });
}
export async function actualLedger(actor: Actor, projectId: string) {
  await requireCapability(actor, 'ACTUAL_COST_VIEW');
  await requireProjectAccess(actor, projectId);
  return db.actualCost.findMany({
    where: { projectId },
    include: {
      costCode: { select: { code: true, name: true } },
      commitmentLine: { include: { commitment: { select: { reference: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
