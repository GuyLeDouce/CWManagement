import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { db, transaction, audit } from './db';
import { adminSchema, saveAdmin, AdminInput } from './admin';
import { Actor, requireCapability } from './permissions';
import { ensure, AppError } from './errors';
import { privateKey } from './crypto';
import { csv } from './reports';
export const importSchema = z
  .object({
    entity: z.enum(['employees', 'jobsites', 'tasks', 'codes']),
    csv: z.string().min(1).max(200000),
    previewToken: z.string().optional(),
    commit: z.boolean().default(false),
  })
  .strict();
export const templates = {
  employees: [
    ['firstName', 'lastName', 'email', 'roles', 'earliestStart'],
    ['Jane', 'Smith', 'jane@example.com', 'SHOP|SITE', '07:00'],
  ],
  jobsites: [
    ['name', 'number', 'address', 'overhead'],
    ['Example project', 'CW-001', 'Project address', 'false'],
  ],
  tasks: [['name'], ['Framing']],
  codes: [
    ['code', 'description'],
    ['5000', 'Labour'],
  ],
};
export function template(entity: keyof typeof templates) {
  return csv(templates[entity]);
}
export async function importCsv(actor: Actor, input: z.infer<typeof importSchema>) {
  await requireCapability(actor, 'SETTINGS_MANAGE');
  let rows: Record<string, string>[];
  try {
    rows = parse(input.csv, {
      columns: (headers: string[]) => {
        ensure(new Set(headers).size === headers.length, 'Duplicate CSV headers.');
        return headers;
      },
      skip_empty_lines: true,
      bom: true,
      trim: true,
      max_record_size: 10000,
    });
  } catch {
    throw new AppError(400, 'CSV could not be read. Check the template and quoting.');
  }
  ensure(rows.length > 0 && rows.length <= 250, 'Import between 1 and 250 rows at a time.');
  const errors: { row: number; message: string }[] = [],
    prepared: AdminInput[] = [],
    seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    try {
      const entity = input.entity;
      const key = (
        entity === 'employees'
          ? row.email?.toLowerCase()
          : entity === 'jobsites'
            ? row.number
            : entity === 'codes'
              ? row.code
              : row.name
      )?.trim();
      ensure(key, 'Missing unique key.');
      ensure(!seen.has(key), 'Duplicate key within this file.');
      seen.add(key);
      const existing =
        entity === 'employees'
          ? await db.user.findUnique({ where: { email: key } })
          : entity === 'jobsites'
            ? await db.project.findUnique({ where: { number: key } })
            : entity === 'codes'
              ? await db.accountingCode.findUnique({ where: { code: key } })
              : await db.task.findUnique({ where: { name: key } });
      // Existing records are rejected explicitly: no accidental replacement of permission assignments.
      ensure(
        !existing,
        'Already exists. Edit the existing record in Admin; this import creates new records only.',
      );
      const data =
        entity === 'employees'
          ? {
              ...row,
              roles: (row.roles ?? '').split('|'),
              earliestStart: row.earliestStart || '07:00',
            }
          : entity === 'jobsites'
            ? { ...row, overhead: row.overhead === 'true' }
            : row;
      prepared.push(adminSchema.parse({ entity, data }));
    } catch (error) {
      errors.push({
        row: index + 2,
        message:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            : error instanceof Error
              ? error.message
              : 'Invalid row.',
      });
    }
  }
  const previewToken = privateKey(`${actor.id}:${input.entity}:${input.csv}`);
  if (!input.commit)
    return {
      rows: prepared.map((p, i) => ({ row: i + 2, ...p.data })),
      errors,
      previewToken,
      count: rows.length,
    };
  ensure(!errors.length, 'Fix all row errors before importing.');
  ensure(input.previewToken === previewToken, 'Preview this exact file before confirming import.');
  return transaction(async (tx) => {
    for (const item of prepared) await saveAdmin(tx, actor, item);
    await audit(tx, actor.id, 'CSV_IMPORTED', 'Import', input.entity, null, {
      count: prepared.length,
    });
    return { ok: true, count: prepared.length };
  });
}
