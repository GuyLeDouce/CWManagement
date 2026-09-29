import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, Tx, transaction, audit } from './db';
import { Actor, requireCapability, can } from './permissions';
import { ensure } from './errors';
import { isExternal } from './external-identity';

const date = z.string().datetime({ offset: true }).nullable().optional();
export const opportunitySchema = z
  .object({
    id: z.string().optional(),
    version: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    contactId: z.string().min(1),
    stageId: z.string().min(1),
    sourceId: z.string().nullable().optional(),
    ownerId: z.string().min(1),
    status: z.enum(['OPEN', 'WON', 'LOST']).default('OPEN'),
    projectType: z.string().max(100).default(''),
    address: z.string().max(500).default(''),
    municipality: z.string().max(100).default(''),
    referralSource: z.string().max(200).default(''),
    estimatedValue: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/)
      .default('0'),
    probability: z.number().int().min(0).max(100).default(0),
    expectedCloseDate: date,
    consultationDate: date,
    nextFollowUp: date,
    notes: z.string().max(10000).default(''),
    lostReason: z.string().max(2000).nullable().optional(),
  })
  .strict();
export async function crmScope(actor: Actor, tx: Tx = db): Promise<Prisma.OpportunityWhereInput> {
  await requireCapability(actor, 'CRM_VIEW', tx);
  return (await can(actor, 'CRM_CONFIGURE', tx))
    ? {}
    : { OR: [{ ownerId: actor.id }, { activities: { some: { ownerId: actor.id } } }] };
}
export async function requireOpportunity(actor: Actor, id: string, tx: Tx = db) {
  const row = await tx.opportunity.findFirst({ where: { id, ...(await crmScope(actor, tx)) } });
  ensure(row, 'Opportunity not found or unavailable.', 404);
  return row;
}
export async function crm(actor: Actor) {
  const scope = await crmScope(actor);
  const [opportunities, stages, sources, contacts, users] = await Promise.all([
    db.opportunity.findMany({
      where: scope,
      include: {
        contact: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            company: { select: { name: true } },
          },
        },
        owner: { select: { firstName: true, lastName: true } },
        activities: { orderBy: { dueAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.opportunityStage.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.leadSource.findMany({ orderBy: { name: 'asc' } }),
    db.contact.findMany({
      where: { active: true, types: { hasSome: ['CLIENT', 'PROSPECT'] } },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.user.findMany({
      where: { active: true, NOT: { roles: { hasSome: ['CLIENT', 'SUBTRADE', 'VENDOR'] } } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  return { opportunities, stages, sources, contacts, users };
}
export async function saveOpportunity(actor: Actor, raw: unknown) {
  const input = opportunitySchema.parse(raw);
  return transaction(async (tx) => {
    await requireCapability(actor, 'CRM_MANAGE', tx);
    const before = input.id ? await requireOpportunity(actor, input.id, tx) : null;
    ensure(
      !before?.projectId,
      'Converted opportunities retain their sales history. Edit the linked project instead.',
    );
    ensure(
      !before || before.version === input.version,
      'Opportunity changed. Reload before saving.',
      409,
    );
    ensure(
      await tx.opportunityStage.findFirst({ where: { id: input.stageId, active: true } }),
      'Choose an active stage.',
    );
    ensure(
      await tx.contact.findFirst({
        where: { id: input.contactId, active: true, types: { hasSome: ['CLIENT', 'PROSPECT'] } },
      }),
      'Choose an active client or prospect.',
    );
    if (input.sourceId)
      ensure(
        await tx.leadSource.findFirst({ where: { id: input.sourceId, active: true } }),
        'Choose an active source.',
      );
    const owner = await tx.user.findUnique({ where: { id: input.ownerId } });
    ensure(owner?.active && !isExternal(owner), 'Choose an active internal owner.');
    ensure(
      input.ownerId === actor.id || (await can(actor, 'CRM_CONFIGURE', tx)),
      'Only CRM administrators can assign another owner.',
      403,
    );
    ensure(
      input.status !== 'LOST' || input.lostReason?.trim(),
      'Record why this opportunity was lost.',
    );
    const { id, version: _version, ...data } = input;
    void _version;
    const values = {
      ...data,
      closedAt: input.status === 'OPEN' ? null : before?.closedAt || new Date(),
      version: before ? before.version + 1 : 1,
    };
    const saved = id
      ? await tx.opportunity.update({ where: { id }, data: values })
      : await tx.opportunity.create({ data: values });
    await audit(
      tx,
      actor.id,
      before ? 'OPPORTUNITY_UPDATED' : 'OPPORTUNITY_CREATED',
      'Opportunity',
      saved.id,
      before,
      saved,
    );
    return saved;
  });
}
export const activitySchema = z
  .object({
    id: z.string().optional(),
    opportunityId: z.string(),
    title: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(80),
    ownerId: z.string(),
    dueAt: z.string().datetime({ offset: true }),
    notes: z.string().max(10000).default(''),
    complete: z.boolean().default(false),
  })
  .strict();
export async function saveCrmActivity(actor: Actor, raw: unknown) {
  const input = activitySchema.parse(raw);
  return transaction(async (tx) => {
    await requireCapability(actor, 'CRM_MANAGE', tx);
    await requireOpportunity(actor, input.opportunityId, tx);
    const owner = await tx.user.findUnique({ where: { id: input.ownerId } });
    ensure(owner?.active && !isExternal(owner), 'Choose an internal owner.');
    const before = input.id
      ? await tx.crmActivity.findFirst({
          where: { id: input.id, opportunityId: input.opportunityId },
        })
      : null;
    ensure(!input.id || before, 'Follow-up unavailable.', 404);
    const { id, complete, ...data } = input;
    const values = { ...data, completedAt: complete ? before?.completedAt || new Date() : null };
    const row = id
      ? await tx.crmActivity.update({ where: { id }, data: values })
      : await tx.crmActivity.create({ data: values });
    await audit(
      tx,
      actor.id,
      'CRM_ACTIVITY_UPDATED',
      'Opportunity',
      input.opportunityId,
      before,
      row,
    );
    return row;
  });
}
export async function configureCrm(actor: Actor, raw: unknown) {
  const i = z
    .object({
      kind: z.enum(['stage', 'source']),
      id: z.string().optional(),
      name: z.string().trim().min(1).max(100),
      active: z.boolean().default(true),
      sortOrder: z.number().int().min(0).default(0),
    })
    .strict()
    .parse(raw);
  return transaction(async (tx) => {
    await requireCapability(actor, 'CRM_CONFIGURE', tx);
    const data = { name: i.name, active: i.active };
    const row =
      i.kind === 'stage'
        ? await tx.opportunityStage.upsert({
            where: { id: i.id || '__new__' },
            create: { ...data, sortOrder: i.sortOrder },
            update: { ...data, sortOrder: i.sortOrder },
          })
        : await tx.leadSource.upsert({
            where: { id: i.id || '__new__' },
            create: data,
            update: data,
          });
    await audit(tx, actor.id, 'CRM_CONFIGURATION_UPDATED', i.kind, row.id, null, row);
    return row;
  });
}
