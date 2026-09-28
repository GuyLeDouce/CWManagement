import { z } from 'zod';
import { Capability } from '@prisma/client';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { transaction, Tx, json } from './db';
import { ensure } from './errors';
import {
  identifier,
  note,
  optionalId,
  day,
  documentEvent,
  checkVersion,
} from './financial-documents';
import {
  requireTradeProjectAccess,
  projectTrade,
  shareTradeFiles,
  tradeTaskScope,
  tradeFileScope,
} from './trade-access';
import {
  ownPurchasing,
  purchasingProjection,
  instructionSnapshot,
  evidenceHash,
} from './trade-projections';
import { tradeNotice, deliverPortalNotices } from './trade-notices';

export async function staffTrade(actor: Actor, projectId: string, cap: Capability, tx: Tx) {
  await requireCapability(actor, cap, tx);
  await requireProjectAccess(actor, projectId, tx);
}
export async function tradeEvent(
  tx: Tx,
  actor: Actor,
  projectId: string,
  entity: string,
  id: string,
  action: string,
  description: string,
) {
  await documentEvent(tx, actor, {
    projectId,
    entity,
    entityId: id,
    action,
    description,
    tab: 'trades',
    notifyCapability: 'TRADE_MESSAGE_VIEW',
  });
}
export const acknowledgementSchema = z
  .object({
    projectId: identifier,
    id: identifier,
    kind: z.enum(['work', 'instruction']),
    typedName: z.string().trim().min(2).max(200),
  })
  .strict();
export async function acknowledgeTrade(actor: Actor, i: z.infer<typeof acknowledgementSchema>) {
  return transaction(async (tx) => {
    const g = await requireTradeProjectAccess(actor, i.projectId, tx);
    let snapshot: unknown;
    if (i.kind === 'work') {
      const r = await ownPurchasing(tx, i.projectId, g.contactId, i.id, true);
      const existing = await tx.tradeAcknowledgement.findUnique({
        where: {
          purchasingRevisionId_contactId: { purchasingRevisionId: r.id, contactId: g.contactId },
        },
      });
      if (existing) return { ok: true };
      const files = await tx.storedFile.findMany({
        where: {
          id: { in: r.attachmentIds },
          projectId: i.projectId,
          ...tradeFileScope(g.contactId),
        },
        select: { id: true, originalFilename: true, revisionLabel: true },
      });
      await shareTradeFiles(
        tx,
        i.projectId,
        g.contactId,
        files.map((f) => f.id),
        true,
      );
      snapshot = {
        ...purchasingProjection(r.snapshot),
        attachments: files.map((f) => ({
          id: f.id,
          name: f.originalFilename,
          revision: f.revisionLabel,
        })),
      };
      await tx.tradeAcknowledgement.create({
        data: {
          projectId: i.projectId,
          purchasingRevisionId: r.id,
          userId: actor.id,
          contactId: g.contactId,
          typedName: i.typedName,
          snapshot: json(snapshot),
          snapshotHash: evidenceHash(snapshot),
        },
      });
      await tx.purchasingRevision.update({
        where: { id: r.id },
        data: { acknowledgedAt: new Date() },
      });
    } else {
      const r = await tx.siteInstruction.findFirst({
        where: {
          id: i.id,
          projectId: i.projectId,
          recipients: { some: { contactId: g.contactId } },
          status: { in: ['ISSUED', 'ACKNOWLEDGED', 'CLOSED'] },
        },
      });
      ensure(r, 'Instruction not found.', 404);
      const existing = await tx.tradeAcknowledgement.findUnique({
        where: { instructionId_contactId: { instructionId: r.id, contactId: g.contactId } },
      });
      if (existing) return { ok: true };
      ensure(r.status !== 'CLOSED', 'Instruction is closed.', 409);
      snapshot = instructionSnapshot.parse(r.snapshot);
      await tx.tradeAcknowledgement.create({
        data: {
          projectId: i.projectId,
          instructionId: r.id,
          userId: actor.id,
          contactId: g.contactId,
          typedName: i.typedName,
          snapshot: json(snapshot),
          snapshotHash: evidenceHash(snapshot),
        },
      });
      const remaining = await tx.siteInstructionRecipient.count({
        where: {
          instructionId: r.id,
          contact: { tradeAcknowledgements: { none: { instructionId: r.id } } },
        },
      });
      if (!remaining)
        await tx.siteInstruction.update({
          where: { id: r.id },
          data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), version: { increment: 1 } },
        });
    }
    await tradeEvent(
      tx,
      actor,
      i.projectId,
      'TradeAcknowledgement',
      i.id,
      'TRADE_ACKNOWLEDGED',
      `${actor.firstName} ${actor.lastName} acknowledged ${i.kind === 'work' ? 'an issued purchasing revision' : 'a site instruction'}.`,
    );
    return { ok: true };
  });
}
export const scheduleResponseSchema = z
  .object({
    projectId: identifier,
    taskId: identifier,
    requestId: z.uuid(),
    response: z.enum(['CONFIRMED', 'CONFLICT', 'QUESTION']),
    comment: note,
  })
  .strict();
