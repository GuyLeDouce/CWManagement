import {
  ProjectAssignmentRole,
  ProjectContactRole,
  ProjectStatus,
  ContactType,
} from '@prisma/client';
import { z } from 'zod';
import { audit, db, transaction } from './db';
import { publishProjectEvent } from './activity';
import {
  Actor,
  can,
  capabilities,
  projectScope,
  requireCapability,
  requireProjectAccess,
} from './permissions';
import { ensure } from './errors';

const optionalText = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .nullable()
  .transform((v) => v || null);
const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(`${v}T12:00:00Z`) : null));

export const projectSchema = z
  .object({
    id: z.string().optional(),
    number: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(200),
    description: optionalText,
    projectType: optionalText,
    status: z.enum(ProjectStatus),
    stage: optionalText,
    address: optionalText,
    municipality: optionalText,
    province: z
      .string()
      .trim()
      .max(40)
      .optional()
      .nullable()
      .transform((v) => v || 'ON'),
    postalCode: optionalText,
    startDate: optionalDate,
    targetCompletion: optionalDate,
    actualCompletion: optionalDate,
    contractAmount: z
      .union([z.number().nonnegative(), z.string().trim(), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v)))
      .refine(
        (v) => v == null || (Number.isFinite(v) && v >= 0),
        'Contract amount must be a nonnegative number.',
      ),
    internalNotes: optionalText,
    clientVisibleNotes: optionalText,
    assignmentUserId: z.string().optional().nullable(),
    assignmentRole: z.enum(ProjectAssignmentRole).optional(),
    contactId: z.string().optional().nullable(),
    contactRole: z.enum(ProjectContactRole).optional(),
  })
  .strict();

export const contactSchema = z
  .object({
    active: z.boolean().optional(),
    id: z.string().optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    companyId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null),
    companyName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .nullable()
      .transform((v) => v || null),
    email: z
      .union([z.email(), z.literal('')])
      .optional()
      .nullable()
      .transform((v) => v || null),
    phone: optionalText,
    address: optionalText,
    municipality: optionalText,
    province: optionalText,
    postalCode: optionalText,
    notes: optionalText,
    types: z.array(z.enum(ContactType)).min(1),
  })
  .strict();

export async function managementState(actor: Actor) {
  return { capabilities: await capabilities(actor) };
}

