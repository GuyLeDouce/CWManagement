import { z } from 'zod';
import { CompanyTemplateKind } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { db, transaction, audit, json, Tx } from './db';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { ensure } from './errors';
import {
  templateSchema,
  catalogSchema,
  standardContent,
  standardLine,
  relativeSchedule,
  assemblyQuantity,
  StandardContent,
} from './standards-schema';
import { publishProjectEvent } from './activity';
import { lineAmounts } from './financial-math';

async function validateContent(tx: Tx, content: StandardContent) {
  relativeSchedule(content.tasks, '2026-01-01');
  const lines = [...content.lines, ...content.selections.flatMap((s) => s.options)];
  const codes = [...new Set(lines.map((l) => l.costCodeId))];
  ensure(
    (await tx.costCode.count({ where: { id: { in: codes }, active: true } })) === codes.length,
    'A cost code is missing or inactive. Update the company standard before using it.',
  );
}
export async function library(actor: Actor, kind?: string) {
  await requireCapability(actor, 'TEMPLATE_VIEW');
  return db.companyTemplate.findMany({
    where: kind ? { kind: z.enum(CompanyTemplateKind).parse(kind) } : {},
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
}
export async function saveTemplate(actor: Actor, input: z.infer<typeof templateSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'TEMPLATE_MANAGE', tx);
    const before = input.id
      ? await tx.companyTemplate.findUnique({ where: { id: input.id } })
      : null;
    if (input.id)
      ensure(
        before && before.version === input.expectedVersion,
        'This template changed. Reload before saving.',
        409,
      );
    let content = input.content;
    if (content.references.length) {
      ensure(input.kind === 'PROJECT', 'Only project templates can bundle other templates.');
      const references = await tx.companyTemplate.findMany({
        where: { id: { in: content.references }, active: true, kind: { not: 'PROJECT' } },
      });
      ensure(
        references.length === new Set(content.references).size,
        'Choose active, non-project templates.',
      );
      for (const reference of references) {
        const c = standardContent.parse(reference.content);
        content = {
          ...content,
          lines: [...content.lines, ...c.lines],
          tasks: [...content.tasks, ...c.tasks],
          selections: [...content.selections, ...c.selections],
          specifications: [...content.specifications, ...c.specifications],
          teamRoles: [...new Set([...content.teamRoles, ...c.teamRoles])],
          folders: [...content.folders, ...c.folders],
          introduction: content.introduction || c.introduction,
          scope: content.scope || c.scope,
          exclusions: content.exclusions || c.exclusions,
          assumptions: content.assumptions || c.assumptions,
          terms: content.terms || c.terms,
        };
      }
      content = standardContent.parse({ ...content, references: [] });
    }
    await validateContent(tx, content);
    const data = {
      kind: input.kind,
      name: input.name,
      description: input.description,
      active: input.active,
      content: json(content),
    };
    const saved = before
      ? await tx.companyTemplate.update({
          where: { id: before.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.companyTemplate.create({ data: { ...data, createdById: actor.id } });
    await audit(tx, actor.id, 'COMPANY_TEMPLATE_SAVED', 'CompanyTemplate', saved.id, before, saved);
    return saved;
  });
}
export async function catalog(actor: Actor, query = '') {
  await requireCapability(actor, 'COST_CATALOG_VIEW');
  return db.costCatalogItem.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    include: { costCode: { select: { code: true, name: true } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    take: 500,
  });
}
async function writeCatalog(tx: Tx, actor: Actor, input: z.infer<typeof catalogSchema>) {
  await requireCapability(actor, 'COST_CATALOG_MANAGE', tx);
  ensure(
    await tx.costCode.findFirst({ where: { id: input.costCodeId, active: true } }),
    'Choose an active cost code.',
  );
  if (input.vendorContactId)
    ensure(
      await tx.contact.findFirst({
        where: {
          id: input.vendorContactId,
          active: true,
          types: { hasSome: ['VENDOR', 'SUBTRADE'] },
        },
      }),
      'Choose an active supplier or subcontractor.',
    );
  const { id, expectedVersion, ...data } = input;
  const before = id ? await tx.costCatalogItem.findUnique({ where: { id } }) : null;
  if (id)
    ensure(before?.version === expectedVersion, 'Catalog item changed. Reload before saving.', 409);
  const saved = id
    ? await tx.costCatalogItem.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      })
    : await tx.costCatalogItem.create({ data });
  await audit(tx, actor.id, 'COST_CATALOG_SAVED', 'CostCatalogItem', saved.id, before, saved);
  return saved;
}
export const saveCatalog = (actor: Actor, input: z.infer<typeof catalogSchema>) =>
  transaction((tx) => writeCatalog(tx, actor, input));
