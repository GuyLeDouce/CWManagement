import { Prisma, ChangeOrderStatus } from '@prisma/client';
import { z } from 'zod';
import { transaction } from './db';
import { Actor, requireCapability, requireProjectAccess, projectScope } from './permissions';
import { ensure } from './errors';
import { financialTotals, lineAmounts, money } from './financial-math';
import { estimateLineSchema } from './financial';
import {
  db,
  json,
  identifier,
  optionalId,
  note,
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

export const changeOrderSchema = z
  .object({
    id: identifier.optional(),
    projectId: identifier,
    expectedVersion: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    description: note,
    category: note,
    internalNotes: note,
    scope: note,
    terms: note,
    clientId: optionalId,
    attachmentIds: z.array(identifier).max(30).default([]),
    scheduleDays: z.number().int().min(-3650).max(3650).default(0),
    lines: z
      .array(
        documentLineFields
          .extend({
            clientDescription: note,
            markupMethod: estimateLineSchema.shape.markupMethod,
            markupValue: estimateLineSchema.shape.markupValue,
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
const include = { lines: { orderBy: { sortOrder: 'asc' as const } }, changeOrder: true };
export async function changeOrderList(actor: Actor, projectId?: string) {
  await requireCapability(actor, 'CHANGE_ORDER_VIEW');
  if (projectId) await requireProjectAccess(actor, projectId);
  return db.changeOrder.findMany({
    where: { ...(projectId ? { projectId } : {}), project: await projectScope(actor) },
    include: {
      project: { select: { id: true, number: true, name: true } },
      revisions: {
        orderBy: { revision: 'desc' },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
          budgetVersion: { select: { id: true, version: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
export async function saveChangeOrder(actor: Actor, input: z.infer<typeof changeOrderSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, input.id ? 'CHANGE_ORDER_EDIT' : 'CHANGE_ORDER_CREATE', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    const before = input.id
      ? await tx.changeOrderRevision.findUnique({ where: { id: input.id }, include })
      : null;
    if (input.id) {
      ensure(before?.changeOrder.projectId === input.projectId, 'Change order not found.', 404);
      ensure(before.status === 'DRAFT', 'Only draft change orders can be edited.', 409);
      checkVersion(before, input.expectedVersion || 0);
    }
    if (input.clientId) {
      await contactSnapshot(tx, input.clientId);
      ensure(
        await tx.projectContact.findFirst({
          where: { projectId: input.projectId, contactId: input.clientId, role: 'CLIENT' },
        }),
        'Client must be associated with this project.',
      );
    }
    if (input.attachmentIds.length) await requireCapability(actor, 'FILE_VIEW_INTERNAL', tx);
    await validAttachments(tx, input.projectId, input.attachmentIds);
    const lines = [];
    for (const line of input.lines) {
      const code = await tx.costCode.findFirst({ where: { id: line.costCodeId, active: true } });
      ensure(code, 'Active cost code required.');
      lines.push({
        ...line,
        costCodeSnapshot: code.code,
        costCodeNameSnapshot: code.name,
        quantity: new Prisma.Decimal(line.quantity),
        unitCost: new Prisma.Decimal(line.unitCost),
        markupValue: new Prisma.Decimal(line.markupValue),
      });
    }
    const settings = await tx.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
    const taxRate = before?.taxRate || settings.taxRate,
      totals = financialTotals(
        lines.map((x) => ({ ...x, included: true })),
        taxRate,
      );
    const data = {
      title: input.title,
      description: input.description,
      category: input.category,
      internalNotes: input.internalNotes,
      scope: input.scope,
      terms: input.terms ?? settings.changeOrderTerms,
      clientId: input.clientId,
      attachmentIds: input.attachmentIds,
      scheduleDays: input.scheduleDays,
      taxRate,
      costTotal: totals.cost,
      subtotal: totals.price,
      taxAmount: totals.tax,
      total: totals.total,
    };
    let saved;
    if (before) {
      await tx.changeOrderLine.deleteMany({ where: { revisionId: before.id } });
      saved = await tx.changeOrderRevision.update({
        where: { id: before.id },
        data: { ...data, version: { increment: 1 }, lines: { create: lines } },
      });
    } else {
      const numbered = await numbering(tx, 'CHANGE_ORDER');
      const family = await tx.changeOrder.create({
        data: { projectId: input.projectId, number: numbered.number },
      });
      saved = await tx.changeOrderRevision.create({
        data: {
          ...data,
          changeOrderId: family.id,
          revision: 0,
          createdById: actor.id,
          lines: { create: lines },
        },
      });
    }
    await documentEvent(tx, actor, {
      projectId: input.projectId,
      entity: 'ChangeOrderRevision',
      entityId: saved.id,
      action: before ? 'CHANGE_ORDER_DRAFT_CHANGED' : 'CHANGE_ORDER_CREATED',
      description: before
        ? 'Updated a change order draft and its pricing.'
        : 'Created a change order draft.',
      tab: 'change-orders',
    });
    return saved;
  });
}
export async function changeOrderAction(actor: Actor, input: Transition) {
  return transaction(async (tx) => {
    const item = await tx.changeOrderRevision.findUnique({ where: { id: input.id }, include });
    ensure(item, 'Change order not found.', 404);
    const projectId = item.changeOrder.projectId;
    const project = await requireProjectAccess(actor, projectId, tx);
    const capability =
      input.action === 'accept'
        ? 'CHANGE_ORDER_ACCEPT'
        : input.action === 'approve'
          ? 'CHANGE_ORDER_APPROVE_INTERNAL'
          : input.action === 'issue' || input.action === 'void' || input.action === 'reject'
            ? 'CHANGE_ORDER_ISSUE'
            : 'CHANGE_ORDER_EDIT';
    await requireCapability(actor, capability, tx);
    checkVersion(item, input.expectedVersion);
    const latest = await tx.changeOrderRevision.findFirst({
      where: { changeOrderId: item.changeOrderId },
      orderBy: { revision: 'desc' },
    });
    ensure(latest?.id === item.id, 'Use the latest revision.', 409);
    ensure(
      item.status !== 'ACCEPTED',
      'Accepted change orders are immutable and cannot be applied twice.',
      409,
    );
    ensure(
      !(await tx.contractAdjustment.findUnique({ where: { changeOrderId: item.changeOrderId } })),
      'This change order has already been accepted.',
      409,
    );
    const description = item.changeOrder.number + ' Rev ' + item.revision;
    if (input.action === 'revise') {
      ensure(
        ['READY', 'ISSUED', 'REJECTED'].includes(item.status),
        'Only ready, issued or rejected change orders can be revised.',
      );
      const { lines } = item;
      const copy = without(item, 'id', 'changeOrder', 'lines', 'createdAt', 'updatedAt');
      const saved = await tx.changeOrderRevision.create({
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
          acceptedById: null,
          acceptedAt: null,
          acceptedByName: null,
          acceptanceMethod: null,
          acceptanceReference: null,
          lines: { create: lines.map((line) => without(line, 'id', 'revisionId')) },
        },
      });
      await tx.changeOrderRevision.update({
        where: { id: item.id },
        data: { status: 'SUPERSEDED', version: { increment: 1 } },
      });
      await documentEvent(tx, actor, {
        projectId,
        entity: 'ChangeOrderRevision',
        entityId: saved.id,
        action: 'CHANGE_ORDER_REVISED',
        description: item.changeOrder.number + ' Rev ' + saved.revision + ' drafted.',
        tab: 'change-orders',
      });
      return saved;
    }
    let status: ChangeOrderStatus = item.status;
    const data: Prisma.ChangeOrderRevisionUpdateInput = { version: { increment: 1 } };
    let notifyCapability:
      | 'CHANGE_ORDER_APPROVE_INTERNAL'
      | 'CHANGE_ORDER_ISSUE'
      | 'CHANGE_ORDER_ACCEPT'
      | 'CHANGE_ORDER_VIEW'
      | undefined;
    if (input.action === 'review') {
      ensure(item.status === 'DRAFT' && item.lines.length > 0, 'A draft with lines is required.');
      status = 'INTERNAL_REVIEW';
      notifyCapability = 'CHANGE_ORDER_APPROVE_INTERNAL';
    } else if (input.action === 'return') {
      ensure(
        ['INTERNAL_REVIEW', 'READY'].includes(item.status),
        'Only review or ready drafts can be returned.',
      );
      status = 'DRAFT';
      data.approvedAt = null;
      data.approvedById = null;
    } else if (input.action === 'approve') {
      ensure(item.status === 'INTERNAL_REVIEW', 'Only a change order in review can be approved.');
      status = 'READY';
      data.approvedAt = new Date();
      data.approvedById = actor.id;
      notifyCapability = 'CHANGE_ORDER_ISSUE';
    } else if (input.action === 'issue') {
      ensure(item.status === 'READY', 'Only an internally approved change order can be issued.');
      ensure(item.clientId, 'Select a project client before issuing.');
      const client = await contactSnapshot(tx, item.clientId);
      ensure(
        await tx.projectContact.findFirst({
          where: { projectId, contactId: item.clientId, role: 'CLIENT' },
        }),
        'Client must be associated with this project.',
      );
      const identity = await documentIdentity(tx, actor, projectId, item.attachmentIds);
      data.snapshot = json({
        ...identity,
        number: item.changeOrder.number,
        revision: item.revision,
        type: 'CHANGE_ORDER',
        title: item.title,
        description: item.description,
        scope: item.scope,
        terms: item.terms,
        scheduleDays: item.scheduleDays,
        issuedAt: new Date(),
        client: {
          name: client.name,
          contactName: client.contactName,
          email: client.email,
          phone: client.phone,
          address: client.address,
        },
        lines: item.lines.map((x) => ({
          description: x.clientDescription || x.description,
          quantity: x.quantity.toString(),
          unit: x.unit,
          amount: lineAmounts(x).price.toString(),
          taxable: x.taxable,
        })),
        subtotal: item.subtotal.toString(),
        tax: item.taxAmount.toString(),
        total: item.total.toString(),
        taxRate: item.taxRate.toString(),
      });
      status = 'ISSUED';
      data.issuedAt = new Date();
      data.issuedById = actor.id;
      notifyCapability = 'CHANGE_ORDER_ACCEPT';
    } else if (input.action === 'accept') {
      ensure(item.status === 'ISSUED', 'Only an issued change order can be accepted.');
      ensure(
        input.acceptedByName && input.acceptanceReference,
        'Record the client name and acceptance evidence/reference.',
      );
      ensure(
        project.contractAmount !== null,
        'Set the original contract value before accepting a change order.',
      );
      const budgets = await tx.budget.findMany({
        where: { projectId, active: true },
        include: { versions: { orderBy: { version: 'desc' }, include: { lines: true } } },
      });
      ensure(
        budgets.length === 1,
        'A single approved original/current project budget is required.',
      );
      const budget = budgets[0],
        current = budget.versions.find((x) => x.type !== 'ORIGINAL');
      ensure(
        current && budget.versions.some((x) => x.type === 'ORIGINAL'),
        'Original and current budget snapshots are required.',
      );
      const rows = new Map(
        current.lines.map((line) => [
          line.costCodeId + ':' + line.costType,
          without(line, 'id', 'budgetVersionId'),
        ]),
      );
      for (const line of item.lines) {
        const key = line.costCodeId + ':' + line.costType,
          old = rows.get(key);
        rows.set(key, {
          costCodeId: line.costCodeId,
          costCodeSnapshot: line.costCodeSnapshot,
          costCodeNameSnapshot: line.costCodeNameSnapshot,
          costType: line.costType,
          description: line.costCodeNameSnapshot,
          amount: money((old?.amount || money(0)).add(lineAmounts(line).cost)),
        });
      }
      const version = await tx.budgetVersion.create({
        data: {
          budgetId: budget.id,
          version: budget.versions[0].version + 1,
          type: 'CHANGE_ORDER',
          changeOrderRevisionId: item.id,
          description: 'Accepted ' + description,
          createdById: actor.id,
          lines: { create: [...rows.values()] },
        },
      });
      await tx.contractAdjustment.create({
        data: {
          projectId,
          changeOrderId: item.changeOrderId,
          revisionId: item.id,
          amount: item.subtotal,
        },
      });
      status = 'ACCEPTED';
      data.acceptedAt = new Date();
      data.acceptedById = actor.id;
      data.acceptedByName = input.acceptedByName;
      data.acceptanceMethod = 'MANUAL';
      data.acceptanceReference = input.acceptanceReference;
      notifyCapability = 'CHANGE_ORDER_VIEW';
      await documentEvent(tx, actor, {
        projectId,
        entity: 'BudgetVersion',
        entityId: version.id,
        action: 'CHANGE_ORDER_BUDGET_CREATED',
        description: 'Project budget updated from accepted ' + description + '.',
        tab: 'budget',
      });
      await documentEvent(tx, actor, {
        projectId,
        entity: 'ChangeOrderRevision',
        entityId: item.id,
        action: 'CONTRACT_ADJUSTED',
        description: 'Contract value adjusted through accepted ' + description + '.',
        tab: 'change-orders',
      });
    } else if (input.action === 'reject' || input.action === 'void') {
      ensure(input.reason, 'A reason is required.');
      ensure(
        input.action === 'reject'
          ? item.status === 'ISSUED'
          : ['DRAFT', 'INTERNAL_REVIEW', 'READY', 'ISSUED', 'REJECTED'].includes(item.status),
        'Invalid change order transition.',
      );
      status = input.action === 'reject' ? 'REJECTED' : 'VOID';
    } else ensure(false, 'Unsupported change order transition.');
    const saved = await tx.changeOrderRevision.update({
      where: { id: item.id },
      data: { ...data, status },
    });
    await documentEvent(tx, actor, {
      projectId,
      entity: 'ChangeOrderRevision',
      entityId: item.id,
      action: 'CHANGE_ORDER_' + status,
      description: description + ' ' + status.toLowerCase().replaceAll('_', ' ') + '.',
      reason: input.reason,
      tab: 'change-orders',
      notifyCapability,
    });
    return saved;
  });
}