export async function respondTradeSchedule(
  actor: Actor,
  i: z.infer<typeof scheduleResponseSchema>,
) {
  return transaction(async (tx) => {
    const g = await requireTradeProjectAccess(actor, i.projectId, tx);
    const task = await tx.projectTask.findFirst({
      where: { id: i.taskId, projectId: i.projectId, ...tradeTaskScope(g.contactId) },
    });
    ensure(task, 'Schedule item not found.', 404);
    const old = await tx.tradeScheduleResponse.findUnique({ where: { requestId: i.requestId } });
    if (old) {
      ensure(old.userId === actor.id && old.taskId === i.taskId, 'Request conflict.', 409);
      return { ok: true };
    }
    ensure(i.response === 'CONFIRMED' || i.comment, 'Describe your question or conflict.');
    await tx.tradeScheduleResponse.create({
      data: {
        taskId: task.id,
        userId: actor.id,
        contactId: g.contactId,
        requestId: i.requestId,
        response: i.response,
        comment: i.comment,
        snapshot: json({
          title: task.tradeTitle || task.name,
          startDate: task.startDate,
          endDate: task.endDate,
        }),
      },
    });
    await tradeEvent(
      tx,
      actor,
      i.projectId,
      'ProjectTask',
      task.id,
      'TRADE_SCHEDULE_RESPONSE',
      `Trade submitted a schedule ${i.response.toLowerCase()}.`,
    );
    return { ok: true };
  });
}
async function nextNumber(tx: Tx, instruction: boolean) {
  await tx.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
  const s = await tx.settings.update({
    where: { id: 'company' },
    data: instruction
      ? { nextSiteInstructionNumber: { increment: 1 } }
      : { nextDeficiencyNumber: { increment: 1 } },
  });
  return (
    (instruction ? s.siteInstructionPrefix : s.deficiencyPrefix) +
    String((instruction ? s.nextSiteInstructionNumber : s.nextDeficiencyNumber) - 1).padStart(
      4,
      '0',
    )
  );
}
export const instructionSchema = z
  .object({
    projectId: identifier,
    id: optionalId,
    expectedVersion: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
    internalNotes: note,
    contactIds: z.array(identifier).min(1).max(50),
    attachmentIds: z.array(identifier).max(30).default([]),
    purchasingRevisionId: optionalId,
    taskId: optionalId,
    replacesId: optionalId,
    acknowledgementRequired: z.boolean().default(true),
  })
  .strict();
