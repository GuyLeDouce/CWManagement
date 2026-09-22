import { ProjectAssignmentRole, ProjectContactRole, ProjectStatus, ContactType } from '@prisma/client';
import { z } from 'zod';
import { audit, db, transaction } from './db';
import { Actor, can, capabilities, requireCapability } from './permissions';
import { ensure } from './errors';

const optionalText = z.string().trim().max(4000).optional().nullable().transform((v) => v || null);
const optionalDate = z.string().trim().optional().nullable().transform((v) => v ? new Date(`${v}T12:00:00Z`) : null);

export const projectSchema = z.object({
  id: z.string().optional(),
  number: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  projectType: optionalText,
  status: z.enum(ProjectStatus),
  stage: optionalText,
  address: optionalText,
  municipality: optionalText,
  province: z.string().trim().max(40).optional().nullable().transform((v) => v || 'ON'),
  postalCode: optionalText,
  startDate: optionalDate,
  targetCompletion: optionalDate,
  actualCompletion: optionalDate,
  contractAmount: z.union([z.number().nonnegative(), z.string().trim(), z.null()]).optional().transform((v) => v === '' || v == null ? null : Number(v)),
  internalNotes: optionalText,
  clientVisibleNotes: optionalText,
  assignmentUserId: z.string().optional().nullable(),
  assignmentRole: z.enum(ProjectAssignmentRole).optional(),
  contactId: z.string().optional().nullable(),
  contactRole: z.enum(ProjectContactRole).optional(),
}).strict();

export const contactSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  companyId: z.string().optional().nullable().transform((v) => v || null),
  companyName: z.string().trim().max(200).optional().nullable().transform((v) => v || null),
  email: z.union([z.email(), z.literal('')]).optional().nullable().transform((v) => v || null),
  phone: optionalText,
  address: optionalText,
  municipality: optionalText,
  province: optionalText,
  postalCode: optionalText,
  notes: optionalText,
  types: z.array(z.enum(ContactType)).min(1),
}).strict();

async function projectScope(actor: Actor) {
  if (await can(actor, 'PROJECT_VIEW_ALL')) return {};
  await requireCapability(actor, 'PROJECT_VIEW_ASSIGNED');
  return { OR: [{ assignments: { some: { userId: actor.id } } }, { employees: { some: { userId: actor.id } } }, { managers: { some: { pmId: actor.id } } }] };
}

export async function managementState(actor: Actor) {
  return { capabilities: await capabilities(actor) };
}

export async function dashboard(actor: Actor) {
  const scope = await projectScope(actor);
  const now = new Date();
  const inThirtyDays = new Date(+now + 30 * 86400000);
  const [activeProjects, byStage, clockedIn, pendingApprovals, upcoming, activity] = await Promise.all([
    db.project.count({ where: { ...scope, active: true, archivedAt: null, status: { notIn: ['COMPLETE', 'ARCHIVED'] } } }),
    db.project.groupBy({ by: ['stage'], where: { ...scope, active: true, archivedAt: null }, _count: true }),
    db.timeSegment.count({ where: { end: null } }),
    db.timeSegment.count({ where: { status: 'PENDING_PM_APPROVAL', ...((await can(actor, 'TIME_APPROVE')) ? {} : { userId: actor.id }) } }),
    db.project.findMany({ where: { ...scope, archivedAt: null, targetCompletion: { gte: now, lte: inThirtyDays } }, select: { id: true, number: true, name: true, targetCompletion: true }, orderBy: { targetCompletion: 'asc' }, take: 6 }),
    db.auditLog.findMany({ where: { entity: { in: ['Project', 'Jobsite'] } }, orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { firstName: true, lastName: true } } } }),
  ]);
  return { activeProjects, byStage, clockedIn, pendingApprovals, upcoming, activity };
}