export const catalogBulkSchema = z
  .object({
    items: z
      .array(z.object({ id: z.string(), version: z.number().int().positive() }))
      .min(1)
      .max(100),
    factor: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/),
    active: z.boolean().optional(),
  })
  .strict();
export async function bulkCatalog(actor: Actor, input: z.infer<typeof catalogBulkSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'COST_CATALOG_MANAGE', tx);
    for (const selected of input.items) {
      const item = await tx.costCatalogItem.findUnique({ where: { id: selected.id } });
      ensure(
        item && item.version === selected.version,
        'A selected catalog item changed. Reload before bulk editing.',
        409,
      );
      const {
        id,
        name,
        description,
        costCodeId,
        costType,
        unit,
        markupMethod,
        taxable,
        vendorContactId,
        category,
        notes,
        source,
      } = item;
      await writeCatalog(
        tx,
        actor,
        catalogSchema.parse({
          id,
          expectedVersion: selected.version,
          name,
          description,
          costCodeId,
          costType,
          unit,
          markupMethod,
          markupValue: String(item.markupValue),
          unitCost: assemblyQuantity(input.factor, String(item.unitCost)),
          taxable,
          vendorContactId,
          category,
          notes,
          source,
          active: input.active ?? item.active,
        }),
      );
    }
    return { updated: input.items.length };
  });
}
export async function catalogFromLine(actor: Actor, lineId: string) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'COST_CATALOG_MANAGE', tx);
    await requireCapability(actor, 'ESTIMATE_VIEW', tx);
    const l = await tx.estimateLine.findUnique({
      where: { id: lineId },
      include: { revision: { include: { estimate: true } } },
    });
    ensure(l, 'Estimate item not found.', 404);
    await requireProjectAccess(actor, l.revision.estimate.projectId, tx);
    return writeCatalog(
      tx,
      actor,
      catalogSchema.parse({
        name: l.description,
        description: l.clientDescription || '',
        costCodeId: l.costCodeId,
        costType: l.costType,
        unit: l.unit,
        unitCost: String(l.unitCost),
        markupMethod: l.markupMethod,
        markupValue: String(l.markupValue),
        taxable: l.taxable,
        source: 'Saved from estimate',
      }),
    );
  });
}
export async function selectionsFromEstimate(actor: Actor, projectId: string) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'SELECTION_CREATE', tx);
    await requireCapability(actor, 'ESTIMATE_VIEW', tx);
    await requireProjectAccess(actor, projectId, tx);
    const lines = await tx.estimateLine.findMany({
      where: {
        allowance: true,
        included: true,
        allowanceRecord: null,
        revision: { estimate: { projectId }, proposalRevisions: { some: { status: 'ACCEPTED' } } },
      },
    });
    for (const line of lines) {
      const amounts = lineAmounts(line);
      await tx.allowance.create({
        data: {
          projectId,
          name: line.clientDescription || line.description,
          costCodeId: line.costCodeId,
          costType: line.costType,
          amount: amounts.price,
          includedCost: amounts.cost,
          taxable: line.taxable,
          estimateLineId: line.id,
          selection: {
            create: {
              projectId,
              title: line.clientDescription || line.description,
              category: 'Contract allowances',
              createdById: actor.id,
            },
          },
        },
      });
    }
    if (lines.length)
      await publishProjectEvent(tx, {
        projectId,
        actorId: actor.id,
        entity: 'Project',
        entityId: projectId,
        action: 'ALLOWANCE_SELECTIONS_CREATED',
        description: `Created ${lines.length} draft selections from accepted estimate allowances.`,
      });
    return {
      created: lines.length,
      message: lines.length
        ? `${lines.length} draft selections created.`
        : 'No unlinked allowances on accepted estimates. Accept the proposal first.',
    };
  });
}
export const catalogCsv =
  'name,description,costCode,costType,unit,unitCost,markupMethod,markupValue,category,taxable\n';