export async function saveInstruction(actor: Actor, i: z.infer<typeof instructionSchema>) {
  return transaction(async (tx) => {
    await staffTrade(actor, i.projectId, 'SITE_INSTRUCTION_CREATE', tx);
    ensure(new Set(i.contactIds).size === i.contactIds.length, 'Duplicate recipients.');
    ensure(
      (await tx.storedFile.count({
        where: {
          id: { in: i.attachmentIds },
          projectId: i.projectId,
          visibility: 'TRADE',
          archivedAt: null,
        },
      })) === i.attachmentIds.length,
      'Choose trade-classified project attachments.',
    );
    for (const contactId of i.contactIds) {
      await projectTrade(tx, i.projectId, contactId);
      if (i.purchasingRevisionId)
        await ownPurchasing(tx, i.projectId, contactId, i.purchasingRevisionId, true);
    }
    if (i.taskId)
      ensure(
        await tx.projectTask.findFirst({
          where: { id: i.taskId, projectId: i.projectId, archivedAt: null },
        }),
        'Schedule item not found.',
      );
    if (i.replacesId)
      ensure(
        await tx.siteInstruction.findFirst({
          where: { id: i.replacesId, projectId: i.projectId, issuedAt: { not: null } },
        }),
        'Replacement source not found.',
      );
    const old = i.id
      ? await tx.siteInstruction.findFirst({ where: { id: i.id, projectId: i.projectId } })
      : null;
    if (i.id) {
      ensure(old && old.status === 'DRAFT', 'Only draft instructions can be edited.', 409);
      checkVersion(old, i.expectedVersion ?? 0);
    }
    const data = {
      title: i.title,
      description: i.description,
      internalNotes: i.internalNotes,
      attachmentIds: i.attachmentIds,
      purchasingRevisionId: i.purchasingRevisionId,
      taskId: i.taskId,
      replacesId: i.replacesId,
      acknowledgementRequired: i.acknowledgementRequired,
    };
    const r = old
      ? await tx.siteInstruction.update({
          where: { id: old.id },
          data: {
            ...data,
            version: { increment: 1 },
            recipients: {
              deleteMany: {},
              create: i.contactIds.map((contactId) => ({ contactId })),
            },
          },
        })
      : await tx.siteInstruction.create({
          data: {
            ...data,
            projectId: i.projectId,
            number: await nextNumber(tx, true),
            createdById: actor.id,
            recipients: { create: i.contactIds.map((contactId) => ({ contactId })) },
          },
        });
    await tradeEvent(
      tx,
      actor,
      i.projectId,
      'SiteInstruction',
      r.id,
      'INSTRUCTION_SAVED',
      `Site instruction ${r.number} draft saved.`,
    );
    return { id: r.id };
  });
}
export const instructionActionSchema = z
  .object({
    projectId: identifier,
    id: identifier,
    expectedVersion: z.number().int().positive(),
    action: z.enum(['issue', 'close', 'cancel']),
  })
  .strict();
