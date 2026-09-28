import { z } from 'zod';
import {
  CostCodeType,
  MarkupMethod,
  CompanyTemplateKind,
  ProjectAssignmentRole,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

const label = z.string().trim().min(1).max(200);
const text = z.string().max(10000).default('');
export const decimal = z.coerce
  .string()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, 'Use a nonnegative number with up to four decimal places.');
export const standardLine = z
  .object({
    description: label,
    section: label.default('General'),
    costCodeId: z.string().min(1),
    costType: z.enum(CostCodeType),
    quantity: decimal.default('1'),
    unit: label.max(20).default('ea'),
    unitCost: decimal.default('0'),
    markupMethod: z.enum(MarkupMethod).default('NONE'),
    markupValue: decimal.default('0'),
    taxable: z.boolean().default(true),
    allowance: z.boolean().default(false),
    optional: z.boolean().default(false),
    clientDescription: text,
    catalogId: z.string().optional(),
  })
  .strict();
export const standardTask = z
  .object({
    key: label,
    name: label,
    phase: text,
    description: text,
    offsetDays: z.number().int().min(-3650).max(3650).default(0),
    durationDays: z.number().int().min(0).max(3650).default(1),
    predecessor: z.string().default(''),
    lagDays: z.number().int().min(-365).max(365).default(0),
    milestone: z.boolean().default(false),
    assigneeRole: z.union([z.enum(ProjectAssignmentRole), z.literal('')]).default(''),
  })
  .strict();
export const standardSelection = z
  .object({
    title: label,
    category: label.default('General'),
    description: text,
    deadlineOffset: z.number().int().min(-3650).max(3650).default(0),
    required: z.boolean().default(true),
    options: z.array(standardLine).max(30).default([]),
  })
  .strict();
export const standardContent = z
  .object({
    teamRoles: z.array(z.enum(ProjectAssignmentRole)).max(8).default([]),
    specifications: z
      .array(
        z.object({ title: label, category: label.default('General'), description: text }).strict(),
      )
      .max(200)
      .default([]),
    lines: z.array(standardLine).max(500).default([]),
    tasks: z.array(standardTask).max(500).default([]),
    selections: z.array(standardSelection).max(200).default([]),
    introduction: text,
    scope: text,
    exclusions: text,
    assumptions: text,
    terms: text,
    folders: z.array(label).max(50).default([]),
    stage: z.string().max(100).default(''),
    dailyLog: text,
    communication: text,
    // Project bundles snapshot their referenced standards when saved, never live-link them.
    references: z.array(z.string().min(1)).max(20).default([]),
  })
  .strict();
export const templateSchema = z
  .object({
    id: z.string().optional(),
    expectedVersion: z.number().int().positive().optional(),
    kind: z.enum(CompanyTemplateKind),
    name: label,
    description: text,
    active: z.boolean().default(true),
    content: standardContent,
  })
  .strict();
export const catalogSchema = z
  .object({
    id: z.string().optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: label,
    description: text,
    costCodeId: z.string().min(1),
    costType: z.enum(CostCodeType),
    unit: label.max(20),
    unitCost: decimal,
    markupMethod: z.enum(MarkupMethod).default('NONE'),
    markupValue: decimal.default('0'),
    taxable: z.boolean().default(true),
    vendorContactId: z
      .string()
      .nullish()
      .transform((v) => v || null),
    category: z.string().max(100).default(''),
    notes: text,
    source: text,
    active: z.boolean().default(true),
  })
  .strict();
export type StandardContent = z.infer<typeof standardContent>;
export function relativeSchedule(tasks: StandardContent['tasks'], start: string) {
  const base = new Date(`${z.iso.date().parse(start)}T12:00:00Z`);
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  if (byKey.size !== tasks.length) throw new Error('Each schedule task needs a unique key.');
  const visiting = new Set<string>();
  const dates = new Map<string, { startDate: Date; endDate: Date }>();
  const visit = (key: string): { startDate: Date; endDate: Date } => {
    const cached = dates.get(key);
    if (cached) return cached;
    if (visiting.has(key)) throw new Error('Schedule dependencies contain a cycle.');
    const task = byKey.get(key);
    if (!task) throw new Error('A predecessor task is missing.');
    visiting.add(key);
    const startDate = new Date(
      task.predecessor
        ? +visit(task.predecessor).endDate + task.lagDays * 86400000
        : +base + task.offsetDays * 86400000,
    );
    const result = {
      startDate,
      endDate: new Date(+startDate + (task.milestone ? 0 : task.durationDays) * 86400000),
    };
    dates.set(key, result);
    visiting.delete(key);
    return result;
  };
  return tasks.map((task) => ({ ...task, ...visit(task.key) }));
}
export function assemblyQuantity(base: string, factor: string) {
  const value = new Prisma.Decimal(decimal.parse(base))
    .mul(decimal.parse(factor))
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  return decimal.parse(value.toFixed());
}
