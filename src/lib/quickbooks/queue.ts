import { z } from 'zod';
import { Actor, requireCapability } from '../permissions';
import { transaction, Tx, json } from '../db';
import { ensure } from '../errors';
import { lockConnection, qbAudit } from './state';
export const queueSchema = z
  .object({
    connectionId: z.string().min(1),
    operation: z.enum([
      'DISCOVERY',
      'BILLS',
      'PURCHASE_ORDER',
      'TIME',
      'CREATE_PROJECT',
      'CREATE_VENDOR',
    ]),
    entityId: z.string().optional(),
    name: z.string().trim().max(41).optional(),
    parentListId: z.string().max(100).optional(),
  })
  .strict();
export async function enqueue(
  tx: Tx,
  connectionId: string,
  operation: string,
  key: string,
  actorId: string,
  payload: unknown = {},
  entityId?: string,
  priority = 0,
) {
  return tx.quickBooksSyncJob.upsert({
    where: { requestKey: key },
    create: {
      connectionId,
      operation,
      entityType: operation,
      entityId,
      actorId,
      requestKey: key,
      payload: json(payload),
      priority,
      direction: ['Company', 'Customer', 'Vendor', 'Employee', 'Item', 'Account', 'BILLS'].includes(
        operation,
      )
        ? 'IMPORT'
        : 'EXPORT',
    },
    update: {},
  });
}
export async function queue(actor: Actor, input: z.infer<typeof queueSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_QUEUE', tx);
    await lockConnection(tx, input.connectionId);
    const c = await tx.quickBooksConnection.findUniqueOrThrow({
      where: { id: input.connectionId },
    });
    ensure(
      c.active && c.syncEnabled && !c.companyMismatch,
      'Connection is disabled or its company needs review.',
    );
    if (input.operation === 'DISCOVERY') {
      for (const op of ['Company', 'Customer', 'Vendor', 'Employee', 'Item', 'Account']) {
        const pending = await tx.quickBooksSyncJob.findFirst({
          where: { connectionId: c.id, operation: op, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        });
        if (!pending) await enqueue(tx, c.id, op, `${c.id}:${op}:${crypto.randomUUID()}`, actor.id);
      }
    } else if (input.operation === 'BILLS') {
      ensure(
        c.importStartDate && c.boundCompanyHash,
        'Verify the company and choose a historical import date first.',
      );
      const pending = await tx.quickBooksSyncJob.findFirst({
        where: {
          connectionId: c.id,
          operation: 'BILLS',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      });
      if (!pending)
        await enqueue(tx, c.id, 'BILLS', `${c.id}:BILLS:${crypto.randomUUID()}`, actor.id, {
          from: c.billCursor ? new Date(c.billCursor.getTime() - 300000).toISOString() : null,
          startedAt: new Date().toISOString(),
        });
    } else {
      ensure(
        c.mode === 'ACTIVE' && c.boundCompanyHash,
        'Activate this verified connection before queuing outbound records.',
      );
      ensure(input.entityId, 'Select a source record.');
      await enqueue(
        tx,
        c.id,
        input.operation,
        `${c.id}:${input.operation}:${input.entityId}`,
        actor.id,
        input,
        input.entityId,
      );
    }
    await qbAudit(tx, actor.id, 'QUICKBOOKS_QUEUED', c.id, {
      operation: input.operation,
      entityId: input.entityId,
    });
    return { ok: true };
  });
}