export async function projects(actor: Actor, query = '', status?: ProjectStatus, archived = false) {
  const scope = await projectScope(actor);
  return db.project.findMany({
    where: { AND: [scope, { archivedAt: archived ? { not: null } : null }, status ? { status } : {}, query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { number: { contains: query, mode: 'insensitive' } }, { municipality: { contains: query, mode: 'insensitive' } }] } : {}] },
    include: { contacts: { include: { contact: { include: { company: true } } }, orderBy: { primary: 'desc' } }, assignments: { include: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { primary: 'desc' } } },
    orderBy: [{ number: 'asc' }],
  });
}

export async function project(actor: Actor, id: string) {
  const item = await db.project.findFirst({ where: { id, ...(await projectScope(actor)) }, include: { contacts: { include: { contact: { include: { company: true } } } }, assignments: { include: { user: { select: { id: true, firstName: true, lastName: true } } } }, segments: { select: { effectiveStart: true, end: true }, orderBy: { effectiveStart: 'desc' }, take: 100 }, _count: { select: { segments: true } } } });
  ensure(item, 'Project not found.', 404);
  return item;
}

export async function saveProject(actor: Actor, input: z.infer<typeof projectSchema>) {
  await requireCapability(actor, input.id ? 'PROJECT_EDIT' : 'PROJECT_CREATE');
  return transaction(async (tx) => {
    const before = input.id ? await tx.project.findUnique({ where: { id: input.id } }) : null;
    const { id, assignmentUserId, assignmentRole, contactId, contactRole, ...data } = input;
    const saved = id ? await tx.project.update({ where: { id }, data }) : await tx.project.create({ data: { ...data, active: true } });
    if (assignmentUserId && assignmentRole) await tx.projectAssignment.upsert({ where: { projectId_userId_role: { projectId: saved.id, userId: assignmentUserId, role: assignmentRole } }, update: {}, create: { projectId: saved.id, userId: assignmentUserId, role: assignmentRole, primary: assignmentRole === 'PRIMARY_PROJECT_MANAGER' } });
    if (contactId && contactRole) await tx.projectContact.upsert({ where: { projectId_contactId_role: { projectId: saved.id, contactId, role: contactRole } }, update: {}, create: { projectId: saved.id, contactId, role: contactRole, primary: contactRole === 'CLIENT' } });
    await audit(tx, actor.id, before ? 'PROJECT_UPDATED' : 'PROJECT_CREATED', 'Project', saved.id, before, saved);
    return saved;
  });
}

export async function contacts(actor: Actor, query = '') {
  await requireCapability(actor, 'CONTACT_MANAGE');
  return db.contact.findMany({ where: query ? { OR: [{ firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }, { company: { name: { contains: query, mode: 'insensitive' } } }] } : {}, include: { company: true, _count: { select: { projects: true } } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
}

export async function saveContact(actor: Actor, input: z.infer<typeof contactSchema>) {
  await requireCapability(actor, 'CONTACT_MANAGE');
  return transaction(async (tx) => {
    const before = input.id ? await tx.contact.findUnique({ where: { id: input.id } }) : null;
    const { id, companyName, ...fields } = input;
    const companyId = fields.companyId || (companyName ? (await tx.company.upsert({ where: { name: companyName }, update: {}, create: { name: companyName } })).id : null);
    const saved = id ? await tx.contact.update({ where: { id }, data: { ...fields, companyId } }) : await tx.contact.create({ data: { ...fields, companyId } });
    await audit(tx, actor.id, before ? 'CONTACT_UPDATED' : 'CONTACT_CREATED', 'Contact', saved.id, before, saved);
    return saved;
  });
}

export async function managementOptionsV1(actor: Actor) {
  const [users, contactItems, companies] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, firstName: true, lastName: true, roles: true }, orderBy: [{ lastName: 'asc' }] }),
    can(actor, 'CONTACT_MANAGE').then((allowed) => allowed ? db.contact.findMany({ where: { active: true }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: 'asc' }] }) : []),
    can(actor, 'CONTACT_MANAGE').then((allowed) => allowed ? db.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) : []),
  ]);
  return { users, contacts: contactItems, companies };
}