export async function instructionAction(actor: Actor, i: z.infer<typeof instructionActionSchema>) {
  const notices = await transaction(async (tx) => {
    await staffTrade(actor, i.projectId, 'SITE_INSTRUCTION_ISSUE', tx);
    const r = await tx.siteInstruction.findFirst({
      where: { id: i.id, projectId: i.projectId },
      include: { recipients: true },
    });
    ensure(r, 'Instruction not found.', 404);
    checkVersion(r, i.expectedVersion);
    let ids: string[] = [];
    if (i.action === 'issue') {
      ensure(r.status === 'DRAFT', 'Only drafts can be issued.', 409);
      ensure(r.recipients.length, 'Recipients required.');
      for (const recipient of r.recipients) {
        await projectTrade(tx, i.projectId, recipient.contactId);
        if (r.purchasingRevisionId)
          await ownPurchasing(tx, i.projectId, recipient.contactId, r.purchasingRevisionId, true);
        await shareTradeFiles(tx, i.projectId, recipient.contactId, r.attachmentIds, true);
      }
      const files = await tx.storedFile.findMany({
        where: { id: { in: r.attachmentIds } },
        select: { id: true, originalFilename: true, revisionLabel: true },
      });
      const now = new Date();
      await tx.siteInstruction.update({
        where: { id: r.id },
        data: {
          status: 'ISSUED',
          issuedAt: now,
          issuedById: actor.id,
          version: { increment: 1 },
          snapshot: json({
            number: r.number,
            title: r.title,
            description: r.description,
            issuedAt: now.toISOString(),
            acknowledgementRequired: r.acknowledgementRequired,
            attachments: files.map((f) => ({
              id: f.id,
              name: f.originalFilename,
              revision: f.revisionLabel,
            })),
          }),
        },
      });
      ids = await tradeNotice(
        tx,
        i.projectId,
        r.recipients.map((x) => x.contactId),
        'A site instruction has been issued.',
      );
    } else {
      ensure(
        ['DRAFT', 'ISSUED', 'ACKNOWLEDGED'].includes(r.status),
        'Instruction transition not allowed.',
        409,
      );
      ensure(i.action === 'cancel' || r.status !== 'DRAFT', 'Issue before closing.');
      await tx.siteInstruction.update({
        where: { id: r.id },
        data: { status: i.action === 'close' ? 'CLOSED' : 'CANCELLED', version: { increment: 1 } },
      });
    }
    await tradeEvent(
      tx,
      actor,
      i.projectId,
      'SiteInstruction',
      r.id,
      'INSTRUCTION_' + i.action.toUpperCase(),
      `Site instruction ${r.number} ${i.action === 'issue' ? 'issued' : i.action === 'close' ? 'closed' : 'cancelled'}.`,
    );
    return ids;
  });
  await deliverPortalNotices(notices);
  return { ok: true };
}
export const deficiencySchema = z
  .object({
    projectId: identifier,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
    location: note,
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    internalNotes: note,
    assignedContactId: optionalId,
    dueDate: day,
    taskId: optionalId,
    attachmentIds: z.array(identifier).max(30).default([]),
  })
  .strict();
export async function createDeficiency(actor: Actor, i: z.infer<typeof deficiencySchema>) {
  const result = await transaction(async (tx) => {
    await staffTrade(actor, i.projectId, 'DEFICIENCY_CREATE', tx);
    ensure(
      (await tx.storedFile.count({
        where: {
          id: { in: i.attachmentIds },
          projectId: i.projectId,
          visibility: 'TRADE',
          archivedAt: null,
        },
      })) === i.attachmentIds.length,
      'Choose trade-classified project attachments.',
    );
    if (i.assignedContactId) {
      await requireCapability(actor, 'DEFICIENCY_ASSIGN', tx);
      await projectTrade(tx, i.projectId, i.assignedContactId);
      await shareTradeFiles(tx, i.projectId, i.assignedContactId, i.attachmentIds, true);
    }
    if (i.taskId)
      ensure(
        await tx.projectTask.findFirst({ where: { id: i.taskId, projectId: i.projectId } }),
        'Schedule item not found.',
      );
    const r = await tx.deficiency.create({
      data: {
        ...i,
        status: i.assignedContactId ? 'ASSIGNED' : 'OPEN',
        number: await nextNumber(tx, false),
        createdById: actor.id,
      },
    });
    await tradeEvent(
      tx,
      actor,
      i.projectId,
      'Deficiency',
      r.id,
      'DEFICIENCY_CREATED',
      `Deficiency ${r.number} created${i.assignedContactId ? ' and assigned' : ''}.`,
    );
    return {
      id: r.id,
      notices: i.assignedContactId
        ? await tradeNotice(
            tx,
            i.projectId,
            [i.assignedContactId],
            'A deficiency has been assigned to you.',
          )
        : [],
    };
  });
  await deliverPortalNotices(result.notices);
  return { id: result.id };
}
export const deficiencyActionSchema = z
  .object({
    projectId: identifier,
    id: identifier,
    expectedVersion: z.number().int().positive(),
    action: z.enum(['start', 'ready', 'close', 'reopen', 'cancel', 'assign']),
    contactId: optionalId,
    comment: z.string().trim().min(1).max(5000),
  })
  .strict();
