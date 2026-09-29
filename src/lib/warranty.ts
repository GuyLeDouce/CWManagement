import { Prisma, WarrantyStatus } from '@prisma/client';
import { z } from 'zod';
import { db, Tx, transaction } from './db';
import { Actor, projectScope, requireCapability, requireProjectAccess } from './permissions';
import { requireClientProjectAccess } from './client-access';
import { requireTradeProjectAccess, projectTrade } from './trade-access';
import { isExternal, isTrade } from './external-identity';
import { ensure } from './errors';
import { publishProjectEvent } from './activity';

const publicFields = {
  id: true,
  number: true,
  title: true,
  description: true,
  location: true,
  category: true,
  status: true,
  dueAt: true,
  appointmentAt: true,
  clientNotes: true,
  createdAt: true,
  completedAt: true,
  clientVerifiedAt: true,
  version: true,
} satisfies Prisma.WarrantyRequestSelect;
const fileFields = {
  id: true,
  originalFilename: true,
  mimeType: true,
  caption: true,
  uploadedAt: true,
} satisfies Prisma.StoredFileSelect;
export async function warrantyProjection(tx: Tx, projectId: string, contactId?: string) {
  if (!contactId) return [];
  return tx.warrantyRequest.findMany({
    where: { projectId, clientContactId: contactId },
    select: {
      ...publicFields,
      updates: {
        where: { audience: 'CLIENT' },
        select: { id: true, body: true, createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      },
      files: { where: { visibility: 'CLIENT', archivedAt: null }, select: fileFields },
    },
    orderBy: { createdAt: 'desc' },
  });
}
export async function tradeWarrantyProjection(tx: Tx, projectId: string, contactId: string) {
  return tx.warrantyRequest.findMany({
    where: { projectId, assignedTradeId: contactId },
    select: {
      id: true,
      number: true,
      title: true,
      tradeDescription: true,
      location: true,
      status: true,
      dueAt: true,
      appointmentAt: true,
      version: true,
      updates: {
        where: { audience: 'TRADE' },
        select: { id: true, body: true, createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      },
      files: {
        where: { visibility: 'TRADE', archivedAt: null, tradeShares: { some: { contactId } } },
        select: fileFields,
      },
    },
    orderBy: { dueAt: 'asc' },
  });
}
export async function warrantyAccess(tx: Tx, actor: Actor, id: string) {
  const r = await tx.warrantyRequest.findUnique({ where: { id } });
  ensure(r, 'Service request unavailable.', 404);
  if (actor.roles.includes('CLIENT')) {
    const g = await requireClientProjectAccess(actor, r.projectId, tx);
    ensure(r.clientContactId === g.contactId, 'Service request unavailable.', 404);
  } else if (isTrade(actor)) {
    const g = await requireTradeProjectAccess(actor, r.projectId, tx);
    ensure(r.assignedTradeId === g.contactId, 'Service request unavailable.', 404);
  } else {
    await requireCapability(actor, 'WARRANTY_VIEW', tx);
    await requireProjectAccess(actor, r.projectId, tx);
  }
  return r;
}
export const warrantyCreateSchema = z
  .object({
    projectId: z.string(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
    location: z.string().max(200).default(''),
    category: z.string().max(100).default(''),
    clientContactId: z.string().nullable().optional(),
  })
  .strict();
async function event(
  tx: Tx,
  actor: Actor,
  r: { id: string; projectId: string; number: string; assignedUserId: string | null },
  action: string,
) {
  await publishProjectEvent(tx, {
    actorId: actor.id,
    projectId: r.projectId,
    entity: 'WarrantyRequest',
    entityId: r.id,
    action,
    description: `Service request ${r.number} updated.`,
  });
  const recipients = await tx.projectAssignment.findMany({
    where: { projectId: r.projectId, role: 'PRIMARY_PROJECT_MANAGER' },
    select: { userId: true },
  });
  for (const userId of new Set([
    ...recipients.map((x) => x.userId),
    ...(r.assignedUserId ? [r.assignedUserId] : []),
  ])) {
    if (userId !== actor.id)
      await tx.notification.create({
        data: {
          userId,
          projectId: r.projectId,
          type: 'GENERAL',
          title: 'Warranty action',
          message: `Service request ${r.number} needs review.`,
          actionUrl: `/projects/${r.projectId}/warranty`,
        },
      });
  }
  const request = await tx.warrantyRequest.findUniqueOrThrow({ where: { id: r.id } });
  if (request.clientContactId)
    for (const g of await tx.clientProjectAccess.findMany({
      where: {
        projectId: r.projectId,
        contactId: request.clientContactId,
        active: true,
        revokedAt: null,
      },
    })) {
      if (g.userId !== actor.id)
        await tx.notification.create({
          data: {
            userId: g.userId,
            projectId: r.projectId,
            type: 'GENERAL',
            title: 'Service request updated',
            message: `Review ${r.number} in your portal.`,
            actionUrl: `/client/projects/${r.projectId}/warranty`,
          },
        });
    }
  if (request.assignedTradeId)
    for (const g of await tx.tradeProjectAccess.findMany({
      where: {
        projectId: r.projectId,
        contactId: request.assignedTradeId,
        active: true,
        revokedAt: null,
      },
    })) {
      if (g.userId !== actor.id)
        await tx.notification.create({
          data: {
            userId: g.userId,
            projectId: r.projectId,
            type: 'GENERAL',
            title: 'Assigned service work updated',
            message: `Review ${r.number} in your portal.`,
            actionUrl: `/trade/projects/${r.projectId}/warranty`,
          },
        });
    }
}
export async function createWarranty(actor: Actor, raw: unknown) {
  const i = warrantyCreateSchema.parse(raw);
  return transaction(async (tx) => {
    let clientContactId = i.clientContactId || null;
    if (actor.roles.includes('CLIENT')) {
      const g = await requireClientProjectAccess(actor, i.projectId, tx);
      clientContactId = g.contactId;
    } else {
      await requireCapability(actor, 'WARRANTY_MANAGE', tx);
      await requireProjectAccess(actor, i.projectId, tx);
      if (clientContactId)
        ensure(
          await tx.projectContact.findFirst({
            where: {
              projectId: i.projectId,
              contactId: clientContactId,
              role: 'CLIENT',
              contact: { active: true },
            },
          }),
          'Choose a project client.',
        );
    }
    const counter = await tx.settings.update({
      where: { id: 'company' },
      data: { nextWarrantyNumber: { increment: 1 } },
      select: { nextWarrantyNumber: true },
    });
    const row = await tx.warrantyRequest.create({
      data: {
        ...i,
        clientContactId,
        number: `SR-${counter.nextWarrantyNumber - 1}`,
        createdById: actor.id,
      },
    });
    await event(tx, actor, row, 'WARRANTY_SUBMITTED');
    return { id: row.id };
  });
}
export const warrantyActionSchema = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
    action: z.enum([
      'review',
      'accept',
      'reject',
      'assign',
      'schedule',
      'start',
      'ready',
      'complete',
      'verify',
      'close',
      'reopen',
      'comment',
      'acknowledge',
    ]),
    body: z.string().trim().max(10000).default(''),
    audience: z.enum(['INTERNAL', 'CLIENT', 'TRADE']).default('INTERNAL'),
    assignedUserId: z.string().nullable().optional(),
    assignedTradeId: z.string().nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    appointmentAt: z.string().datetime({ offset: true }).nullable().optional(),
    tradeDescription: z.string().max(10000).optional(),
    internalNotes: z.string().max(10000).optional(),
    clientNotes: z.string().max(10000).optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  })
  .strict();
const transitions: Record<string, { from: WarrantyStatus[]; to: WarrantyStatus }> = {
  review: { from: ['SUBMITTED'], to: 'REVIEWING' },
  accept: { from: ['SUBMITTED', 'REVIEWING'], to: 'ACCEPTED' },
  reject: { from: ['SUBMITTED', 'REVIEWING'], to: 'NOT_WARRANTY' },
  assign: { from: ['ACCEPTED', 'ASSIGNED'], to: 'ASSIGNED' },
  schedule: { from: ['ACCEPTED', 'ASSIGNED', 'SCHEDULED'], to: 'SCHEDULED' },
  start: { from: ['ASSIGNED', 'SCHEDULED'], to: 'IN_PROGRESS' },
  ready: { from: ['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'], to: 'READY_FOR_REVIEW' },
  complete: {
    from: ['ACCEPTED', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'READY_FOR_REVIEW'],
    to: 'READY_FOR_CLIENT',
  },
  verify: { from: ['READY_FOR_CLIENT'], to: 'CLIENT_VERIFIED' },
  close: { from: ['CLIENT_VERIFIED', 'NOT_WARRANTY'], to: 'CLOSED' },
  reopen: {
    from: ['READY_FOR_REVIEW', 'READY_FOR_CLIENT', 'CLIENT_VERIFIED', 'CLOSED', 'NOT_WARRANTY'],
    to: 'REVIEWING',
  },
};
export async function actWarranty(actor: Actor, raw: unknown) {
  const i = warrantyActionSchema.parse(raw);
  return transaction(async (tx) => {
    const r = await warrantyAccess(tx, actor, i.id);
    ensure(r.version === i.version, 'Service request changed. Reload before continuing.', 409);
    const external = isExternal(actor),
      trade = isTrade(actor),
      client = actor.roles.includes('CLIENT');
    if (client)
      ensure(
        ['verify', 'comment'].includes(i.action),
        'Clients may comment or verify completed work.',
        403,
      );
    else if (trade)
      ensure(
        ['start', 'ready', 'comment', 'acknowledge'].includes(i.action),
        'Trades cannot determine coverage or close requests.',
        403,
      );
    else await requireCapability(actor, 'WARRANTY_MANAGE', tx);
    if (external)
      ensure(
        i.assignedUserId === undefined &&
          i.assignedTradeId === undefined &&
          i.dueAt === undefined &&
          i.appointmentAt === undefined &&
          i.internalNotes === undefined &&
          i.clientNotes === undefined &&
          i.tradeDescription === undefined &&
          i.priority === undefined,
        'Staff controls are unavailable.',
        403,
      );
    if (!client)
      ensure(i.action !== 'verify', 'Only the reporting client may verify completion.', 403);
    ensure(
      !['reject', 'reopen', 'comment'].includes(i.action) || i.body.length > 0,
      'Add a reason or comment.',
    );
    let status = r.status;
    if (i.action === 'close' && !external && !r.clientContactId && status === 'READY_FOR_CLIENT') {
      ensure(i.body.trim().length >= 10, 'Record why this internal service request is complete.');
      status = 'CLOSED';
    } else if (transitions[i.action]) {
      const t = transitions[i.action];
      ensure(t.from.includes(status), 'This status transition is not available.', 409);
      status = t.to;
    }
    if (i.action === 'acknowledge')
      ensure(
        trade && ['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'].includes(status),
        'Only assigned work can be acknowledged.',
      );
    if (i.assignedTradeId) {
      await projectTrade(tx, r.projectId, i.assignedTradeId);
      ensure(
        !r.assignedTradeId || r.assignedTradeId === i.assignedTradeId,
        'Create a replacement request to change trade after sharing evidence.',
      );
    }
    if (i.assignedUserId) {
      const u = await tx.user.findUnique({ where: { id: i.assignedUserId } });
      ensure(u?.active && !isExternal(u), 'Choose an active internal assignee.');
      await requireProjectAccess(u, r.projectId, tx);
    }
    if (i.action === 'assign')
      ensure(
        i.assignedTradeId || i.assignedUserId || r.assignedTradeId || r.assignedUserId,
        'Choose staff or a trade.',
      );
    if (i.action === 'schedule') ensure(i.appointmentAt, 'Set an appointment.');
    const row = await tx.warrantyRequest.update({
      where: { id: r.id },
      data: {
        status,
        version: { increment: 1 },
        ...(!external
          ? {
              assignedUserId: i.assignedUserId,
              assignedTradeId: i.assignedTradeId,
              dueAt: i.dueAt,
              appointmentAt: i.appointmentAt,
              tradeDescription: i.tradeDescription,
              internalNotes: i.internalNotes,
              clientNotes: i.clientNotes,
              priority: i.priority,
            }
          : {}),
        ...(i.action === 'reject' ? { decisionReason: i.body, clientNotes: i.body } : {}),
        ...(i.action === 'complete' ? { completedAt: new Date() } : {}),
        ...(i.action === 'verify' ? { clientVerifiedAt: new Date() } : {}),
        ...(i.action === 'reopen' ? { completedAt: null, clientVerifiedAt: null } : {}),
      },
    });
    await tx.warrantyUpdate.create({
      data: {
        requestId: r.id,
        actorId: actor.id,
        audience: client ? 'CLIENT' : trade ? 'TRADE' : i.audience,
        body: i.body || i.action,
        status,
      },
    });
    await event(tx, actor, row, `WARRANTY_${i.action.toUpperCase()}`);
    return { id: r.id, status };
  });
}
export async function internalWarranty(actor: Actor, projectId?: string) {
  await requireCapability(actor, 'WARRANTY_VIEW');
  return db.warrantyRequest.findMany({
    where: {
      project: { AND: [await projectScope(actor), ...(projectId ? [{ id: projectId }] : [])] },
    },
    include: {
      project: { select: { name: true, number: true } },
      updates: { orderBy: { createdAt: 'asc' } },
      files: { select: { ...fileFields, visibility: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
