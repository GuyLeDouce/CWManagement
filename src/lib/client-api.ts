import { z } from 'zod';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { db, transaction } from './db';
import { ensure, AppError } from './errors';
import { clientProject, clientProjects, projectProjection } from './client-projections';
import { requireClientProjectAccess, manageClientAccess } from './client-access';
import {
  decideSelection,
  decisionSchema,
  allowanceSchema,
  saveAllowance,
  selectionSchema,
  saveSelection,
  internalSelections,
  selectionAction,
} from './selections';
import { approveClientChangeOrder, clientApprovalSchema } from './client-approvals';
import {
  conversations,
  sendProjectMessage,
  messageSchema,
  readConversation,
} from './client-messages';
import { identifier, note, day, documentEvent } from './financial-documents';
import { clientNotice, deliverClientNotices } from './client-notices';

export async function dispatchClient(
  actor: Actor,
  get: boolean,
  path: string,
  params: Record<string, string>,
  body: unknown,
) {
  ensure(actor.roles.length === 1 && actor.roles[0] === 'CLIENT', 'Client access required.', 403);
  if (get && path === 'projects') return { projects: await clientProjects(actor) };
  if (get && path === 'project') return clientProject(actor, identifier.parse(params.projectId));
  if (get && path === 'messages')
    return { conversations: await conversations(actor, identifier.parse(params.projectId)) };
  if (get && path === 'notifications') {
    const projectId = identifier.parse(params.projectId);
    await requireClientProjectAccess(actor, projectId);
    return {
      notifications: await db.notification.findMany({
        where: { userId: actor.id, projectId, actionUrl: { startsWith: '/client' } },
        select: { id: true, title: true, message: true, readAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    };
  }
  if (!get && path === 'selection-decision')
    return decideSelection(actor, decisionSchema.parse(body));
  if (!get && path === 'notification-read') {
    const i = z.object({ projectId: identifier, id: identifier }).strict().parse(body);
    return transaction(async (tx) => {
      await requireClientProjectAccess(actor, i.projectId, tx);
      await tx.notification.updateMany({
        where: {
          id: i.id,
          userId: actor.id,
          projectId: i.projectId,
          actionUrl: { startsWith: '/client' },
        },
        data: { readAt: new Date() },
      });
      return { ok: true };
    });
  }
  if (!get && path === 'change-order-approval')
    return approveClientChangeOrder(actor, clientApprovalSchema.parse(body));
  if (!get && path === 'messages') return sendProjectMessage(actor, messageSchema.parse(body));
  if (!get && path === 'read') {
    const i = z.object({ projectId: identifier, id: identifier }).strict().parse(body);
    return readConversation(actor, i.projectId, i.id);
  }
  if (!get && path === 'accept-access') {
    const i = z.object({ projectId: identifier }).strict().parse(body);
    return transaction(async (tx) => {
      const g = await requireClientProjectAccess(actor, i.projectId, tx);
      if (!g.acceptedAt)
        await tx.clientProjectAccess.update({
          where: { id: g.id },
          data: { acceptedAt: new Date() },
        });
      return { ok: true };
    });
  }
  throw new AppError(404, 'This action is not available.');
}
export const publicationSchema = z
  .object({
    projectId: identifier,
    id: identifier,
    kind: z.enum(['schedule', 'update', 'file', 'project']),
    visible: z.boolean(),
    title: note,
    description: note,
    targetCompletion: day,
  })
  .strict();
export async function publishClientContent(actor: Actor, input: z.infer<typeof publicationSchema>) {
  const notices = await transaction(async (tx) => {
    await requireCapability(actor, 'CLIENT_CONTENT_PUBLISH', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    let changed = false;
    if (input.kind === 'schedule') {
      const row = await tx.projectTask.findFirst({
        where: { id: input.id, projectId: input.projectId, archivedAt: null },
      });
      ensure(row, 'Task not found.', 404);
      ensure(!input.visible || input.title, 'A client-safe title is required.');
      changed = !row.clientVisible && input.visible;
      await tx.projectTask.update({
        where: { id: row.id },
        data: {
          clientVisible: input.visible,
          clientTitle: input.title,
          clientDescription: input.description,
        },
      });
    } else if (input.kind === 'update') {
      const row = await tx.dailyLog.findFirst({
        where: { id: input.id, projectId: input.projectId },
      });
      ensure(row, 'Update not found.', 404);
      ensure(
        !input.visible || input.description,
        'A dedicated client-safe progress summary is required.',
      );
      changed = !row.clientVisible && input.visible;
      await tx.dailyLog.update({
        where: { id: row.id },
        data: { clientVisible: input.visible, clientSummary: input.description },
      });
    } else if (input.kind === 'file') {
      const row = await tx.storedFile.findFirst({
        where: { id: input.id, projectId: input.projectId, archivedAt: null },
      });
      ensure(row, 'File not found.', 404);
      changed = row.visibility !== 'CLIENT' && input.visible;
      if (!input.visible) {
        const used = await tx.selectionOption.findFirst({
          where: {
            attachmentIds: { has: row.id },
            selection: { OR: [{ publishedAt: { not: null } }, { decisions: { some: {} } }] },
          },
        });
        ensure(!used, 'Files referenced by recorded decisions must remain available.', 409);
        ensure(
          !(await tx.changeOrderRevision.findFirst({
            where: { attachmentIds: { has: row.id }, status: 'ACCEPTED' },
          })),
          'Accepted document attachments must remain available.',
          409,
        );
      }
      await tx.storedFile.update({
        where: { id: row.id },
        data: { visibility: input.visible ? 'CLIENT' : 'INTERNAL' },
      });
    } else
      await tx.project.update({
        where: { id: input.projectId },
        data: {
          clientVisibleNotes: input.description,
          clientTargetCompletion: input.visible ? input.targetCompletion : null,
        },
      });
    await documentEvent(tx, actor, {
      projectId: input.projectId,
      entity: input.kind,
      entityId: input.id,
      action: 'CLIENT_CONTENT_PUBLICATION',
      description: 'Client content publication updated.',
      tab: 'clients',
    });
    return changed
      ? await clientNotice(
          tx,
          input.projectId,
          input.kind === 'update'
            ? 'A new project update is available'
            : 'New project content is available',
        )
      : [];
  });
  await deliverClientNotices(notices);
  return { ok: true };
}
export async function dispatchClientManagement(
  actor: Actor,
  get: boolean,
  path: string,
  params: Record<string, string>,
  body: unknown,
) {
  if (get) {
    const projectId = identifier.parse(params.projectId);
    if (path === 'selections') return internalSelections(actor, projectId);
    if (path === 'allowance-sources') {
      await requireCapability(actor, 'SELECTION_VIEW');
      await requireProjectAccess(actor, projectId);
      const proposals = await db.proposalRevision.findMany({
        where: { proposal: { projectId }, status: 'ACCEPTED' },
        select: { estimateRevisionId: true },
      });
      return {
        estimateLines: await db.estimateLine.findMany({
          where: {
            revisionId: { in: proposals.map((p) => p.estimateRevisionId) },
            allowance: true,
            included: true,
            allowanceRecord: null,
          },
          select: { id: true, description: true, costCodeId: true, costType: true },
        }),
        budgetLines: await db.budgetLine.findMany({
          where: { budgetVersion: { type: 'ORIGINAL', budget: { projectId, active: true } } },
          select: { id: true, description: true, costCodeId: true, costType: true },
        }),
      };
    }
    if (path === 'messages') return { conversations: await conversations(actor, projectId) };
    if (path === 'preview') {
      await requireCapability(actor, 'CLIENT_CONTENT_PUBLISH');
      await requireProjectAccess(actor, projectId);
      return projectProjection(db, projectId);
    }
    if (path === 'access') {
      await requireCapability(actor, 'CLIENT_ACCESS_MANAGE');
      await requireProjectAccess(actor, projectId);
      return {
        contacts: await db.projectContact.findMany({
          where: { projectId, role: 'CLIENT' },
          select: {
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                portalAccess: {
                  where: { projectId },
                  select: { active: true, invitedAt: true, acceptedAt: true, revokedAt: true },
                },
              },
            },
          },
        }),
      };
    }
  } else {
    if (path === 'allowances') return saveAllowance(actor, allowanceSchema.parse(body));
    if (path === 'selections') return saveSelection(actor, selectionSchema.parse(body));
    if (path === 'selection-action') {
      const i = z
        .object({
          id: identifier,
          version: z.number().int().positive(),
          action: z.enum(['publish', 'unpublish', 'close']),
        })
        .strict()
        .parse(body);
      return selectionAction(actor, i.id, i.version, i.action);
    }
    if (path === 'access') {
      const i = z
        .object({
          projectId: identifier,
          contactId: identifier,
          action: z.enum(['invite', 'revoke']),
        })
        .strict()
        .parse(body);
      return manageClientAccess(actor, i.projectId, i.contactId, i.action);
    }
    if (path === 'publish') return publishClientContent(actor, publicationSchema.parse(body));
    if (path === 'messages') return sendProjectMessage(actor, messageSchema.parse(body));
    if (path === 'read') {
      const i = z.object({ projectId: identifier, id: identifier }).strict().parse(body);
      return readConversation(actor, i.projectId, i.id);
    }
  }
  throw new AppError(404, 'This action is not available.');
}