export async function dashboard(actor: Actor) {
  const scope = await projectScope(actor);
  const now = new Date();
  const inThirtyDays = new Date(+now + 30 * 86400000);
  const [activeProjects, byStage, clockedIn, pendingApprovals, upcoming, activity] =
    await Promise.all([
      db.project.count({
        where: {
          ...scope,
          active: true,
          archivedAt: null,
          status: { notIn: ['COMPLETE', 'ARCHIVED'] },
        },
      }),
      db.project.groupBy({
        by: ['stage'],
        where: { ...scope, active: true, archivedAt: null },
        _count: true,
      }),
      db.timeSegment.count({ where: { end: null } }),
      db.timeSegment.count({
        where: {
          status: 'PENDING_PM_APPROVAL',
          ...((await can(actor, 'TIME_APPROVE')) ? {} : { userId: actor.id }),
        },
      }),
      db.project.findMany({
        where: { ...scope, archivedAt: null, targetCompletion: { gte: now, lte: inThirtyDays } },
        select: { id: true, number: true, name: true, targetCompletion: true },
        orderBy: { targetCompletion: 'asc' },
        take: 6,
      }),
      db.auditLog.findMany({
        where: { projectId: { not: null }, description: { not: null }, project: { is: scope } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          actor: { select: { firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      }),
    ]);
  return {
    activeProjects,
    byStage,
    clockedIn,
    pendingApprovals,
    upcoming,
    activity: activity.map(
      ({ id, projectId, action, description, createdAt, actor, project, entityId }) => ({
        id,
        projectId,
        action,
        description,
        createdAt,
        actor,
        project,
        entityId,
      }),
    ),
  };
}

export async function projects(actor: Actor, query = '', status?: ProjectStatus, archived = false) {
  const scope = await projectScope(actor);
  const items = await db.project.findMany({
    where: {
      AND: [
        scope,
        { archivedAt: archived ? { not: null } : null },
        status ? { status } : {},
        query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { number: { contains: query, mode: 'insensitive' } },
                { municipality: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    },
    include: {
      contacts: {
        include: { contact: { include: { company: true } } },
        orderBy: { primary: 'desc' },
      },
      assignments: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { primary: 'desc' },
      },
    },
    orderBy: [{ number: 'asc' }],
  });
  const financial = await can(actor, 'PROJECT_FINANCIALS_VIEW');
  return items.map((item) => ({ ...item, contractAmount: financial ? item.contractAmount : null }));
}

export async function project(actor: Actor, id: string) {
  const item = await db.project.findFirst({
    where: { id, ...(await projectScope(actor)) },
    include: {
      contacts: { include: { contact: { include: { company: true } } } },
      assignments: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      segments: {
        select: { effectiveStart: true, end: true },
        orderBy: { effectiveStart: 'desc' },
        take: 100,
      },
      scheduleTasks: {
        where: { archivedAt: null },
        include: {
          assignees: {
            include: {
              user: { select: { firstName: true, lastName: true } },
              contact: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }],
        take: 8,
      },
      dailyLogs: {
        include: { author: { select: { firstName: true, lastName: true } } },
        orderBy: { date: 'desc' },
        take: 5,
      },
      files: {
        where: { archivedAt: null, kind: 'PHOTO' },
        select: { id: true, originalFilename: true, caption: true, uploadedAt: true },
        orderBy: { uploadedAt: 'desc' },
        take: 6,
      },
      activity: {
        where: { description: { not: null } },
        include: { actor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      _count: { select: { segments: true, scheduleTasks: true, dailyLogs: true, files: true } },
    },
  });
  ensure(item, 'Project not found.', 404);
  return {
    ...item,
    contractAmount: (await can(actor, 'PROJECT_FINANCIALS_VIEW')) ? item.contractAmount : null,
    activity: item.activity.map(
      ({ id, projectId, action, description, createdAt, actor, entityId }) => ({
        id,
        projectId,
        action,
        description,
        createdAt,
        actor,
        entityId,
      }),
    ),
  };
}

export async function saveProject(actor: Actor, input: z.infer<typeof projectSchema>) {
  await requireCapability(actor, input.id ? 'PROJECT_EDIT' : 'PROJECT_CREATE');
  return transaction(async (tx) => {
    if (input.id) await requireProjectAccess(actor, input.id, tx);
    const before = input.id ? await tx.project.findUnique({ where: { id: input.id } }) : null;
    const { id, assignmentUserId, assignmentRole, contactId, contactRole, ...data } = input;
    if (
      data.contractAmount !== undefined &&
      String(data.contractAmount) !== String(before?.contractAmount ?? null)
    ) {
      await requireCapability(actor, 'PROJECT_FINANCIALS_EDIT', tx);
      ensure(
        !before || !(await tx.contractAdjustment.count({ where: { projectId: before.id } })),
        'Original contract is locked after accepted change orders.',
      );
    }
    const saved = id
      ? await tx.project.update({ where: { id }, data })
      : await tx.project.create({ data: { ...data, active: true } });
    if (assignmentUserId && assignmentRole)
      await tx.projectAssignment.upsert({
        where: {
          projectId_userId_role: {
            projectId: saved.id,
            userId: assignmentUserId,
            role: assignmentRole,
          },
        },
        update: {},
        create: {
          projectId: saved.id,
          userId: assignmentUserId,
          role: assignmentRole,
          primary: assignmentRole === 'PRIMARY_PROJECT_MANAGER',
        },
      });
    if (contactId && contactRole)
      await tx.projectContact.upsert({
        where: { projectId_contactId_role: { projectId: saved.id, contactId, role: contactRole } },
        update: {},
        create: {
          projectId: saved.id,
          contactId,
          role: contactRole,
          primary: contactRole === 'CLIENT',
        },
      });
    if (!before)
      await publishProjectEvent(tx, {
        projectId: saved.id,
        actorId: actor.id,
        action: 'PROJECT_CREATED',
        entity: 'Project',
        entityId: saved.id,
        description: `created project ${saved.number} · ${saved.name}`,
        after: saved,
      });
    else {
      const changes = [
        'number',
        'name',
        'projectType',
        'status',
        'stage',
        'description',
        'address',
        'municipality',
        'province',
        'postalCode',
        'startDate',
        'targetCompletion',
        'actualCompletion',
        'internalNotes',
        'clientVisibleNotes',
      ].filter(
        (key) =>
          JSON.stringify(before[key as keyof typeof before]) !==
          JSON.stringify(saved[key as keyof typeof saved]),
      );
      const statusChanged = before.status !== saved.status,
        stageChanged = before.stage !== saved.stage;
      const description = statusChanged
        ? `changed project status from ${before.status.toLowerCase().replaceAll('_', ' ')} to ${saved.status.toLowerCase().replaceAll('_', ' ')}`
        : stageChanged
          ? `changed project stage from ${before.stage || 'not set'} to ${saved.stage || 'not set'}`
          : `updated project settings (${changes.join(', ') || 'no material fields'})`;
      await publishProjectEvent(tx, {
        projectId: saved.id,
        actorId: actor.id,
        action: statusChanged
          ? 'PROJECT_STATUS_CHANGED'
          : stageChanged
            ? 'PROJECT_STAGE_CHANGED'
            : 'PROJECT_UPDATED',
        entity: 'Project',
        entityId: saved.id,
        description,
        before,
        after: saved,
        metadata: { changedFields: changes },
      });
    }
    return saved;
  });
}

export async function contacts(actor: Actor, query = '') {
  await requireCapability(actor, 'CONTACT_MANAGE');
  return db.contact.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { company: { name: { contains: query, mode: 'insensitive' } } },
          ],
        }
      : {},
    include: { company: true, _count: { select: { projects: true } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export async function saveContact(actor: Actor, input: z.infer<typeof contactSchema>) {
  ensure(
    (await can(actor, 'CONTACT_MANAGE')) || (await can(actor, 'PROJECT_CONTACT_MANAGE')),
    'You do not have permission to do this.',
    403,
  );
  return transaction(async (tx) => {
    const before = input.id ? await tx.contact.findUnique({ where: { id: input.id } }) : null;
    const { id, companyName, ...fields } = input;
    const companyId =
      fields.companyId ||
      (companyName
        ? (
            await tx.company.upsert({
              where: { name: companyName },
              update: {},
              create: { name: companyName },
            })
          ).id
        : null);
    const saved = id
      ? await tx.contact.update({ where: { id }, data: { ...fields, companyId } })
      : await tx.contact.create({ data: { ...fields, companyId } });
    await audit(
      tx,
      actor.id,
      before ? 'CONTACT_UPDATED' : 'CONTACT_CREATED',
      'Contact',
      saved.id,
      before,
      saved,
    );
    return saved;
  });
}

export const companySchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(200),
    legalName: optionalText,
    email: z
      .union([z.email(), z.literal('')])
      .nullish()
      .transform((v) => v || null),
    phone: optionalText,
    website: optionalText,
    address: optionalText,
    municipality: optionalText,
    province: optionalText,
    postalCode: optionalText,
    notes: optionalText,
    active: z.boolean(),
  })
  .strict();
export async function saveCompany(actor: Actor, input: z.infer<typeof companySchema>) {
  await requireCapability(actor, 'CONTACT_MANAGE');
  return transaction(async (tx) => {
    const { id, ...data } = input;
    const before = id ? await tx.company.findUnique({ where: { id } }) : null;
    if (id) ensure(before, 'Company not found.', 404);
    const saved = id
      ? await tx.company.update({ where: { id }, data })
      : await tx.company.create({ data });
    await audit(
      tx,
      actor.id,
      before ? 'COMPANY_UPDATED' : 'COMPANY_CREATED',
      'Company',
      saved.id,
      before,
      saved,
    );
    return saved;
  });
}
export async function managementOptionsV1(actor: Actor) {
  const canUseContacts =
    (await can(actor, 'CONTACT_MANAGE')) ||
    (await can(actor, 'PROJECT_CONTACT_MANAGE')) ||
    (await can(actor, 'PROJECT_SCHEDULE_EDIT'));
  const [users, contactItems, companies] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, roles: true },
      orderBy: [{ lastName: 'asc' }],
    }),
    canUseContacts
      ? db.contact.findMany({
          where: { active: true },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: 'asc' }],
        })
      : [],
    canUseContacts
      ? db.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : [],
  ]);
  return { users, contacts: contactItems, companies };
}
