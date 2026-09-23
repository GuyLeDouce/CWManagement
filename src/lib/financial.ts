import { parse } from 'csv-parse/sync';
import { CostCodeType, MarkupMethod, Prisma } from '@prisma/client';
import { z } from 'zod';
import { publishProjectEvent } from './activity';
import { privateKey } from './crypto';
import { db, transaction } from './db';
import { AppError, ensure } from './errors';
import { Actor, can, requireCapability, requireProjectAccess } from './permissions';

const Decimal = Prisma.Decimal;
export const money = (value: Prisma.Decimal.Value) =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function lineAmounts(input: {
  quantity: Prisma.Decimal.Value;
  unitCost: Prisma.Decimal.Value;
  markupMethod: MarkupMethod;
  markupValue: Prisma.Decimal.Value;
}) {
  const cost = money(new Decimal(input.quantity).mul(input.unitCost));
  const markup =
    input.markupMethod === 'PERCENT_ON_COST'
      ? money(cost.mul(input.markupValue).div(100))
      : input.markupMethod === 'FIXED'
        ? money(input.markupValue)
        : money(0);
  return { cost, markup, price: money(cost.add(markup)) };
}

export function financialTotals(
  lines: Array<Parameters<typeof lineAmounts>[0] & { taxable: boolean; included: boolean }>,
  taxRate: Prisma.Decimal.Value,
) {
  let cost = new Decimal(0),
    price = new Decimal(0),
    taxable = new Decimal(0);
  for (const line of lines.filter((item) => item.included)) {
    const amounts = lineAmounts(line);
    cost = cost.add(amounts.cost);
    price = price.add(amounts.price);
    if (line.taxable) taxable = taxable.add(amounts.price);
  }
  cost = money(cost);
  price = money(price);
  const tax = money(taxable.mul(taxRate));
  const total = money(price.add(tax));
  const profit = money(price.sub(cost));
  return {
    cost,
    markup: profit,
    price,
    tax,
    total,
    profit,
    marginPercent: price.eq(0)
      ? new Decimal(0)
      : profit.div(price).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}

const nullable = z
  .string()
  .trim()
  .max(5000)
  .nullish()
  .transform((value) => value || null);
export const costCodeSchema = z
  .object({
    id: z.string().optional(),
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(200),
    description: nullable,
    parentId: z
      .string()
      .nullish()
      .transform((value) => value || null),
    type: z.enum(CostCodeType),
    active: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();

export async function costCodes(actor: Actor, query?: string, active?: boolean) {
  await requireCapability(actor, 'COST_CODE_VIEW');
  return db.costCode.findMany({
    where: {
      ...(active == null ? {} : { active }),
      ...(query
        ? {
            OR: [
              { code: { contains: query, mode: 'insensitive' as const } },
              { name: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    include: {
      parent: { select: { id: true, code: true, name: true } },
      _count: {
        select: { children: true, estimateLines: true, budgetLines: true, actualCosts: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}

export async function saveCostCode(actor: Actor, input: z.infer<typeof costCodeSchema>) {
  await requireCapability(actor, 'COST_CODE_MANAGE');
  return transaction(async (tx) => {
    if (input.parentId) {
      ensure(
        input.parentId !== input.id &&
          (await tx.costCode.findUnique({ where: { id: input.parentId } })),
        'Parent cost code not found.',
      );
      let cursor: string | null = input.parentId;
      while (cursor) {
        ensure(cursor !== input.id, 'Cost-code hierarchy cannot contain a cycle.');
        cursor =
          (await tx.costCode.findUnique({ where: { id: cursor }, select: { parentId: true } }))
            ?.parentId ?? null;
      }
    }
    const before = input.id ? await tx.costCode.findUnique({ where: { id: input.id } }) : null;
    const data = {
      code: input.code,
      name: input.name,
      description: input.description,
      parentId: input.parentId,
      type: input.type,
      active: input.active,
      sortOrder: input.sortOrder,
    };
    const item = input.id
      ? await tx.costCode.update({ where: { id: input.id }, data })
      : await tx.costCode.create({ data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: before
          ? item.active
            ? 'COST_CODE_UPDATED'
            : 'COST_CODE_DEACTIVATED'
          : 'COST_CODE_CREATED',
        entity: 'CostCode',
        entityId: item.id,
        description: `${before ? 'updated' : 'created'} cost code ${item.code}`,
        before: before ? JSON.parse(JSON.stringify(before)) : Prisma.JsonNull,
        after: JSON.parse(JSON.stringify(item)),
      },
    });
    return item;
  });
}

export const costCodeImportSchema = z
  .object({
    csv: z.string().min(1).max(500000),
    commit: z.boolean().default(false),
    previewToken: z.string().optional(),
  })
  .strict();
type ImportedCode = {
  code: string;
  name: string;
  description: string | null;
  type: CostCodeType;
  active: boolean;
  parentCode: string | null;
  sortOrder: number;
  operation: 'create' | 'update';
};
export async function importCostCodes(actor: Actor, input: z.infer<typeof costCodeImportSchema>) {
  await requireCapability(actor, 'COST_CODE_MANAGE');
  let rows: Record<string, string>[];
  try {
    rows = parse(input.csv, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      max_record_size: 10000,
    });
  } catch {
    throw new AppError(400, 'CSV could not be read.');
  }
  ensure(rows.length > 0 && rows.length <= 2000, 'Import between 1 and 2,000 rows.');
  const errors: { row: number; message: string }[] = [],
    prepared: ImportedCode[] = [],
    seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    try {
      const code = (row.code || '').trim(),
        name = (row.name || row.description || '').trim();
      ensure(code && name, 'Code and name/description are required.');
      ensure(!seen.has(code), 'Duplicate code in file.');
      seen.add(code);
      const active = (row.active || 'true').toLowerCase();
      ensure(['true', 'false'].includes(active), 'Active must be true or false.');
      const validated = costCodeSchema.parse({
        code,
        name,
        description: row.description,
        type: (row.type || 'OTHER').toUpperCase(),
        active: active === 'true',
        sortOrder: row.sortOrder || 0,
      });
      const existing = await db.costCode.findUnique({ where: { code } });
      prepared.push({
        code,
        name,
        description: row.description && row.description !== name ? row.description : null,
        type: validated.type,
        active: validated.active,
        parentCode: row.parentCode || null,
        sortOrder: validated.sortOrder,
        operation: existing ? 'update' : 'create',
      });
    } catch (error) {
      errors.push({
        row: index + 2,
        message: error instanceof Error ? error.message : 'Invalid row.',
      });
    }
  }
  const previewToken = privateKey(`${actor.id}:cost-codes:${input.csv}`);
  if (!input.commit)
    return {
      rows: prepared,
      errors,
      previewToken,
      count: rows.length,
      creates: prepared.filter((x) => x.operation === 'create').length,
      updates: prepared.filter((x) => x.operation === 'update').length,
    };
  ensure(!errors.length, 'Fix all row errors before importing.');
  ensure(input.previewToken === previewToken, 'Preview this exact file before confirming import.');
  return transaction(async (tx) => {
    for (const row of prepared) {
      const parent = row.parentCode
        ? await tx.costCode.findUnique({ where: { code: row.parentCode } })
        : null;
      ensure(
        !row.parentCode || parent,
        `Parent code ${row.parentCode} must already exist or appear earlier.`,
      );
      let ancestor = parent;
      const visited = new Set<string>();
      while (ancestor) {
        ensure(
          ancestor.code !== row.code && !visited.has(ancestor.id),
          'Cost-code hierarchy cannot contain a cycle.',
        );
        visited.add(ancestor.id);
        ancestor = ancestor.parentId
          ? await tx.costCode.findUnique({ where: { id: ancestor.parentId } })
          : null;
      }
      const data = {
        name: row.name,
        description: row.description,
        type: row.type,
        active: row.active,
        parentId: parent?.id ?? null,
        sortOrder: row.sortOrder,
      };
      await tx.costCode.upsert({
        where: { code: row.code },
        create: { code: row.code, ...data },
        update: data,
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COST_CODE_IMPORTED',
        entity: 'CostCodeImport',
        entityId: crypto.randomUUID(),
        description: `imported ${prepared.length} cost codes`,
        metadata: {
          count: prepared.length,
          creates: prepared.filter((x) => x.operation === 'create').length,
          updates: prepared.filter((x) => x.operation === 'update').length,
        },
      },
    });
    return { ok: true, count: prepared.length };
  });
}
export const costCodeTemplate = 'code,name,description,type,parentCode,active,sortOrder\n';

export const financialSettingsSchema = z
  .object({
    taxRatePercent: z.coerce.number().min(0).max(100),
    estimatePrefix: z.string().trim().min(1).max(20),
    proposalPrefix: z.string().trim().min(1).max(20),
    legalName: z.string().trim().min(1).max(200),
    companyAddress: z.string().trim().max(1000),
    proposalTerms: z.string().trim().max(10000),
  })
  .strict();
export async function financialSettings(actor: Actor) {
  await requireCapability(actor, 'COST_CODE_VIEW');
  return db.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
}
export async function saveFinancialSettings(
  actor: Actor,
  input: z.infer<typeof financialSettingsSchema>,
) {
  await requireCapability(actor, 'COST_CODE_MANAGE');
  return transaction(async (tx) => {
    const before = await tx.settings.findUnique({ where: { id: 'company' } });
    const data = {
      taxRate: new Decimal(input.taxRatePercent).div(100),
      estimatePrefix: input.estimatePrefix,
      proposalPrefix: input.proposalPrefix,
      legalName: input.legalName,
      companyAddress: input.companyAddress,
      proposalTerms: input.proposalTerms,
    };
    const item = await tx.settings.upsert({ where: { id: 'company' }, create: data, update: data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'FINANCIAL_SETTINGS_UPDATED',
        entity: 'Settings',
        entityId: item.id,
        description: 'updated company financial settings',
        before: before ? JSON.parse(JSON.stringify(before)) : Prisma.JsonNull,
        after: JSON.parse(JSON.stringify(item)),
      },
    });
    return item;
  });
}

export const estimateSchema = z
  .object({ projectId: z.string(), name: z.string().trim().min(1).max(200), description: nullable })
  .strict();
export async function estimates(actor: Actor, projectId: string) {
  await requireCapability(actor, 'ESTIMATE_VIEW');
  await requireProjectAccess(actor, projectId);
  const items = await db.estimate.findMany({
    where: { projectId },
    include: {
      revisions: {
        orderBy: { revision: 'desc' },
        include: {
          sections: { orderBy: { sortOrder: 'asc' } },
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return items.map((estimate) => ({
    ...estimate,
    revisions: estimate.revisions.map((revision) => ({
      ...revision,
      totals: financialTotals(revision.lines, revision.taxRate),
      lines: revision.lines.map((line) => ({ ...line, amounts: lineAmounts(line) })),
    })),
  }));
}
export async function createEstimate(actor: Actor, input: z.infer<typeof estimateSchema>) {
  await requireCapability(actor, 'ESTIMATE_CREATE');
  await requireProjectAccess(actor, input.projectId);
  return transaction(async (tx) => {
    const settings = await tx.settings.upsert({
      where: { id: 'company' },
      create: {},
      update: { nextEstimateNumber: { increment: 1 } },
    });
    const number = `${settings.estimatePrefix}-${String(settings.nextEstimateNumber).padStart(4, '0')}`;
    const estimate = await tx.estimate.create({
      data: {
        projectId: input.projectId,
        estimateNumber: number,
        name: input.name,
        description: input.description,
        revisions: {
          create: {
            revision: 0,
            taxRate: settings.taxRate,
            createdById: actor.id,
            sections: { create: { name: 'General' } },
          },
        },
      },
      include: { revisions: true },
    });
    await publishProjectEvent(tx, {
      projectId: input.projectId,
      actorId: actor.id,
      action: 'ESTIMATE_CREATED',
      entity: 'Estimate',
      entityId: estimate.id,
      description: `created estimate ${number} Rev 0`,
    });
    return estimate;
  });
}

const decimalInput = (scale: number) =>
  z.coerce.string().refine((value) => {
    try {
      const amount = new Decimal(value);
      return (
        amount.isFinite() &&
        amount.decimalPlaces() <= scale &&
        amount.abs().lt(new Decimal(10).pow(18 - scale))
      );
    } catch {
      return false;
    }
  }, `Enter a valid amount with at most ${scale} decimal places.`);

const nonnegativeDecimal = decimalInput(4).refine((value) => {
  try {
    return new Decimal(value).gte(0);
  } catch {
    return false;
  }
}, 'Amount cannot be negative.');

export const estimateLineSchema = z
  .object({
    id: z.string().optional(),
    revisionId: z.string(),
    sectionId: z.string(),
    costCodeId: z.string(),
    costType: z.enum(CostCodeType),
    description: z.string().trim().min(1).max(500),
    clientDescription: nullable,
    quantity: nonnegativeDecimal,
    unit: z.string().trim().min(1).max(20),
    unitCost: nonnegativeDecimal,
    markupMethod: z.enum(MarkupMethod),
    markupValue: nonnegativeDecimal,
    taxable: z.boolean(),
    optional: z.boolean(),
    allowance: z.boolean(),
    included: z.boolean(),
    sortOrder: z.coerce.number().int().min(0),
    expectedVersion: z.coerce.number().int().positive(),
  })
  .strict();
export async function saveEstimateLine(actor: Actor, input: z.infer<typeof estimateLineSchema>) {
  await requireCapability(actor, 'ESTIMATE_EDIT');
  return transaction(async (tx) => {
    const revision = await tx.estimateRevision.findUnique({
      where: { id: input.revisionId },
      include: { estimate: true },
    });
    ensure(revision, 'Estimate revision not found.', 404);
    await requireProjectAccess(actor, revision.estimate.projectId, tx);
    ensure(
      ['DRAFT', 'INTERNAL_REVIEW'].includes(revision.status),
      'Create a new revision to change locked pricing.',
      409,
    );
    ensure(
      revision.version === input.expectedVersion,
      'Estimate changed. Refresh before saving.',
      409,
    );
    const code = await tx.costCode.findUnique({ where: { id: input.costCodeId } });
    ensure(code?.active, 'Active cost code not found.');
    ensure(
      await tx.estimateSection.findFirst({
        where: { id: input.sectionId, revisionId: revision.id },
      }),
      'Estimate section not found.',
    );
    const data = {
      revisionId: revision.id,
      sectionId: input.sectionId,
      costCodeId: code.id,
      costCodeSnapshot: code.code,
      costCodeNameSnapshot: code.name,
      costType: input.costType,
      description: input.description,
      clientDescription: input.clientDescription,
      quantity: new Decimal(input.quantity),
      unit: input.unit,
      unitCost: new Decimal(input.unitCost),
      markupMethod: input.markupMethod,
      markupValue: new Decimal(input.markupValue),
      taxable: input.taxable,
      optional: input.optional,
      allowance: input.allowance,
      included: input.included,
      sortOrder: input.sortOrder,
    };
    if (input.id)
      ensure(
        await tx.estimateLine.findFirst({ where: { id: input.id, revisionId: revision.id } }),
        'Estimate line not found.',
        404,
      );
    const line = input.id
      ? await tx.estimateLine.update({ where: { id: input.id }, data })
      : await tx.estimateLine.create({ data });
    await tx.estimateRevision.update({
      where: { id: revision.id },
      data: { version: { increment: 1 } },
    });
    await publishProjectEvent(tx, {
      projectId: revision.estimate.projectId,
      actorId: actor.id,
      action: 'ESTIMATE_PRICING_CHANGED',
      entity: 'EstimateRevision',
      entityId: revision.id,
      description: `updated pricing in ${revision.estimate.estimateNumber} Rev ${revision.revision}`,
    });
    return line;
  });
}
export async function createEstimateRevision(actor: Actor, id: string) {
  await requireCapability(actor, 'ESTIMATE_EDIT');
  return transaction(async (tx) => {
    const source = await tx.estimateRevision.findUnique({
      where: { id },
      include: { estimate: true, sections: { include: { lines: true } } },
    });
    ensure(source, 'Estimate revision not found.', 404);
    await requireProjectAccess(actor, source.estimate.projectId, tx);
    const latest = await tx.estimateRevision.aggregate({
        where: { estimateId: source.estimateId },
        _max: { revision: true },
      }),
      revision = (latest._max.revision ?? -1) + 1;
    const created = await tx.estimateRevision.create({
      data: {
        estimateId: source.estimateId,
        revision,
        taxRate: source.taxRate,
        validUntil: source.validUntil,
        notes: source.notes,
        internalNotes: source.internalNotes,
        createdById: actor.id,
      },
    });
    for (const section of source.sections) {
      const copy = await tx.estimateSection.create({
        data: {
          revisionId: created.id,
          name: section.name,
          description: section.description,
          sortOrder: section.sortOrder,
          showSubtotal: section.showSubtotal,
        },
      });
      await tx.estimateLine.createMany({
        data: section.lines.map((line) => ({
          revisionId: created.id,
          sectionId: copy.id,
          costCodeId: line.costCodeId,
          costCodeSnapshot: line.costCodeSnapshot,
          costCodeNameSnapshot: line.costCodeNameSnapshot,
          costType: line.costType,
          description: line.description,
          clientDescription: line.clientDescription,
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          markupMethod: line.markupMethod,
          markupValue: line.markupValue,
          taxable: line.taxable,
          optional: line.optional,
          allowance: line.allowance,
          included: line.included,
          sortOrder: line.sortOrder,
          internalNotes: line.internalNotes,
        })),
      });
    }
    if (source.status !== 'ACCEPTED')
      await tx.estimateRevision.update({
        where: { id: source.id },
        data: { status: 'SUPERSEDED' },
      });
    await publishProjectEvent(tx, {
      projectId: source.estimate.projectId,
      actorId: actor.id,
      action: 'ESTIMATE_REVISION_CREATED',
      entity: 'EstimateRevision',
      entityId: created.id,
      description: `created ${source.estimate.estimateNumber} Rev ${revision}`,
    });
    return created;
  });
}

export const proposalSchema = z
  .object({
    estimateRevisionId: z.string(),
    clientId: z
      .string()
      .nullish()
      .transform((v) => v || null),
    title: z.string().trim().min(1).max(200),
    introduction: nullable,
    scope: nullable,
    exclusions: nullable,
    assumptions: nullable,
    terms: nullable,
    expiryDate: z.iso
      .date()
      .nullish()
      .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null)),
  })
  .strict();
export async function createProposal(actor: Actor, input: z.infer<typeof proposalSchema>) {
  await requireCapability(actor, 'PROPOSAL_CREATE');
  return transaction(async (tx) => {
    const source = await tx.estimateRevision.findUnique({
      where: { id: input.estimateRevisionId },
      include: {
        estimate: { include: { project: true } },
        sections: {
          include: { lines: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    ensure(source, 'Estimate revision not found.', 404);
    await requireProjectAccess(actor, source.estimate.projectId, tx);
    const client = input.clientId
        ? await tx.contact.findFirst({
            where: {
              id: input.clientId,
              projects: { some: { projectId: source.estimate.projectId, role: 'CLIENT' } },
            },
            include: { company: true },
          })
        : null,
      settings = await tx.settings.upsert({
        where: { id: 'company' },
        create: {},
        update: { nextProposalNumber: { increment: 1 } },
      }),
      number = `${settings.proposalPrefix}-${String(settings.nextProposalNumber).padStart(4, '0')}`,
      all = source.sections.flatMap((x) => x.lines),
      totals = financialTotals(all, source.taxRate),
      sections = source.sections.map((section) => ({
        name: section.name,
        description: section.description,
        showSubtotal: section.showSubtotal,
        lines: section.lines
          .filter((x) => x.included)
          .map((line) => ({
            description: line.clientDescription || line.description,
            quantity: line.quantity.toString(),
            unit: line.unit,
            price: lineAmounts(line).price.toFixed(2),
            taxable: line.taxable,
            optional: line.optional,
            allowance: line.allowance,
          })),
      }));
    ensure(!input.clientId || client, 'The selected client is not associated with this project.');
    const proposal = await tx.proposal.create({
      data: {
        projectId: source.estimate.projectId,
        proposalNumber: number,
        title: input.title,
        revisions: {
          create: {
            estimateRevisionId: source.id,
            revision: 0,
            expiryDate: input.expiryDate,
            introduction: input.introduction,
            scope: input.scope,
            exclusions: input.exclusions,
            assumptions: input.assumptions,
            terms: input.terms || settings.proposalTerms,
            clientId: client?.id,
            clientNameSnapshot: client
              ? `${client.firstName} ${client.lastName}${client.company ? ` — ${client.company.name}` : ''}`
              : 'Client',
            projectNameSnapshot: source.estimate.project.name,
            projectNumberSnapshot: source.estimate.project.number,
            companySnapshot: { legalName: settings.legalName, address: settings.companyAddress },
            sectionsSnapshot: sections,
            subtotal: totals.price,
            taxRate: source.taxRate,
            taxAmount: totals.tax,
            total: totals.total,
            createdById: actor.id,
          },
        },
      },
      include: { revisions: true },
    });
    if (['DRAFT', 'INTERNAL_REVIEW'].includes(source.status))
      await tx.estimateRevision.update({
        where: { id: source.id },
        data: { status: 'READY', version: { increment: 1 } },
      });
    await publishProjectEvent(tx, {
      projectId: source.estimate.projectId,
      actorId: actor.id,
      action: 'PROPOSAL_CREATED',
      entity: 'Proposal',
      entityId: proposal.id,
      description: `created proposal ${number} Rev 0`,
    });
    return proposal;
  });
}
export async function proposals(actor: Actor, projectId: string) {
  await requireCapability(actor, 'PROPOSAL_VIEW');
  await requireProjectAccess(actor, projectId);
  return db.proposal.findMany({
    where: { projectId },
    include: { revisions: { orderBy: { revision: 'desc' } } },
    orderBy: { updatedAt: 'desc' },
  });
}
export async function createProposalRevision(actor: Actor, id: string) {
  await requireCapability(actor, 'PROPOSAL_CREATE');
  return transaction(async (tx) => {
    const source = await tx.proposalRevision.findUnique({
      where: { id },
      include: { proposal: true },
    });
    ensure(source, 'Proposal revision not found.', 404);
    await requireProjectAccess(actor, source.proposal.projectId, tx);
    const latest = await tx.proposalRevision.aggregate({
      where: { proposalId: source.proposalId },
      _max: { revision: true },
    });
    const revision = (latest._max.revision ?? -1) + 1;
    const created = await tx.proposalRevision.create({
      data: {
        proposalId: source.proposalId,
        estimateRevisionId: source.estimateRevisionId,
        revision,
        status: 'DRAFT',
        expiryDate: source.expiryDate,
        introduction: source.introduction,
        scope: source.scope,
        exclusions: source.exclusions,
        assumptions: source.assumptions,
        terms: source.terms,
        clientId: source.clientId,
        clientNameSnapshot: source.clientNameSnapshot,
        projectNameSnapshot: source.projectNameSnapshot,
        projectNumberSnapshot: source.projectNumberSnapshot,
        companySnapshot: source.companySnapshot ?? Prisma.JsonNull,
        sectionsSnapshot: source.sectionsSnapshot ?? Prisma.JsonNull,
        subtotal: source.subtotal,
        taxRate: source.taxRate,
        taxAmount: source.taxAmount,
        total: source.total,
        createdById: actor.id,
      },
    });
    if (source.status !== 'ACCEPTED')
      await tx.proposalRevision.update({
        where: { id: source.id },
        data: { status: 'SUPERSEDED' },
      });
    await publishProjectEvent(tx, {
      projectId: source.proposal.projectId,
      actorId: actor.id,
      action: 'PROPOSAL_REVISION_CREATED',
      entity: 'ProposalRevision',
      entityId: created.id,
      description: `created ${source.proposal.proposalNumber} Rev ${revision}`,
    });
    return created;
  });
}
export async function proposalAction(actor: Actor, id: string, action: 'issue' | 'accept') {
  await requireCapability(actor, action === 'issue' ? 'PROPOSAL_ISSUE' : 'PROPOSAL_ACCEPT');
  return transaction(async (tx) => {
    const item = await tx.proposalRevision.findUnique({
      where: { id },
      include: { proposal: true },
    });
    ensure(item, 'Proposal not found.', 404);
    await requireProjectAccess(actor, item.proposal.projectId, tx);
    if (action === 'issue') {
      ensure(item.status === 'DRAFT', 'Only a draft can be issued.');
      const updated = await tx.proposalRevision.update({
        where: { id },
        data: { status: 'ISSUED', issueDate: new Date() },
      });
      await publishProjectEvent(tx, {
        projectId: item.proposal.projectId,
        actorId: actor.id,
        action: 'PROPOSAL_ISSUED',
        entity: 'ProposalRevision',
        entityId: id,
        description: `issued ${item.proposal.proposalNumber} Rev ${item.revision}`,
      });
      return updated;
    }
    ensure(item.status === 'ISSUED', 'Only an issued proposal can be accepted.');
    const updated = await tx.proposalRevision.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedById: actor.id,
        acceptedByName: `${actor.firstName} ${actor.lastName}`,
      },
    });
    await tx.estimateRevision.update({
      where: { id: item.estimateRevisionId },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    await publishProjectEvent(tx, {
      projectId: item.proposal.projectId,
      actorId: actor.id,
      action: 'PROPOSAL_ACCEPTED',
      entity: 'ProposalRevision',
      entityId: id,
      description: `accepted ${item.proposal.proposalNumber} Rev ${item.revision}`,
    });
    return updated;
  });
}

export async function createBudget(actor: Actor, proposalRevisionId: string) {
  await requireCapability(actor, 'BUDGET_EDIT');
  return transaction(async (tx) => {
    const proposal = await tx.proposalRevision.findUnique({
      where: { id: proposalRevisionId },
      include: { proposal: true, estimateRevision: { include: { lines: true } } },
    });
    ensure(proposal?.status === 'ACCEPTED', 'An accepted proposal is required.');
    await requireProjectAccess(actor, proposal.proposal.projectId, tx);
    ensure(
      !(await tx.budget.findFirst({ where: { proposalRevisionId } })),
      'A budget already exists for this proposal.',
      409,
    );
    const grouped = new Map<
      string,
      {
        costCodeId: string;
        code: string;
        name: string;
        costType: CostCodeType;
        amount: Prisma.Decimal;
      }
    >();
    for (const line of proposal.estimateRevision.lines.filter((x) => x.included)) {
      const key = `${line.costCodeId}:${line.costType}`,
        old = grouped.get(key),
        amount = lineAmounts(line).cost;
      grouped.set(key, {
        costCodeId: line.costCodeId,
        code: line.costCodeSnapshot,
        name: line.costCodeNameSnapshot,
        costType: line.costType,
        amount: money((old?.amount || new Decimal(0)).add(amount)),
      });
    }
    const lines = [...grouped.values()],
      lineData = () =>
        lines.map((x) => ({
          costCodeId: x.costCodeId,
          costCodeSnapshot: x.code,
          costCodeNameSnapshot: x.name,
          costType: x.costType,
          description: x.name,
          amount: x.amount,
        }));
    const budget = await tx.budget.create({
      data: {
        projectId: proposal.proposal.projectId,
        estimateRevisionId: proposal.estimateRevisionId,
        proposalRevisionId: proposal.id,
        name: `Original budget — ${proposal.proposal.proposalNumber}`,
        versions: {
          create: [
            {
              version: 1,
              type: 'ORIGINAL',
              description: 'Approved estimate cost snapshot',
              createdById: actor.id,
              lines: { create: lineData() },
            },
            {
              version: 2,
              type: 'CURRENT',
              description: 'Initial current budget',
              createdById: actor.id,
              lines: { create: lineData() },
            },
          ],
        },
      },
    });
    await publishProjectEvent(tx, {
      projectId: proposal.proposal.projectId,
      actorId: actor.id,
      action: 'BUDGET_CREATED',
      entity: 'Budget',
      entityId: budget.id,
      description: 'created the original project budget',
    });
    return budget;
  });
}

export async function jobCost(actor: Actor, projectId: string) {
  await requireCapability(actor, 'JOB_COST_VIEW');
  await requireProjectAccess(actor, projectId);
  const [budget, commitments, actuals, adjustments, project] = await Promise.all([
      db.budget.findFirst({
        where: { projectId, active: true },
        include: { versions: { include: { lines: true }, orderBy: { version: 'asc' } } },
      }),
      db.commitmentLine.findMany({
        where: {
          commitment: {
            projectId,
            status: { in: ['COMMITTED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
          },
        },
        include: { costCode: true },
      }),
      db.actualCost.findMany({
        where: { projectId, reversedAt: null },
        include: { costCode: true },
      }),
      db.forecastAdjustment.findMany({ where: { projectId }, include: { costCode: true } }),
      db.project.findUnique({ where: { id: projectId }, select: { contractAmount: true } }),
    ]),
    original = budget?.versions.find((x) => x.type === 'ORIGINAL'),
    current = [...(budget?.versions || [])].reverse().find((x) => x.type !== 'ORIGINAL'),
    rows = new Map<
      string,
      {
        costCodeId: string;
        code: string;
        name: string;
        type: CostCodeType;
        original: Prisma.Decimal;
        current: Prisma.Decimal;
        committed: Prisma.Decimal;
        actual: Prisma.Decimal;
        adjustment: Prisma.Decimal;
      }
    >(),
    row = (id: string, code: string, name: string, type: CostCodeType) => {
      const key = `${id}:${type}`;
      if (!rows.has(key))
        rows.set(key, {
          costCodeId: id,
          code,
          name,
          type,
          original: new Decimal(0),
          current: new Decimal(0),
          committed: new Decimal(0),
          actual: new Decimal(0),
          adjustment: new Decimal(0),
        });
      return rows.get(key)!;
    };
  for (const x of original?.lines || []) {
    const r = row(x.costCodeId, x.costCodeSnapshot, x.costCodeNameSnapshot, x.costType);
    r.original = r.original.add(x.amount);
  }
  for (const x of current?.lines || []) {
    const r = row(x.costCodeId, x.costCodeSnapshot, x.costCodeNameSnapshot, x.costType);
    r.current = r.current.add(x.amount);
  }
  for (const x of commitments) {
    const r = row(x.costCodeId, x.costCode.code, x.costCode.name, x.costType);
    r.committed = r.committed.add(Decimal.max(0, x.committedAmount.sub(x.consumedAmount)));
  }
  for (const x of actuals) {
    const r = row(x.costCodeId, x.costCode.code, x.costCode.name, x.costType);
    r.actual = r.actual.add(x.amount);
  }
  for (const x of adjustments) {
    const r = row(x.costCodeId, x.costCode.code, x.costCode.name, x.costType);
    r.adjustment = r.adjustment.add(x.amount);
  }
  const result = [...rows.values()].map((x) => {
      const forecast = money(Decimal.max(x.current, x.actual.add(x.committed).add(x.adjustment)));
      return {
        ...x,
        original: money(x.original),
        current: money(x.current),
        committed: money(x.committed),
        actual: money(x.actual),
        forecast,
        variance: money(x.current.sub(forecast)),
      };
    }),
    sum = (field: 'original' | 'current' | 'committed' | 'actual' | 'forecast' | 'variance') =>
      money(result.reduce((total, item) => total.add(item[field]), new Decimal(0))),
    totals = {
      original: sum('original'),
      current: sum('current'),
      committed: sum('committed'),
      actual: sum('actual'),
      forecast: sum('forecast'),
      variance: sum('variance'),
    },
    contract = money(project?.contractAmount || 0),
    profit = money(contract.sub(totals.forecast)),
    showMargin = await can(actor, 'FINANCIAL_MARGIN_VIEW');
  return {
    rows: result,
    totals,
    summary: {
      contract,
      forecastProfit: showMargin ? profit : null,
      forecastMargin: showMargin
        ? contract.eq(0)
          ? new Decimal(0)
          : profit.div(contract).mul(100).toDecimalPlaces(2)
        : null,
    },
  };
}

export const actualCostSchema = z
  .object({
    projectId: z.string(),
    costCodeId: z.string(),
    costType: z.enum(CostCodeType),
    amount: decimalInput(2).refine((value) => {
      try {
        return !new Decimal(value).eq(0);
      } catch {
        return false;
      }
    }, 'Amount cannot be zero.'),
    transactionDate: z.iso.date(),
    description: z.string().trim().min(3).max(500),
  })
  .strict();
export async function createActualCost(actor: Actor, input: z.infer<typeof actualCostSchema>) {
  await requireCapability(actor, 'ACTUAL_COST_MANAGE');
  await requireProjectAccess(actor, input.projectId);
  return transaction(async (tx) => {
    ensure(
      await tx.costCode.findFirst({ where: { id: input.costCodeId, active: true } }),
      'Active cost code not found.',
    );
    const item = await tx.actualCost.create({
      data: {
        projectId: input.projectId,
        costCodeId: input.costCodeId,
        costType: input.costType,
        amount: money(input.amount),
        transactionDate: new Date(`${input.transactionDate}T00:00:00Z`),
        sourceType: 'MANUAL',
        description: input.description,
        createdById: actor.id,
      },
    });
    await publishProjectEvent(tx, {
      projectId: input.projectId,
      actorId: actor.id,
      action: 'MANUAL_ACTUAL_COST_CREATED',
      entity: 'ActualCost',
      entityId: item.id,
      description: 'recorded a manual actual cost',
    });
    return item;
  });
}
