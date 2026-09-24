import { Capability, PurchasingType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction } from './db';
import { Actor, can, requireCapability, requireProjectAccess, projectScope } from './permissions';
import { ensure } from './errors';
import { financialTotals, money } from './financial-math';
import { refreshCommitment } from './commitments';
import {
  db,
  json,
  identifier,
  optionalId,
  note,
  day,
  documentLineFields,
  checkVersion,
  contactSnapshot,
  documentIdentity,
  documentEvent,
  numbering,
  validAttachments,
  without,
  Transition,
} from './financial-documents';

export function purchasingCapability(
  type: PurchasingType,
  action: 'VIEW' | 'CREATE' | 'EDIT' | 'APPROVE' | 'ISSUE',
): Capability {
  return (type + '_' + action) as Capability;
}
export const purchasingSchema = z
  .object({
    id: identifier.optional(),
    projectId: identifier,
    type: z.enum(PurchasingType),
    expectedVersion: z.number().int().positive().optional(),
    vendorContactId: identifier,
    billingContactId: optionalId,
    changeOrderRevisionId: optionalId,
    scheduleTaskId: optionalId,
    attachmentIds: z.array(identifier).max(30).default([]),
    title: z.string().trim().min(1).max(200),
    scope: note,
    terms: note,
    internalNotes: note,
    vendorNotes: note,
    expectedDate: day,
    lines: z
      .array(
        documentLineFields.extend({ lineKey: identifier.optional(), internalNotes: note }).strict(),
      )
      .max(200),
  })
  .strict();