export async function previewTemplateCsv(
  actor: Actor,
  input: { kind: 'ESTIMATE' | 'SCHEDULE' | 'SELECTION'; csv: string },
) {
  await requireCapability(actor, 'TEMPLATE_MANAGE');
  ensure(Buffer.byteLength(input.csv, 'utf8') <= 100000, 'Limit each import to 100 KB.');
  let rows: Record<string, string>[];
  try {
    rows = parse(input.csv, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    throw new Error('CSV could not be read. Check headings and quoted values.');
  }
  ensure(rows.length > 0 && rows.length <= 500, 'Import between 1 and 500 rows.');
  const codes = await db.costCode.findMany({ where: { active: true } }),
    content = standardContent.parse({}),
    errors: { row: number; message: string }[] = [];
  rows.forEach((r, i) => {
    try {
      if (input.kind === 'ESTIMATE') {
        const { costCode, ...data } = r;
        const converted: Record<string, unknown> = {
          ...data,
          costCodeId: codes.find((c) => c.code === costCode)?.id,
        };
        for (const k of ['taxable', 'optional', 'allowance'])
          if (k in data) {
            ensure(['true', 'false'].includes(data[k]), `${k} must be true or false.`);
            converted[k] = data[k] === 'true';
          }
        content.lines.push(standardLine.parse(converted));
      } else if (input.kind === 'SCHEDULE') {
        const converted: Record<string, unknown> = { ...r };
        for (const k of ['offsetDays', 'durationDays', 'lagDays'])
          if (k in r) converted[k] = Number(r[k]);
        if ('milestone' in r) {
          ensure(['true', 'false'].includes(r.milestone), 'Milestone must be true or false.');
          converted.milestone = r.milestone === 'true';
        }
        content.tasks.push(standardContent.shape.tasks.unwrap().element.parse(converted));
      } else {
        const converted: Record<string, unknown> = { ...r };
        if ('deadlineOffset' in r) converted.deadlineOffset = Number(r.deadlineOffset);
        if ('required' in r) {
          ensure(['true', 'false'].includes(r.required), 'Required must be true or false.');
          converted.required = r.required === 'true';
        }
        content.selections.push(standardContent.shape.selections.unwrap().element.parse(converted));
      }
    } catch (e) {
      errors.push({
        row: i + 2,
        message:
          e instanceof z.ZodError
            ? e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join(';')
            : e instanceof Error
              ? e.message
              : 'Invalid row.',
      });
    }
  });
  if (!errors.length)
    try {
      relativeSchedule(content.tasks, '2026-01-01');
    } catch (e) {
      errors.push({
        row: 0,
        message: e instanceof Error ? e.message : 'Schedule dependencies are invalid.',
      });
    }
  return { content, errors };
}
export async function importCatalog(actor: Actor, input: { csv: string; commit: boolean }) {
  await requireCapability(actor, 'COST_CATALOG_MANAGE');
  ensure(Buffer.byteLength(input.csv, 'utf8') <= 100000, 'Limit each import to 100 KB.');
  let rows: Record<string, string>[];
  try {
    rows = parse(input.csv, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    throw new Error('CSV could not be read. Check headings and quoted values.');
  }
  ensure(rows.length > 0 && rows.length <= 500, 'Import between 1 and 500 rows.');
  const codes = await db.costCode.findMany({ where: { active: true } });
  const errors: { row: number; message: string }[] = [];
  const items: z.infer<typeof catalogSchema>[] = [];
  rows.forEach((r, i) => {
    const code = codes.find((c) => c.code === r.costCode);
    // Strip the CSV lookup column before strict domain validation.
    const { costCode: _, ...raw } = r;
    void _;
    const p = catalogSchema.safeParse({
      ...raw,
      costCodeId: code?.id,
      taxable: r.taxable ? r.taxable === 'true' : true,
    });
    if (!['', 'true', 'false', undefined].includes(r.taxable))
      errors.push({ row: i + 2, message: 'Taxable must be true or false.' });
    else if (!p.success)
      errors.push({
        row: i + 2,
        message: code
          ? p.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join(';')
          : 'Cost code is missing or inactive.',
      });
    else items.push(p.data);
  });
  if (input.commit) {
    ensure(!errors.length, 'Fix all preview errors before importing.');
    await transaction(async (tx) => {
      for (const item of items) await writeCatalog(tx, actor, item);
    });
  }
  return { items, errors, imported: input.commit ? items.length : 0 };
}

export const applySchema = z
  .object({
    projectId: z.string(),
    templateId: z.string(),
    expectedVersion: z.number().int().positive(),
    requestKey: z.string().min(16).max(100),
    startDate: z.iso.date(),
    revisionId: z.string().optional(),
    revisionVersion: z.number().int().positive().optional(),
    lineIndexes: z.array(z.number().int().min(0)).optional(),
    baseQuantity: z.string().default('1'),
  })
  .strict();
export async function applyContent(
  tx: Tx,
  actor: Actor,
  projectId: string,
  content: StandardContent,
  input: {
    startDate: string;
    revisionId?: string;
    revisionVersion?: number;
    baseQuantity?: string;
  },
) {
  await validateContent(tx, content);
  if (content.specifications.length) {
    await requireCapability(actor, 'SELECTION_CREATE', tx);
    await tx.projectSpecification.createMany({
      data: content.specifications.map((s) => ({ ...s, projectId })),
    });
  }
  let revisionId = input.revisionId;
  if (content.lines.length) {
    await requireCapability(actor, 'ESTIMATE_EDIT', tx);
    if (!revisionId) {
      await requireCapability(actor, 'ESTIMATE_CREATE', tx);
      const settings = await tx.settings.update({
        where: { id: 'company' },
        data: { nextEstimateNumber: { increment: 1 } },
      });
      const estimate = await tx.estimate.create({
        data: {
          projectId,
          estimateNumber: `${settings.estimatePrefix}-${String(settings.nextEstimateNumber).padStart(4, '0')}`,
          name: 'Project estimate',
          revisions: { create: { revision: 0, taxRate: settings.taxRate, createdById: actor.id } },
        },
        include: { revisions: true },
      });
      revisionId = estimate.revisions[0].id;
    } else {
      const revision = await tx.estimateRevision.findFirst({
        where: { id: revisionId, estimate: { projectId } },
      });
      ensure(
        revision &&
          ['DRAFT', 'INTERNAL_REVIEW'].includes(revision.status) &&
          revision.version === input.revisionVersion,
        'Estimate changed or pricing is locked. Reload or create a revision.',
        409,
      );
    }
    const sections = await tx.estimateSection.findMany({ where: { revisionId } });
    let order = await tx.estimateLine.count({ where: { revisionId } });
    for (const line of content.lines) {
      let section = sections.find((s) => s.name === line.section);
      if (!section) {
        section = await tx.estimateSection.create({
          data: { revisionId, name: line.section, sortOrder: sections.length },
        });
        sections.push(section);
      }
      const code = await tx.costCode.findUniqueOrThrow({ where: { id: line.costCodeId } });
      const { section: _, catalogId: __, ...fields } = line;
      void _;
      void __;
      await tx.estimateLine.create({
        data: {
          ...fields,
          quantity: assemblyQuantity(input.baseQuantity || '1', line.quantity),
          revisionId,
          sectionId: section.id,
          costCodeSnapshot: code.code,
          costCodeNameSnapshot: code.name,
          sortOrder: order++,
        },
      });
    }
    await tx.estimateRevision.update({
      where: { id: revisionId },
      data: { version: { increment: 1 } },
    });
  }
  if (content.tasks.length) {
    await requireCapability(actor, 'PROJECT_SCHEDULE_EDIT', tx);
    const ids = new Map<string, string>();
    const offset = await tx.projectTask.count({ where: { projectId } });
    for (const [i, task] of relativeSchedule(content.tasks, input.startDate).entries()) {
      const saved = await tx.projectTask.create({
        data: {
          projectId,
          name: task.name,
          description: [task.phase, task.description].filter(Boolean).join('\n'),
          startDate: task.startDate,
          endDate: task.endDate,
          milestone: task.milestone,
          sortOrder: offset + i,
          createdById: actor.id,
        },
      });
      ids.set(task.key, saved.id);
      if (task.assigneeRole) {
        const assigned = await tx.projectAssignment.findMany({
          where: { projectId, role: task.assigneeRole },
        });
        for (const a of assigned)
          await tx.projectTaskAssignee.create({ data: { taskId: saved.id, userId: a.userId } });
      }
    }
    for (const task of content.tasks)
      if (task.predecessor)
        await tx.projectTaskDependency.create({
          data: {
            predecessorId: ids.get(task.predecessor)!,
            successorId: ids.get(task.key)!,
            lagDays: task.lagDays,
          },
        });
  }
  if (content.selections.length) {
    await requireCapability(actor, 'SELECTION_CREATE', tx);
    for (const s of content.selections)
      await tx.selection.create({
        data: {
          projectId,
          category: s.category,
          title: s.title,
          description: s.description,
          required: s.required,
          deadline: new Date(
            +new Date(`${input.startDate}T12:00:00Z`) + s.deadlineOffset * 86400000,
          ),
          createdById: actor.id,
          options: {
            create: s.options.map((l, i) => ({
              name: l.description,
              description: l.clientDescription,
              costCodeId: l.costCodeId,
              costType: l.costType,
              quantity: l.quantity,
              unit: l.unit,
              unitCost: l.unitCost,
              markupMethod: l.markupMethod,
              markupValue: l.markupValue,
              clientPrice: lineAmounts(l).price,
              taxable: l.taxable,
              sortOrder: i,
              attachmentIds: [],
            })),
          },
        },
      });
  }
  return { revisionId };
}
export async function applyTemplate(actor: Actor, input: z.infer<typeof applySchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'TEMPLATE_VIEW', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    const old = await tx.templateApplication.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (old) {
      ensure(
        old.projectId === input.projectId &&
          old.templateId === input.templateId &&
          old.createdById === actor.id,
        'Request key already used.',
        409,
      );
      return { application: old };
    }
    const template = await tx.companyTemplate.findUnique({ where: { id: input.templateId } });
    ensure(
      template?.active && template.version === input.expectedVersion,
      'Template changed. Preview it again.',
      409,
    );
    let content = standardContent.parse(template.content);
    ensure(
      ['PROJECT', 'ESTIMATE', 'ASSEMBLY', 'SCHEDULE', 'SELECTION'].includes(template.kind),
      'Use this wording in the document editor.',
    );
    if (input.lineIndexes) {
      ensure(
        input.lineIndexes.every((i) => i < content.lines.length),
        'An item no longer exists.',
      );
      content = {
        ...content,
        lines: content.lines.filter((_, i) => input.lineIndexes!.includes(i)),
      };
    }
    const result = await applyContent(tx, actor, input.projectId, content, {
      ...input,
      baseQuantity: template.kind === 'ASSEMBLY' ? input.baseQuantity : '1',
    });
    const application = await tx.templateApplication.create({
      data: {
        projectId: input.projectId,
        templateId: template.id,
        templateVersion: template.version,
        snapshot: json(content),
        requestKey: input.requestKey,
        createdById: actor.id,
      },
    });
    await publishProjectEvent(tx, {
      projectId: input.projectId,
      actorId: actor.id,
      entity: 'CompanyTemplate',
      entityId: template.id,
      action: 'TEMPLATE_APPLIED',
      description: `Used ${template.name}, version ${template.version}.`,
    });
    return { ...result, application };
  });
}
export const catalogAddSchema = z
  .object({
    projectId: z.string(),
    revisionId: z.string(),
    revisionVersion: z.number().int().positive(),
    catalogId: z.string(),
    quantity: z.string().default('1'),
  })
  .strict();
export async function addCatalog(actor: Actor, input: z.infer<typeof catalogAddSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'COST_CATALOG_VIEW', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    const item = await tx.costCatalogItem.findUnique({ where: { id: input.catalogId } });
    ensure(item?.active, 'Choose an active catalog item.');
    const line = standardLine.parse({
      description: item.name,
      clientDescription: item.description,
      costCodeId: item.costCodeId,
      costType: item.costType,
      unit: item.unit,
      unitCost: String(item.unitCost),
      markupMethod: item.markupMethod,
      markupValue: String(item.markupValue),
      taxable: item.taxable,
      quantity: input.quantity,
    });
    const result = await applyContent(
      tx,
      actor,
      input.projectId,
      standardContent.parse({ lines: [line] }),
      { ...input, startDate: '2026-01-01' },
    );
    await publishProjectEvent(tx, {
      projectId: input.projectId,
      actorId: actor.id,
      entity: 'EstimateRevision',
      entityId: input.revisionId,
      action: 'CATALOG_ITEM_ADDED',
      description: 'Added a company catalog item to the estimate.',
    });
    return result;
  });
}
