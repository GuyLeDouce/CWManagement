import { NotificationType, Prisma } from '@prisma/client';
import { json, Tx } from './db';

export type ProjectEventInput = {
  projectId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  description: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  reason?: string;
};

export async function publishProjectEvent(tx: Tx, event: ProjectEventInput) {
  return tx.auditLog.create({
    data: {
      actorId: event.actorId,
      projectId: event.projectId,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      description: event.description,
      before: event.before == null ? Prisma.JsonNull : json(event.before),
      after: event.after == null ? Prisma.JsonNull : json(event.after),
      metadata: event.metadata == null ? Prisma.JsonNull : json(event.metadata),
      reason: event.reason,
    },
    include: { actor: { select: { firstName: true, lastName: true } } },
  });
}

export async function notify(
  tx: Tx,
  input: {
    userId: string;
    projectId?: string;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl?: string;
    entityType?: string;
    entityId?: string;
  },
) {
  return tx.notification.create({ data: input });
}