export async function deficiencyAction(
  actor: Actor,
  i: z.infer<typeof deficiencyActionSchema>,
  external: boolean,
) {
  const notices = await transaction(async (tx) => {
    const grant = external ? await requireTradeProjectAccess(actor, i.projectId, tx) : null;
    if (!external)
      await staffTrade(
        actor,
        i.projectId,
        i.action === 'assign' ? 'DEFICIENCY_ASSIGN' : 'DEFICIENCY_VERIFY',
        tx,
      );
    const r = await tx.deficiency.findFirst({
      where: {
        id: i.id,
        projectId: i.projectId,
        ...(grant ? { assignedContactId: grant.contactId } : {}),
      },
    });
    ensure(r, 'Deficiency not found.', 404);
    checkVersion(r, i.expectedVersion);
    ensure(
      !external || ['start', 'ready'].includes(i.action),
      'Cedar Winds must verify and close deficiencies.',
      403,
    );
    const contactId = i.action === 'assign' ? i.contactId : r.assignedContactId;
    if (i.action === 'assign') {
      ensure(contactId, 'Choose a trade.');
      await projectTrade(tx, i.projectId, contactId);
      ensure(!['CLOSED', 'CANCELLED'].includes(r.status), 'Reopen first.', 409);
      ensure(
        !r.assignedContactId || r.assignedContactId === contactId,
        'Create a replacement deficiency to transfer work to a different trade. This protects prior discussions and evidence.',
        409,
      );
      await shareTradeFiles(tx, i.projectId, contactId, r.attachmentIds, true);
    } else if (i.action === 'start' || i.action === 'ready')
      ensure(
        ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'].includes(r.status),
        'Deficiency cannot be updated in this state.',
        409,
      );
    else if (i.action === 'close')
      ensure(r.status === 'READY_FOR_REVIEW', 'Trade must submit for review before closing.', 409);
    else if (i.action === 'reopen')
      ensure(
        ['CLOSED', 'READY_FOR_REVIEW'].includes(r.status),
        'Only reviewed or closed work can be reopened.',
        409,
      );
    else
      ensure(!['CLOSED', 'CANCELLED'].includes(r.status), 'Deficiency cannot be cancelled.', 409);
    const status = (
      {
        start: 'IN_PROGRESS',
        ready: 'READY_FOR_REVIEW',
        close: 'CLOSED',
        reopen: 'REOPENED',
        cancel: 'CANCELLED',
        assign: 'ASSIGNED',
      } as const
    )[i.action];
    await tx.deficiency.update({
      where: { id: r.id },
      data: {
        status,
        assignedContactId: contactId,
        version: { increment: 1 },
        completedAt:
          i.action === 'ready' ? new Date() : i.action === 'reopen' ? null : r.completedAt,
        verifiedAt: i.action === 'close' ? new Date() : i.action === 'reopen' ? null : r.verifiedAt,
        verifiedById:
          i.action === 'close' ? actor.id : i.action === 'reopen' ? null : r.verifiedById,
      },
    });
    await tx.deficiencyUpdate.create({
      data: {
        deficiencyId: r.id,
        actorId: actor.id,
        recipientContactId: contactId,
        status,
        comment: i.comment,
      },
    });
    await tradeEvent(
      tx,
      actor,
      i.projectId,
      'Deficiency',
      r.id,
      'DEFICIENCY_' + status,
      `Deficiency ${r.number} is ${status.toLowerCase().replaceAll('_', ' ')}.`,
    );
    return !external && contactId
      ? tradeNotice(tx, i.projectId, [contactId], 'A deficiency has been updated.')
      : [];
  });
  await deliverPortalNotices(notices);
  return { ok: true };
}
