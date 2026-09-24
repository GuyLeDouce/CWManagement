import { CostCodeType } from '@prisma/client';
import { z } from 'zod';
import { db, transaction, json } from './db';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { ensure } from './errors';
import { identifier, note, optionalId, day, documentEvent, numbering } from './financial-documents';
import { estimateLineSchema } from './financial';
import { lineAmounts, money } from './financial-math';
import { requireClientProjectAccess } from './client-access';
import { clientOptionSelect, selectionVariance } from './client-projections';
import { clientNotice, deliverClientNotices } from './client-notices';

const amount = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/);
export const allowanceSchema = z
  .object({
    projectId: identifier,
    name: z.string().trim().min(1).max(200),
    description: note,
    internalNotes: note,
    costCodeId: identifier,
    costType: z.enum(CostCodeType),
    amount,
    includedCost: amount,
    taxable: z.boolean().default(true),
    estimateLineId: optionalId,
    budgetLineId: optionalId,
    deadline: day,
  })
  .strict();
export async function saveAllowance(actor: Actor, input: z.infer<typeof allowanceSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'SELECTION_CREATE', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    ensure(
      await tx.costCode.findFirst({ where: { id: input.costCodeId, active: true } }),
      'Active cost code required.',
    );
    let values = {
      amount: money(input.amount),
      includedCost: money(input.includedCost),
      taxable: input.taxable,
    };
    if (input.estimateLineId) {
      const line = await tx.estimateLine.findFirst({
        where: {
          id: input.estimateLineId,
          allowance: true,
          included: true,
          revision: { estimate: { projectId: input.projectId } },
        },
      });
      ensure(
        line && line.costCodeId === input.costCodeId && line.costType === input.costType,
        'An allowance estimate line from this project and cost allocation is required.',
      );
      const accepted = await tx.proposalRevision.findFirst({
        where: { estimateRevisionId: line.revisionId, status: 'ACCEPTED' },
      });
      ensure(accepted, 'The source estimate must be covered by an accepted proposal.');
      const totals = lineAmounts(line);
      values = { amount: totals.price, includedCost: totals.cost, taxable: line.taxable };
    }
    if (input.budgetLineId)
      ensure(
        await tx.budgetLine.findFirst({
          where: {
            id: input.budgetLineId,
            costCodeId: input.costCodeId,
            costType: input.costType,
            budgetVersion: { budget: { projectId: input.projectId } },
          },
        }),
        'Budget source must match this project and cost allocation.',
      );
    const saved = await tx.allowance.create({ data: { ...input, ...values } });
    await documentEvent(tx, actor, {
      projectId: input.projectId,
      entity: 'Allowance',
      entityId: saved.id,
      action: 'ALLOWANCE_CREATED',
      description: 'Contract allowance recorded.',
      tab: 'selections',
    });
    return saved;
  });
}
export const selectionSchema = z
  .object({
    id: identifier.optional(),
    projectId: identifier,
    expectedVersion: z.number().int().positive().optional(),
    allowanceId: optionalId,
    category: z.string().trim().min(1).max(150),
    title: z.string().trim().min(1).max(200),
    description: note,
    internalNotes: note,
    deadline: day,
    required: z.boolean().default(true),
    options: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            description: note,
            manufacturer: note,
            model: note,
            finish: note,
            referenceUrl: z
              .union([z.url().refine((v) => /^https?:\/\//.test(v)), z.literal('')])
              .nullish()
              .transform((v) => v || null),
            leadTime: note,
            vendorContactId: optionalId,
            attachmentIds: z.array(identifier).max(20).default([]),
            costCodeId: identifier,
            costType: z.enum(CostCodeType),
            quantity: estimateLineSchema.shape.quantity,
            unit: note,
            unitCost: estimateLineSchema.shape.unitCost,
            markupMethod: estimateLineSchema.shape.markupMethod,
            markupValue: estimateLineSchema.shape.markupValue,
            taxable: z.boolean().default(true),
            recommended: z.boolean().default(false),
            sortOrder: z.number().int().min(0).default(0),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export async function saveSelection(actor: Actor, input: z.infer<typeof selectionSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, input.id ? 'SELECTION_EDIT' : 'SELECTION_CREATE', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    const before = input.id
      ? await tx.selection.findFirst({
          where: { id: input.id, projectId: input.projectId },
          include: { decisions: true },
        })
      : null;
    if (input.id)
      ensure(
        before &&
          before.status === 'DRAFT' &&
          before.version === input.expectedVersion &&
          !before.decisions.length,
        'Only the current undecided draft can be edited.',
        409,
      );
    const allowance = input.allowanceId
      ? await tx.allowance.findFirst({
          where: { id: input.allowanceId, projectId: input.projectId },
        })
      : null;
    if (input.allowanceId) ensure(allowance, 'Allowance not found.');
    const options = [];
    for (const option of input.options) {
      ensure(
        await tx.costCode.findFirst({ where: { id: option.costCodeId, active: true } }),
        'Active cost code required.',
      );
      if (allowance)
        ensure(
          option.costCodeId === allowance.costCodeId &&
            option.costType === allowance.costType &&
            option.taxable === allowance.taxable,
          'Options must use their allowance cost allocation and tax treatment.',
        );
      if (option.vendorContactId)
        ensure(
          await tx.contact.findFirst({ where: { id: option.vendorContactId, active: true } }),
          'Active supplier contact required.',
        );
      ensure(
        (await tx.storedFile.count({
          where: {
            id: { in: option.attachmentIds },
            projectId: input.projectId,
            visibility: 'CLIENT',
            archivedAt: null,
          },
        })) === new Set(option.attachmentIds).size,
        'Only explicitly client-visible project attachments may be published with an option.',
      );
      const totals = lineAmounts(option);
      options.push({ ...option, clientPrice: totals.price });
    }
    const { id, expectedVersion: _, options: _options, ...fields } = input;
    void _;
    void _options;
    if (id) await tx.selectionOption.deleteMany({ where: { selectionId: id } });
    const saved = id
      ? await tx.selection.update({
          where: { id },
          data: { ...fields, version: { increment: 1 }, options: { create: options } },
        })
      : await tx.selection.create({
          data: { ...fields, createdById: actor.id, options: { create: options } },
        });
    await documentEvent(tx, actor, {
      projectId: input.projectId,
      entity: 'Selection',
      entityId: saved.id,
      action: before ? 'SELECTION_REVISED' : 'SELECTION_CREATED',
      description: `Selection “${saved.title}” ${before ? 'updated' : 'created'}.`,
      tab: 'selections',
    });
    return saved;
  });
}
export async function selectionAction(
  actor: Actor,
  id: string,
  version: number,
  action: 'publish' | 'unpublish' | 'close',
) {
  const result = await transaction(async (tx) => {
    await requireCapability(
      actor,
      action === 'close' ? 'SELECTION_APPROVE_INTERNAL' : 'SELECTION_PUBLISH',
      tx,
    );
    const s = await tx.selection.findUnique({
      where: { id },
      include: { options: true, decisions: true },
    });
    ensure(s, 'Selection not found.', 404);
    await requireProjectAccess(actor, s.projectId, tx);
    ensure(s.version === version, 'Selection changed. Refresh before continuing.', 409);
    if (action === 'publish')
      ensure(s.status === 'DRAFT' && s.options.length > 0, 'A draft with options is required.');
    if (action === 'unpublish')
      ensure(
        s.status === 'PUBLISHED' && !s.decisions.length,
        'Decided selections cannot be unpublished.',
        409,
      );
    if (action === 'close')
      ensure(s.status === 'APPROVED', 'Only approved selections can be closed.');
    await tx.selection.update({
      where: { id },
      data: {
        status: action === 'publish' ? 'PUBLISHED' : action === 'unpublish' ? 'DRAFT' : 'CLOSED',
        publishedAt:
          action === 'publish' ? new Date() : action === 'unpublish' ? null : s.publishedAt,
        version: { increment: 1 },
      },
    });
    if (action === 'publish' && s.allowanceId)
      await tx.allowance.update({
        where: { id: s.allowanceId },
        data: { publishedAt: new Date() },
      });
    await documentEvent(tx, actor, {
      projectId: s.projectId,
      entity: 'Selection',
      entityId: id,
      action: 'SELECTION_' + action.toUpperCase(),
      description: `Selection “${s.title}” ${action === 'publish' ? 'published to the client' : action === 'close' ? 'closed' : 'returned to draft'}.`,
      tab: 'selections',
    });
    return action === 'publish'
      ? await clientNotice(tx, s.projectId, 'A selection is ready for your review')
      : [];
  });
  await deliverClientNotices(result);
  return { ok: true };
}
export const decisionSchema = z
  .object({
    projectId: identifier,
    selectionId: identifier,
    optionId: identifier,
    expectedVersion: z.number().int().positive(),
    comments: note,
  })
  .strict();
export async function decideSelection(actor: Actor, input: z.infer<typeof decisionSchema>) {
  return transaction(async (tx) => {
    const grant = await requireClientProjectAccess(actor, input.projectId, tx);
    const s = await tx.selection.findFirst({
      where: { id: input.selectionId, projectId: input.projectId },
      include: { allowance: true, options: true, decisions: true },
    });
    ensure(s && s.publishedAt, 'Selection not found.', 404);
    if (s.decisions.length) {
      ensure(
        s.decisions[0].optionId === input.optionId,
        'This decision is recorded. Contact your project manager to arrange a revised selection.',
        409,
      );
      return { ok: true, decisionId: s.decisions[0].id };
    }
    ensure(
      s.status === 'PUBLISHED' && s.version === input.expectedVersion,
      'Selection changed. Review the latest options.',
      409,
    );
    const option = s.options.find((o) => o.id === input.optionId && o.active);
    ensure(option, 'Option not found.', 404);
    const safeOption = await tx.selectionOption.findUniqueOrThrow({
      where: { id: option.id },
      select: clientOptionSelect,
    });
    const allowance = s.allowance?.amount || money(0),
      variance = selectionVariance(allowance, option.clientPrice);
    const attachments = await tx.storedFile.findMany({
      where: {
        id: { in: option.attachmentIds },
        projectId: s.projectId,
        visibility: 'CLIENT',
        archivedAt: null,
      },
      select: { id: true, originalFilename: true },
    });
    const snapshot = json({
      title: s.title,
      description: s.description,
      option: { ...safeOption, attachmentIds: attachments.map((f) => f.id) },
      attachments,
      allowance: allowance.toString(),
      selectedPrice: option.clientPrice.toString(),
      variance: variance.toString(),
      taxable: option.taxable,
    });
    const decision = await tx.selectionDecision.create({
      data: {
        selectionId: s.id,
        optionId: option.id,
        userId: actor.id,
        contactId: grant.contactId,
        snapshot,
        comments: input.comments,
      },
    });
    let changeOrderId: string | null = null;
    if (!variance.eq(0)) {
      const costDelta = money(lineAmounts(option).cost.sub(s.allowance?.includedCost || 0));
      const code = await tx.costCode.findUniqueOrThrow({ where: { id: option.costCodeId } });
      const numbered = await numbering(tx, 'CHANGE_ORDER');
      const co = await tx.changeOrder.create({
        data: { projectId: s.projectId, number: numbered.number },
      });
      changeOrderId = co.id;
      const settings = await tx.settings.findUniqueOrThrow({ where: { id: 'company' } });
      const tax = option.taxable ? money(variance.mul(settings.taxRate)) : money(0);
      await tx.changeOrderRevision.create({
        data: {
          changeOrderId: co.id,
          revision: 0,
          createdById: actor.id,
          title: `Selection: ${s.title}`,
          scope: `${option.name}. Adjustment relative to the included allowance.`,
          clientId: grant.contactId,
          taxRate: settings.taxRate,
          costTotal: costDelta,
          subtotal: variance,
          taxAmount: tax,
          total: variance.add(tax),
          terms: settings.changeOrderTerms,
          lines: {
            create: {
              costCodeId: code.id,
              costCodeSnapshot: code.code,
              costCodeNameSnapshot: code.name,
              costType: option.costType,
              description: s.title,
              clientDescription: `${option.name} — allowance adjustment`,
              quantity: 1,
              unit: 'each',
              unitCost: costDelta,
              markupMethod: 'FIXED',
              markupValue: variance.sub(costDelta),
              taxable: option.taxable,
              sortOrder: 0,
            },
          },
        },
      });
      await documentEvent(tx, actor, {
        projectId: s.projectId,
        entity: 'ChangeOrder',
        entityId: co.id,
        action: 'SELECTION_CHANGE_ORDER_DRAFTED',
        description: 'Selection adjustment drafted for internal change order review.',
        tab: 'change-orders',
      });
    }
    await tx.selection.update({
      where: { id: s.id },
      data: {
        status: changeOrderId ? 'APPROVAL_REQUIRED' : 'APPROVED',
        changeOrderId,
        decidedAt: new Date(),
        approvedAt: changeOrderId ? null : new Date(),
        version: { increment: 1 },
      },
    });
    await documentEvent(tx, actor, {
      projectId: s.projectId,
      entity: 'SelectionDecision',
      entityId: decision.id,
      action: 'CLIENT_SELECTION_DECIDED',
      description: `${actor.firstName} ${actor.lastName} selected “${option.name}” for “${s.title}”.`,
      tab: 'selections',
      notifyCapability: 'SELECTION_VIEW',
    });
    return { ok: true, decisionId: decision.id };
  });
}
export async function internalSelections(actor: Actor, projectId: string) {
  await requireCapability(actor, 'SELECTION_VIEW');
  await requireProjectAccess(actor, projectId);
  return {
    allowances: await db.allowance.findMany({ where: { projectId } }),
    selections: await db.selection.findMany({
      where: { projectId },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        decisions: true,
        changeOrder: { select: { number: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  };
}
