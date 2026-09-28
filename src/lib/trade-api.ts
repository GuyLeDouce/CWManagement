import { z } from 'zod';
import { Capability } from '@prisma/client';
import { Actor, can } from './permissions';
import { transaction } from './db';
import { ensure, AppError } from './errors';
import { isTrade } from './external-identity';
import { identifier } from './financial-documents';
import { tradeProject, tradeProjects } from './trade-projections';
import {
  requireTradeProjectAccess,
  manageTradeAccess,
  projectTrade,
  shareTradeFiles,
} from './trade-access';
import {
  acknowledgementSchema,
  acknowledgeTrade,
  scheduleResponseSchema,
  respondTradeSchedule,
  instructionSchema,
  saveInstruction,
  instructionActionSchema,
  instructionAction,
  deficiencySchema,
  createDeficiency,
  deficiencyActionSchema,
  deficiencyAction,
  staffTrade,
  tradeEvent,
} from './trade-workflows';
import {
  tradeMessageSchema,
  tradeConversations,
  sendTradeMessage,
  readTradeConversation,
} from './trade-messages';
import { tradeNotice, deliverPortalNotices } from './trade-notices';
const pair = z.object({ projectId: identifier, id: identifier }).strict();
export async function dispatchTrade(
  actor: Actor,
  get: boolean,
  path: string,
  params: Record<string, string>,
  body: unknown,
) {
  ensure(isTrade(actor), 'Trade access required.', 403);
  if (get && path === 'projects') return { projects: await tradeProjects(actor) };
  if (get && path === 'project') return tradeProject(actor, identifier.parse(params.projectId));
  if (get && path === 'messages')
    return {
      conversations: await tradeConversations(actor, identifier.parse(params.projectId), true),
    };
  if (!get && path === 'acknowledge')
    return acknowledgeTrade(actor, acknowledgementSchema.parse(body));
  if (!get && path === 'schedule-response')
    return respondTradeSchedule(actor, scheduleResponseSchema.parse(body));
  if (!get && path === 'deficiency-action')
    return deficiencyAction(actor, deficiencyActionSchema.parse(body), true);
  if (!get && path === 'messages')
    return sendTradeMessage(actor, tradeMessageSchema.parse(body), true);
  if (!get && path === 'read') {
    const i = pair.parse(body);
    return readTradeConversation(actor, i.projectId, i.id, true);
  }
  if (!get && path === 'notification-read') {
    const i = pair.parse(body);
    return transaction(async (tx) => {
      await requireTradeProjectAccess(actor, i.projectId, tx);
      await tx.notification.updateMany({
        where: {
          id: i.id,
          projectId: i.projectId,
          userId: actor.id,
          actionUrl: { startsWith: '/trade' },
        },
        data: { readAt: new Date() },
      });
      return { ok: true };
    });
  }
  throw new AppError(404, 'This action is not available.');
}
export async function internalTrades(actor: Actor, projectId: string) {
  return transaction(async (tx) => {
    // Every section retains its own capability check; a messaging-only override cannot reveal purchasing.
    const caps = await Promise.all(
      [
        'TRADE_ACCESS_MANAGE',
        'TRADE_CONTENT_PUBLISH',
        'SITE_INSTRUCTION_VIEW',
        'DEFICIENCY_VIEW',
        'TRADE_MESSAGE_VIEW',
      ].map((c) => can(actor, c as Capability, tx)),
    );
    ensure(caps.some(Boolean), 'Trade management access required.', 403);
    await staffTrade(
      actor,
      projectId,
      (
        [
          'TRADE_ACCESS_MANAGE',
          'TRADE_CONTENT_PUBLISH',
          'SITE_INSTRUCTION_VIEW',
          'DEFICIENCY_VIEW',
          'TRADE_MESSAGE_VIEW',
        ] as const
      )[caps.findIndex(Boolean)],
      tx,
    );
    const contacts = await tx.contact.findMany({
      where: { projects: { some: { projectId } }, types: { hasSome: ['SUBTRADE', 'VENDOR'] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        types: true,
        company: { select: { name: true } },
        tradeAccess: {
          where: { projectId },
          select: { active: true, invitedAt: true, acceptedAt: true, revokedAt: true },
        },
      },
    });
    const instructions = caps[2]
      ? await tx.siteInstruction.findMany({
          where: { projectId },
          include: {
            recipients: true,
            acknowledgements: { select: { contactId: true, createdAt: true, typedName: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const deficiencies = caps[3]
      ? await tx.deficiency.findMany({
          where: { projectId },
          include: { updates: true, files: { select: { id: true, originalFilename: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const files = caps[1]
      ? await tx.storedFile.findMany({
          where: { projectId, archivedAt: null, visibility: 'TRADE' },
          select: {
            id: true,
            originalFilename: true,
            revisionLabel: true,
            origin: true,
            tradeUploaderContactId: true,
            tradeShares: { select: { contactId: true, lockedAt: true } },
          },
        })
      : [];
    const tasks = caps[1]
      ? await tx.projectTask.findMany({
          where: { projectId, archivedAt: null },
          select: {
            id: true,
            name: true,
            tradeTitle: true,
            tradeDescription: true,
            tradeReleases: true,
            tradeResponses: { orderBy: { createdAt: 'desc' } },
          },
        })
      : [];
    const work =
      (await can(actor, 'PURCHASE_ORDER_VIEW', tx)) || (await can(actor, 'WORK_ORDER_VIEW', tx))
        ? await tx.purchasingRevision.findMany({
            where: {
              document: {
                projectId,
                type: {
                  in: [
                    ...((await can(actor, 'PURCHASE_ORDER_VIEW', tx))
                      ? ['PURCHASE_ORDER' as const]
                      : []),
                    ...((await can(actor, 'WORK_ORDER_VIEW', tx)) ? ['WORK_ORDER' as const] : []),
                  ],
                },
              },
              issuedAt: { not: null },
            },
            select: {
              id: true,
              revision: true,
              vendorContactId: true,
              status: true,
              document: { select: { number: true, type: true } },
              acknowledgedAt: true,
            },
          })
        : [];
    return { contacts, instructions, deficiencies, files, tasks, work };
  });
}
export async function dispatchTradeManagement(
  actor: Actor,
  get: boolean,
  path: string,
  params: Record<string, string>,
  body: unknown,
) {
  if (get && path === 'project') return internalTrades(actor, identifier.parse(params.projectId));
  if (get && path === 'messages')
    return {
      conversations: await tradeConversations(actor, identifier.parse(params.projectId), false),
    };
  if (!get && path === 'access') {
    const i = z
      .object({
        projectId: identifier,
        contactId: identifier,
        action: z.enum(['invite', 'revoke']),
        role: z.enum(['SUBTRADE', 'VENDOR']),
      })
      .strict()
      .parse(body);
    return manageTradeAccess(actor, i.projectId, i.contactId, i.action, i.role);
  }
  if (!get && path === 'instruction') return saveInstruction(actor, instructionSchema.parse(body));
  if (!get && path === 'instruction-action')
    return instructionAction(actor, instructionActionSchema.parse(body));
  if (!get && path === 'deficiency') return createDeficiency(actor, deficiencySchema.parse(body));
  if (!get && path === 'deficiency-action')
    return deficiencyAction(actor, deficiencyActionSchema.parse(body), false);
  if (!get && path === 'messages')
    return sendTradeMessage(actor, tradeMessageSchema.parse(body), false);
  if (!get && path === 'read') {
    const i = pair.parse(body);
    return readTradeConversation(actor, i.projectId, i.id, false);
  }
  if (!get && path === 'share-file') {
    const i = z
      .object({
        projectId: identifier,
        id: identifier,
        contactId: identifier,
        shared: z.boolean(),
        revisionLabel: z.string().max(200).optional(),
      })
      .strict()
      .parse(body);
    const ids = await transaction(async (tx) => {
      await staffTrade(actor, i.projectId, 'TRADE_CONTENT_PUBLISH', tx);
      await projectTrade(tx, i.projectId, i.contactId);
      const file = await tx.storedFile.findFirst({
        where: { id: i.id, projectId: i.projectId, visibility: 'TRADE', archivedAt: null },
      });
      ensure(file, 'Trade file not found.', 404);
      const prior = await tx.tradeFileShare.findUnique({
        where: { fileId_contactId: { fileId: i.id, contactId: i.contactId } },
      });
      ensure(i.shared || !prior?.lockedAt, 'Issued evidence cannot be unshared.', 409);
      if (i.shared) await shareTradeFiles(tx, i.projectId, i.contactId, [i.id]);
      else await tx.tradeFileShare.deleteMany({ where: { fileId: i.id, contactId: i.contactId } });
      if (i.revisionLabel !== undefined && i.revisionLabel !== file.revisionLabel) {
        ensure(
          !(await tx.tradeFileShare.findFirst({
            where: { fileId: i.id, lockedAt: { not: null } },
          })),
          'Issued file metadata is immutable.',
          409,
        );
        await tx.storedFile.update({
          where: { id: i.id },
          data: { revisionLabel: i.revisionLabel },
        });
      }
      await tradeEvent(
        tx,
        actor,
        i.projectId,
        'StoredFile',
        i.id,
        'TRADE_FILE_SHARED',
        i.shared ? 'A document was shared with a trade.' : 'A trade document share was removed.',
      );
      return i.shared && !prior
        ? tradeNotice(tx, i.projectId, [i.contactId], 'A document has been shared with you.')
        : [];
    });
    await deliverPortalNotices(ids);
    return { ok: true };
  }
  if (!get && path === 'schedule-release') {
    const i = z
      .object({
        projectId: identifier,
        id: identifier,
        contactId: identifier,
        released: z.boolean(),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(10000),
      })
      .strict()
      .parse(body);
    const ids = await transaction(async (tx) => {
      await staffTrade(actor, i.projectId, 'TRADE_CONTENT_PUBLISH', tx);
      await projectTrade(tx, i.projectId, i.contactId);
      const task = await tx.projectTask.findFirst({
        where: { id: i.id, projectId: i.projectId, archivedAt: null },
      });
      ensure(task, 'Task not found.', 404);
      const old = await tx.tradeTaskRelease.findUnique({
        where: { taskId_contactId: { taskId: i.id, contactId: i.contactId } },
      });
      await tx.projectTask.update({
        where: { id: i.id },
        data: { tradeTitle: i.title, tradeDescription: i.description },
      });
      if (i.released)
        await tx.tradeTaskRelease.upsert({
          where: { taskId_contactId: { taskId: i.id, contactId: i.contactId } },
          create: { taskId: i.id, contactId: i.contactId },
          update: {},
        });
      else
        await tx.tradeTaskRelease.deleteMany({ where: { taskId: i.id, contactId: i.contactId } });
      await tradeEvent(
        tx,
        actor,
        i.projectId,
        'ProjectTask',
        i.id,
        'TRADE_SCHEDULE_RELEASED',
        'Trade schedule publication updated.',
      );
      return i.released &&
        (!old || task.tradeTitle !== i.title || task.tradeDescription !== i.description)
        ? tradeNotice(tx, i.projectId, [i.contactId], 'Your project schedule has been updated.')
        : [];
    });
    await deliverPortalNotices(ids);
    return { ok: true };
  }
  if (!get && path === 'resolve-schedule') {
    const i = z
      .object({
        projectId: identifier,
        id: identifier,
        resolution: z.string().trim().min(1).max(2000),
      })
      .strict()
      .parse(body);
    const ids = await transaction(async (tx) => {
      await staffTrade(actor, i.projectId, 'TRADE_CONTENT_PUBLISH', tx);
      const r = await tx.tradeScheduleResponse.findFirst({
        where: { id: i.id, task: { projectId: i.projectId } },
      });
      ensure(r, 'Response not found.', 404);
      if (r.resolvedAt) return [];
      await tx.tradeScheduleResponse.update({
        where: { id: r.id },
        data: { resolvedAt: new Date(), resolvedById: actor.id, resolution: i.resolution },
      });
      await tradeEvent(
        tx,
        actor,
        i.projectId,
        'TradeScheduleResponse',
        r.id,
        'SCHEDULE_RESPONSE_RESOLVED',
        'Trade schedule response resolved.',
      );
      return tradeNotice(
        tx,
        i.projectId,
        [r.contactId],
        'Cedar Winds responded to your schedule request.',
      );
    });
    await deliverPortalNotices(ids);
    return { ok: true };
  }
  throw new AppError(404, 'This action is not available.');
}