const include = {
  lines: { orderBy: { sortOrder: 'asc' as const } },
  document: true,
  vendorContact: { include: { company: true } },
};
export async function purchasingOptions(actor: Actor, projectId: string) {
  await requireProjectAccess(actor, projectId);
  ensure(
    (await can(actor, 'PURCHASE_ORDER_VIEW')) ||
      (await can(actor, 'WORK_ORDER_VIEW')) ||
      (await can(actor, 'CHANGE_ORDER_VIEW')),
    'Purchasing access required.',
    403,
  );
  return {
    contacts: await db.contact.findMany({
      where: { active: true, OR: [{ companyId: null }, { company: { active: true } }] },
      include: { company: true },
      orderBy: { lastName: 'asc' },
    }),
    codes: await db.costCode.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
    files: (await can(actor, 'FILE_VIEW_INTERNAL'))
      ? await db.storedFile.findMany({
          where: { projectId, archivedAt: null },
          select: { id: true, originalFilename: true },
        })
      : [],
    tasks: await db.projectTask.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true, name: true },
    }),
    changes: (await can(actor, 'CHANGE_ORDER_VIEW'))
      ? await db.changeOrderRevision.findMany({
          where: { changeOrder: { projectId }, status: { in: ['ISSUED', 'ACCEPTED'] } },
          select: {
            id: true,
            title: true,
            revision: true,
            changeOrder: { select: { number: true } },
          },
        })
      : [],
  };
}
export async function purchasingList(actor: Actor, projectId?: string) {
  const types: PurchasingType[] = [];
  for (const type of ['PURCHASE_ORDER', 'WORK_ORDER'] as const)
    if (await can(actor, purchasingCapability(type, 'VIEW'))) types.push(type);
  ensure(types.length, 'Purchasing access required.', 403);
  if (projectId) await requireProjectAccess(actor, projectId);
  return db.purchasingDocument.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      project: await projectScope(actor),
      type: { in: types },
    },
    include: {
      project: { select: { id: true, name: true, number: true } },
      revisions: {
        orderBy: { revision: 'desc' },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
          vendorContact: { include: { company: true } },
        },
      },
      commitment: { include: { lines: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
export async function savePurchasing(actor: Actor, input: z.infer<typeof purchasingSchema>) {
  return transaction(async (tx) => {
    await requireCapability(
      actor,
      purchasingCapability(input.type, input.id ? 'EDIT' : 'CREATE'),
      tx,
    );
    await requireProjectAccess(actor, input.projectId, tx);
    const before = input.id
      ? await tx.purchasingRevision.findUnique({ where: { id: input.id }, include })
      : null;
    if (input.id) {
      ensure(
        before &&
          before.document.projectId === input.projectId &&
          before.document.type === input.type,
        'Purchasing revision not found.',
        404,
      );
      ensure(
        before.status === 'DRAFT' && !before.document.cancelledAt,
        'Only draft revisions can be edited.',
        409,
      );
      checkVersion(before, input.expectedVersion || 0);
    }
    const vendor = await contactSnapshot(tx, input.vendorContactId);
    ensure(
      vendor.contact.types.some((x) => ['VENDOR', 'SUBTRADE'].includes(x)),
      'Choose a vendor or subcontractor contact.',
    );
    if (input.billingContactId) {
      const billing = await contactSnapshot(tx, input.billingContactId);
      ensure(
        billing.contact.id === vendor.contact.id ||
          (!!vendor.contact.companyId && billing.contact.companyId === vendor.contact.companyId),
        'Billing contact must belong to the vendor company.',
      );
    }
    if (input.scheduleTaskId)
      ensure(
        await tx.projectTask.findFirst({
          where: { id: input.scheduleTaskId, projectId: input.projectId, archivedAt: null },
        }),
        'Schedule task must belong to this project.',
      );
    if (input.changeOrderRevisionId)
      ensure(
        await tx.changeOrderRevision.findFirst({
          where: {
            id: input.changeOrderRevisionId,
            changeOrder: { projectId: input.projectId },
            status: { in: ['ISSUED', 'ACCEPTED'] },
          },
        }),
        'Link an issued or accepted change order from this project.',
      );
    if (input.attachmentIds.length) await requireCapability(actor, 'FILE_VIEW_INTERNAL', tx);
    await validAttachments(tx, input.projectId, input.attachmentIds);
    const keys = new Set<string>();
    const lines = [];
    for (const line of input.lines) {
      const key = line.lineKey || randomUUID();
      ensure(!keys.has(key), 'Duplicate purchasing line key.');
      keys.add(key);
      if (line.lineKey)
        ensure(
          before?.lines.some((x) => x.lineKey === key),
          'Unknown purchasing line key.',
        );
      const code = await tx.costCode.findFirst({ where: { id: line.costCodeId, active: true } });
      ensure(code, 'Active cost code required.');
      const amount = money(new Prisma.Decimal(line.quantity).mul(line.unitCost));
      lines.push({
        ...line,
        lineKey: key,
        costCodeSnapshot: code.code,
        costCodeNameSnapshot: code.name,
        quantity: new Prisma.Decimal(line.quantity),
        unitCost: new Prisma.Decimal(line.unitCost),
        amount,
      });
    }
    const settings = await tx.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
    const taxRate = before?.taxRate || settings.taxRate;
    const totals = financialTotals(
      lines.map((x) => ({ ...x, markupMethod: 'NONE' as const, markupValue: 0, included: true })),
      taxRate,
    );
    const data = {
      vendorContactId: input.vendorContactId,
      billingContactId: input.billingContactId,
      changeOrderRevisionId: input.changeOrderRevisionId,
      scheduleTaskId: input.scheduleTaskId,
      attachmentIds: input.attachmentIds,
      title: input.title,
      scope: input.scope,
      terms: input.terms ?? settings.purchasingTerms,
      internalNotes: input.internalNotes,
      vendorNotes: input.vendorNotes,
      expectedDate: input.expectedDate,
      taxRate,
      subtotal: totals.cost,
      taxAmount: totals.tax,
      total: totals.total,
    };
    let saved;
    if (before) {
      await tx.purchasingLine.deleteMany({ where: { revisionId: before.id } });
      saved = await tx.purchasingRevision.update({
        where: { id: before.id },
        data: { ...data, version: { increment: 1 }, lines: { create: lines } },
      });
    } else {
      const numbered = await numbering(tx, input.type);
      const document = await tx.purchasingDocument.create({
        data: { projectId: input.projectId, type: input.type, number: numbered.number },
      });
      saved = await tx.purchasingRevision.create({
        data: {
          ...data,
          documentId: document.id,
          revision: 0,
          createdById: actor.id,
          lines: { create: lines },
        },
      });
    }
    await documentEvent(tx, actor, {
      projectId: input.projectId,
      entity: 'PurchasingRevision',
      entityId: saved.id,
      action: before ? 'PURCHASING_DRAFT_CHANGED' : 'PURCHASING_CREATED',
      description: before
        ? 'Updated a purchasing draft and its lines.'
        : 'Created a purchasing draft.',
      tab: 'purchase-orders',
    });
    return saved;
  });
}
export async function purchasingAction(actor: Actor, input: Transition) {
  return transaction(async (tx) => {
    const item = await tx.purchasingRevision.findUnique({ where: { id: input.id }, include });
    ensure(item, 'Purchasing revision not found.', 404);
    await requireProjectAccess(actor, item.document.projectId, tx);
    const operation =
      input.action === 'approve'
        ? 'APPROVE'
        : input.action === 'issue'
          ? 'ISSUE'
          : input.action === 'cancel'
            ? 'APPROVE'
            : 'EDIT';
    await requireCapability(actor, purchasingCapability(item.document.type, operation), tx);
    checkVersion(item, input.expectedVersion);
    ensure(!item.document.cancelledAt, 'This purchasing document is cancelled.', 409);
    const projectId = item.document.projectId;
    const latest = await tx.purchasingRevision.findFirst({
      where: { documentId: item.documentId },
      orderBy: { revision: 'desc' },
    });
    ensure(latest?.id === item.id, 'Use the latest revision.', 409);
    let status = item.status;
    let notifyCapability: Capability | undefined;
    if (input.action === 'revise') {
      ensure(
        ['APPROVED', 'ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'].includes(item.status),
        'Only approved or issued documents can be revised.',
      );
      const { lines } = item;
      const copy = without(
        item,
        'id',
        'document',
        'vendorContact',
        'lines',
        'createdAt',
        'updatedAt',
      );
      const revision = await tx.purchasingRevision.create({
        data: {
          ...copy,
          revision: item.revision + 1,
          version: 1,
          status: 'DRAFT',
          snapshot: Prisma.DbNull,
          createdById: actor.id,
          approvedById: null,
          approvedAt: null,
          issuedById: null,
          issuedAt: null,
          acknowledgedAt: null,
          lines: { create: lines.map((line) => without(line, 'id', 'revisionId')) },
        },
      });
      if (!item.issuedAt)
        await tx.purchasingRevision.update({
          where: { id: item.id },
          data: { status: 'SUPERSEDED', version: { increment: 1 } },
        });
      await documentEvent(tx, actor, {
        projectId,
        entity: 'PurchasingRevision',
        entityId: revision.id,
        action: 'PURCHASING_REVISED',
        description:
          item.document.number +
          ' Rev ' +
          revision.revision +
          ' drafted; existing issued commitment remains in force.',
        tab: 'purchase-orders',
      });
      return revision;
    }
    if (input.action === 'review') {
      ensure(
        item.status === 'DRAFT' && item.lines.length > 0 && item.subtotal.gt(0),
        'A priced draft with lines is required.',
      );
      status = 'INTERNAL_REVIEW';
      notifyCapability = purchasingCapability(item.document.type, 'APPROVE');
    } else if (input.action === 'return') {
      ensure(
        ['INTERNAL_REVIEW', 'APPROVED'].includes(item.status),
        'Only review or approved drafts can be returned.',
      );
      status = 'DRAFT';
    } else if (input.action === 'approve') {
      ensure(item.status === 'INTERNAL_REVIEW', 'Only a document in review can be approved.');
      status = 'APPROVED';
      notifyCapability = purchasingCapability(item.document.type, 'ISSUE');
    } else if (input.action === 'cancel') {
      ensure(input.reason, 'Cancellation reason is required.');
      const commitment = await tx.commitment.findUnique({
        where: { purchasingDocumentId: item.documentId },
      });
      if (commitment) {
        await requireCapability(actor, 'COMMITMENT_MANAGE', tx);
        await tx.commitment.update({ where: { id: commitment.id }, data: { status: 'CANCELLED' } });
      }
      await tx.purchasingDocument.update({
        where: { id: item.documentId },
        data: { cancelledAt: new Date() },
      });
      await tx.purchasingRevision.updateMany({
        where: {
          documentId: item.documentId,
          status: { in: ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
        },
        data: { status: 'CANCELLED' },
      });
      status = 'CANCELLED';
    } else if (input.action === 'issue') {
      ensure(item.status === 'APPROVED', 'Only an internally approved document can be issued.');
      const vendor = await contactSnapshot(tx, item.vendorContactId);
      const billing = item.billingContactId
        ? await contactSnapshot(tx, item.billingContactId)
        : null;
      ensure(
        vendor.contact.types.some((x) => ['VENDOR', 'SUBTRADE'].includes(x)),
        'Choose a vendor or subcontractor contact.',
      );
      if (billing)
        ensure(
          billing.contact.id === vendor.contact.id ||
            (!!vendor.contact.companyId && billing.contact.companyId === vendor.contact.companyId),
          'Billing contact must belong to the vendor company.',
        );
      if (item.changeOrderRevisionId)
        ensure(
          await tx.changeOrderRevision.findFirst({
            where: {
              id: item.changeOrderRevisionId,
              changeOrder: { projectId },
              status: { in: ['ISSUED', 'ACCEPTED'] },
            },
          }),
          'Linked change order must still be issued or accepted.',
        );
      const identity = await documentIdentity(tx, actor, projectId, item.attachmentIds);
      const existing = await tx.commitment.findUnique({
        where: { purchasingDocumentId: item.documentId },
        include: { lines: true },
      });
      if (existing)
        ensure(
          existing.vendorContactId === item.vendorContactId,
          'An issued document cannot change vendor. Cancel it and create a new document.',
        );
      const commitment =
        existing ||
        (await tx.commitment.create({
          data: {
            projectId,
            purchasingDocumentId: item.documentId,
            vendorContactId: item.vendorContactId,
            sourceType: item.document.type === 'WORK_ORDER' ? 'SUBCONTRACT' : 'PURCHASE_ORDER',
            sourceId: item.documentId,
            reference: item.document.number,
            status: 'COMMITTED',
            committedDate: new Date(),
          },
        }));
      for (const old of existing?.lines || []) {
        const next = item.lines.find((x) => x.lineKey === old.sourceLineKey);
        ensure(
          next ? next.amount.gte(old.consumedAmount) : old.consumedAmount.eq(0),
          'Revision cannot remove or reduce a line below consumed commitment.',
        );
        if (next)
          ensure(
            next.costCodeId === old.costCodeId && next.costType === old.costType,
            'Existing commitment line classification cannot change; add a new line.',
          );
        if (!next)
          await tx.commitmentLine.update({ where: { id: old.id }, data: { committedAmount: 0 } });
      }
      for (const line of item.lines)
        await tx.commitmentLine.upsert({
          where: {
            commitmentId_sourceLineKey: {
              commitmentId: commitment.id,
              sourceLineKey: line.lineKey,
            },
          },
          create: {
            commitmentId: commitment.id,
            sourceLineKey: line.lineKey,
            costCodeId: line.costCodeId,
            costType: line.costType,
            description: line.description,
            committedAmount: line.amount,
          },
          update: { description: line.description, committedAmount: line.amount },
        });
      await tx.purchasingRevision.updateMany({
        where: {
          documentId: item.documentId,
          id: { not: item.id },
          status: { in: ['APPROVED', 'ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
        },
        data: { status: 'SUPERSEDED', version: { increment: 1 } },
      });
      const snapshot = {
        ...identity,
        number: item.document.number,
        revision: item.revision,
        type: item.document.type,
        title: item.title,
        scope: item.scope,
        terms: item.terms,
        notes: item.vendorNotes,
        expectedDate: item.expectedDate,
        issuedAt: new Date(),
        vendor: {
          name: vendor.name,
          contactName: vendor.contactName,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
        },
        billing: billing
          ? {
              name: billing.contactName,
              email: billing.email,
              phone: billing.phone,
              address: billing.address,
            }
          : null,
        lines: item.lines.map((x) => ({
          description: x.description,
          quantity: x.quantity.toString(),
          unit: x.unit,
          unitCost: x.unitCost.toString(),
          amount: x.amount.toString(),
          taxable: x.taxable,
        })),
        subtotal: item.subtotal.toString(),
        tax: item.taxAmount.toString(),
        total: item.total.toString(),
        taxRate: item.taxRate.toString(),
      };
      await tx.purchasingRevision.update({
        where: { id: item.id },
        data: {
          snapshot: json(snapshot),
          issuedAt: new Date(),
          issuedById: actor.id,
          status: 'ISSUED',
          version: { increment: 1 },
        },
      });
      await refreshCommitment(tx, commitment.id, actor);
      await documentEvent(tx, actor, {
        projectId,
        entity: 'PurchasingRevision',
        entityId: item.id,
        action: item.document.type + '_ISSUED',
        description:
          item.document.number + ' Rev ' + item.revision + ' issued to ' + vendor.name + '.',
        tab: 'purchase-orders',
        notifyCapability: purchasingCapability(item.document.type, 'VIEW'),
      });
      return tx.purchasingRevision.findUniqueOrThrow({ where: { id: item.id } });
    } else ensure(false, 'Unsupported purchasing transition.');
    const saved = await tx.purchasingRevision.update({
      where: { id: item.id },
      data: {
        status,
        version: { increment: 1 },
        ...(status === 'APPROVED' ? { approvedAt: new Date(), approvedById: actor.id } : {}),
        ...(status === 'DRAFT' ? { approvedAt: null, approvedById: null } : {}),
      },
    });
    await documentEvent(tx, actor, {
      projectId,
      entity: 'PurchasingRevision',
      entityId: item.id,
      action: item.document.type + '_' + status,
      description:
        item.document.number +
        ' Rev ' +
        item.revision +
        ' ' +
        status.toLowerCase().replaceAll('_', ' ') +
        '.',
      reason: input.reason,
      tab: 'purchase-orders',
      notifyCapability,
    });
    return saved;
  });
}
