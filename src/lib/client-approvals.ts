import { z } from 'zod';
import { transaction, json } from './db';
import { Actor } from './permissions';
import { ensure } from './errors';
import { identifier, documentEvent } from './financial-documents';
import { requireClientProjectAccess } from './client-access';
import { changeOrderProjection } from './client-projections';
import { applyChangeOrderAcceptance } from './change-orders';

export const clientApprovalSchema = z
  .object({
    projectId: identifier,
    revisionId: identifier,
    documentHash: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(['APPROVE', 'DECLINE']),
    typedName: z.string().trim().min(2).max(200),
  })
  .strict();
export async function approveClientChangeOrder(
  actor: Actor,
  input: z.infer<typeof clientApprovalSchema>,
) {
  return transaction(async (tx) => {
    const grant = await requireClientProjectAccess(actor, input.projectId, tx);
    const item = await tx.changeOrderRevision.findFirst({
      where: {
        id: input.revisionId,
        clientId: grant.contactId,
        changeOrder: { projectId: input.projectId },
        issuedAt: { not: null },
      },
      include: { clientApproval: true },
    });
    ensure(item, 'Change order not found.', 404);
    const files = await tx.storedFile.findMany({
      where: {
        id: { in: item.attachmentIds },
        projectId: input.projectId,
        visibility: 'CLIENT',
        archivedAt: null,
      },
      select: { id: true },
    });
    const display = changeOrderProjection(
      item,
      files.map((f) => f.id),
    );
    ensure(
      display.documentHash === input.documentHash,
      'The document changed. Review the latest revision.',
      409,
    );
    if (item.clientApproval) {
      ensure(
        item.clientApproval.action === input.action,
        'A decision is already recorded for this revision.',
        409,
      );
      return { ok: true, status: item.status };
    }
    ensure(item.status === 'ISSUED', 'Only an issued revision can receive a decision.', 409);
    const latest = await tx.changeOrderRevision.findFirst({
      where: { changeOrderId: item.changeOrderId },
      orderBy: { revision: 'desc' },
    });
    ensure(latest?.id === item.id, 'Review the latest revision.', 409);
    const record = await tx.clientApproval.create({
      data: {
        revisionId: item.id,
        userId: actor.id,
        contactId: grant.contactId,
        action: input.action,
        typedName: input.typedName,
        snapshot: json(display.document),
        snapshotHash: display.documentHash,
      },
    });
    if (input.action === 'APPROVE') {
      await applyChangeOrderAcceptance(tx, actor, item.id, input.typedName, record.id, 'PORTAL');
    } else
      await tx.changeOrderRevision.update({
        where: { id: item.id },
        data: { status: 'REJECTED', version: { increment: 1 } },
      });
    await documentEvent(tx, actor, {
      projectId: input.projectId,
      entity: 'ClientApproval',
      entityId: record.id,
      action: 'CLIENT_CHANGE_ORDER_' + input.action,
      description: `${actor.firstName} ${actor.lastName} ${input.action === 'APPROVE' ? 'approved' : 'declined'} ${display.document.number} Rev ${display.document.revision}.`,
      tab: 'change-orders',
      notifyCapability: 'CHANGE_ORDER_VIEW',
    });
    return { ok: true, status: input.action === 'APPROVE' ? 'ACCEPTED' : 'REJECTED' };
  });
}
