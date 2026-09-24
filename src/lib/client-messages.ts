import { z } from 'zod';
import { db, transaction, Tx } from './db';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { requireClientProjectAccess } from './client-access';
import { identifier, optionalId, documentEvent } from './financial-documents';
import { ensure } from './errors';
import { clientNotice, deliverClientNotices } from './client-notices';

async function authorize(actor: Actor, projectId: string, write: boolean, tx: Tx = db) {
  if (actor.roles.includes('CLIENT')) return requireClientProjectAccess(actor, projectId, tx);
  await requireCapability(actor, write ? 'CLIENT_MESSAGE_SEND' : 'CLIENT_MESSAGE_VIEW', tx);
  await requireProjectAccess(actor, projectId, tx);
  return null;
}
export async function conversations(actor: Actor, projectId: string) {
  return transaction(async (tx) => {
    const grant = await authorize(actor, projectId, false, tx);
    const rows = await tx.conversation.findMany({
      where: {
        projectId,
        ...(grant
          ? {
              audience: 'CLIENT' as const,
              AND: [
                { OR: [{ selectionId: null }, { selection: { publishedAt: { not: null } } }] },
                {
                  OR: [
                    { changeOrderRevisionId: null },
                    { changeOrderRevision: { clientId: grant.contactId, issuedAt: { not: null } } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        subject: true,
        audience: true,
        selectionId: true,
        changeOrderRevisionId: true,
        createdAt: true,
        reads: { where: { userId: actor.id }, select: { readAt: true } },
        messages: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 500,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      ...row,
      unread: row.messages.some((m) => !row.reads[0] || m.createdAt > row.reads[0].readAt),
    }));
  });
}
export const messageSchema = z
  .object({
    projectId: identifier,
    conversationId: optionalId,
    subject: z.string().trim().min(1).max(200),
    audience: z.enum(['CLIENT', 'INTERNAL']).default('CLIENT'),
    selectionId: optionalId,
    changeOrderRevisionId: optionalId,
    body: z.string().trim().min(1).max(10000),
  })
  .strict();
export async function sendProjectMessage(actor: Actor, input: z.infer<typeof messageSchema>) {
  const result = await transaction(async (tx) => {
    const grant = await authorize(actor, input.projectId, true, tx);
    let thread = input.conversationId
      ? await tx.conversation.findFirst({
          where: { id: input.conversationId, projectId: input.projectId },
        })
      : null;
    if (input.conversationId)
      ensure(thread && (!grant || thread.audience === 'CLIENT'), 'Conversation not found.', 404);
    const selectionId = thread?.selectionId || input.selectionId;
    const revisionId = thread?.changeOrderRevisionId || input.changeOrderRevisionId;
    if (selectionId)
      ensure(
        await tx.selection.findFirst({
          where: {
            id: selectionId,
            projectId: input.projectId,
            ...(grant ? { publishedAt: { not: null } } : {}),
          },
        }),
        'Selection not found.',
        404,
      );
    if (revisionId)
      ensure(
        await tx.changeOrderRevision.findFirst({
          where: {
            id: revisionId,
            changeOrder: { projectId: input.projectId },
            ...(grant ? { clientId: grant.contactId, issuedAt: { not: null } } : {}),
          },
        }),
        'Change order not found.',
        404,
      );
    if (!thread)
      thread = await tx.conversation.create({
        data: {
          projectId: input.projectId,
          subject: input.subject,
          audience: grant ? 'CLIENT' : input.audience,
          selectionId,
          changeOrderRevisionId: revisionId,
        },
      });
    const message = await tx.projectMessage.create({
      data: { conversationId: thread.id, authorId: actor.id, body: input.body },
    });
    await tx.conversationRead.upsert({
      where: { conversationId_userId: { conversationId: thread.id, userId: actor.id } },
      create: { conversationId: thread.id, userId: actor.id },
      update: { readAt: new Date() },
    });
    await documentEvent(tx, actor, {
      projectId: input.projectId,
      entity: 'ProjectMessage',
      entityId: message.id,
      action: 'PROJECT_MESSAGE_SENT',
      description: grant ? 'Client sent a project message.' : 'Project message sent.',
      tab: 'messages',
      notifyCapability: 'CLIENT_MESSAGE_VIEW',
    });
    const ids =
      !grant && thread.audience === 'CLIENT'
        ? await clientNotice(tx, input.projectId, 'A new message from Cedar Winds')
        : [];
    return { ids, id: thread.id };
  });
  await deliverClientNotices(result.ids);
  return { id: result.id };
}
export async function readConversation(actor: Actor, projectId: string, id: string) {
  return transaction(async (tx) => {
    const grant = await authorize(actor, projectId, false, tx);
    const thread = await tx.conversation.findFirst({
      where: { id, projectId, ...(grant ? { audience: 'CLIENT' as const } : {}) },
    });
    ensure(thread, 'Conversation not found.', 404);
    if (grant && thread.changeOrderRevisionId)
      ensure(
        await tx.changeOrderRevision.findFirst({
          where: {
            id: thread.changeOrderRevisionId,
            clientId: grant.contactId,
            issuedAt: { not: null },
          },
        }),
        'Conversation not found.',
        404,
      );
    await tx.conversationRead.upsert({
      where: { conversationId_userId: { conversationId: id, userId: actor.id } },
      create: { conversationId: id, userId: actor.id },
      update: { readAt: new Date() },
    });
    return { ok: true };
  });
}
