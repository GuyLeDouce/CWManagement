import { z } from 'zod';
import { transaction, Tx } from './db';
import { Actor } from './permissions';
import { identifier, optionalId } from './financial-documents';
import {
  requireTradeProjectAccess,
  projectTrade,
  shareTradeFiles,
  tradeFileScope,
} from './trade-access';
import { staffTrade, tradeEvent } from './trade-workflows';
import { ensure } from './errors';
import { ownPurchasing } from './trade-projections';
import { tradeNotice, deliverPortalNotices } from './trade-notices';
export async function tradeContext(
  tx: Tx,
  projectId: string,
  contactId: string,
  context: {
    purchasingRevisionId?: string | null;
    siteInstructionId?: string | null;
    deficiencyId?: string | null;
  },
) {
  if (context.purchasingRevisionId)
    await ownPurchasing(tx, projectId, contactId, context.purchasingRevisionId);
  if (context.siteInstructionId)
    ensure(
      await tx.siteInstruction.findFirst({
        where: {
          id: context.siteInstructionId,
          projectId,
          issuedAt: { not: null },
          recipients: { some: { contactId } },
        },
      }),
      'Instruction not found.',
      404,
    );
  if (context.deficiencyId)
    ensure(
      await tx.deficiency.findFirst({
        where: { id: context.deficiencyId, projectId, assignedContactId: contactId },
      }),
      'Deficiency not found.',
      404,
    );
}
export async function tradeConversations(actor: Actor, projectId: string, external: boolean) {
  return transaction(async (tx) => {
    const grant = external ? await requireTradeProjectAccess(actor, projectId, tx) : null;
    if (!external) await staffTrade(actor, projectId, 'TRADE_MESSAGE_VIEW', tx);
    const rows = await tx.conversation.findMany({
      where: {
        projectId,
        audience: 'TRADE',
        ...(grant ? { tradeContactId: grant.contactId } : {}),
      },
      select: {
        id: true,
        subject: true,
        tradeContactId: !external,
        purchasingRevisionId: true,
        siteInstructionId: true,
        deficiencyId: true,
        reads: { where: { userId: actor.id }, select: { readAt: true } },
        messages: {
          select: {
            id: true,
            body: true,
            attachmentIds: true,
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
    const files = grant
      ? await tx.storedFile.findMany({
          where: { projectId, ...tradeFileScope(grant.contactId) },
          select: { id: true },
        })
      : null;
    return rows.map((r) => ({
      ...r,
      messages: r.messages.map((m) => ({
        ...m,
        attachmentIds: files
          ? m.attachmentIds.filter((id) => files.some((f) => f.id === id))
          : m.attachmentIds,
      })),
      unread: r.messages.some((m) => !r.reads[0] || m.createdAt > r.reads[0].readAt),
    }));
  });
}
export const tradeMessageSchema = z
  .object({
    projectId: identifier,
    conversationId: optionalId,
    contactId: optionalId,
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
    purchasingRevisionId: optionalId,
    siteInstructionId: optionalId,
    deficiencyId: optionalId,
    attachmentIds: z.array(identifier).max(10).default([]),
  })
  .strict();
export async function sendTradeMessage(
  actor: Actor,
  i: z.infer<typeof tradeMessageSchema>,
  external: boolean,
) {
  const result = await transaction(async (tx) => {
    const g = external ? await requireTradeProjectAccess(actor, i.projectId, tx) : null;
    if (!external) await staffTrade(actor, i.projectId, 'TRADE_MESSAGE_SEND', tx);
    const thread = i.conversationId
      ? await tx.conversation.findFirst({
          where: {
            id: i.conversationId,
            projectId: i.projectId,
            audience: 'TRADE',
            ...(g ? { tradeContactId: g.contactId } : {}),
          },
        })
      : null;
    if (i.conversationId) ensure(thread, 'Conversation not found.', 404);
    const contactId = g?.contactId || thread?.tradeContactId || i.contactId;
    ensure(contactId, 'Choose a trade contact.');
    if (!g) await projectTrade(tx, i.projectId, contactId);
    await tradeContext(tx, i.projectId, contactId, thread || i);
    if (external)
      ensure(
        (await tx.storedFile.count({
          where: {
            id: { in: i.attachmentIds },
            projectId: i.projectId,
            ...tradeFileScope(contactId),
          },
        })) === i.attachmentIds.length,
        'Attachment not found.',
        404,
      );
    await shareTradeFiles(tx, i.projectId, contactId, i.attachmentIds, true);
    const row =
      thread ||
      (await tx.conversation.create({
        data: {
          projectId: i.projectId,
          audience: 'TRADE',
          tradeContactId: contactId,
          subject: i.subject,
          purchasingRevisionId: i.purchasingRevisionId,
          siteInstructionId: i.siteInstructionId,
          deficiencyId: i.deficiencyId,
        },
      }));
    const message = await tx.projectMessage.create({
      data: {
        conversationId: row.id,
        authorId: actor.id,
        body: i.body,
        attachmentIds: i.attachmentIds,
      },
    });
    await tx.conversationRead.upsert({
      where: { conversationId_userId: { conversationId: row.id, userId: actor.id } },
      create: { conversationId: row.id, userId: actor.id },
      update: { readAt: new Date() },
    });
    await tradeEvent(
      tx,
      actor,
      i.projectId,
      'ProjectMessage',
      message.id,
      'TRADE_MESSAGE_SENT',
      external ? 'Trade sent a project message.' : 'Cedar Winds sent a trade message.',
    );
    return {
      id: row.id,
      notices: external
        ? []
        : await tradeNotice(tx, i.projectId, [contactId], 'A new message from Cedar Winds.'),
    };
  });
  await deliverPortalNotices(result.notices);
  return { id: result.id };
}
export async function readTradeConversation(
  actor: Actor,
  projectId: string,
  id: string,
  external: boolean,
) {
  return transaction(async (tx) => {
    const g = external ? await requireTradeProjectAccess(actor, projectId, tx) : null;
    if (!external) await staffTrade(actor, projectId, 'TRADE_MESSAGE_VIEW', tx);
    ensure(
      await tx.conversation.findFirst({
        where: { id, projectId, audience: 'TRADE', ...(g ? { tradeContactId: g.contactId } : {}) },
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
