import {
  DependencyType,
  FileKind,
  ProjectAssignmentRole,
  ProjectContactRole,
  ProjectTaskStatus,
} from '@prisma/client';
import { z } from 'zod';
import { publishProjectEvent, notify } from './activity';
import { db, transaction, Tx } from './db';
import { ensure } from './errors';
import { Actor, requireCapability, requireProjectAccess } from './permissions';

const id = z.string().min(1).max(100);
const text = (max = 10000) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const date = z.string().trim().optional().nullable().transform((v) => v ? new Date(`${v}T12:00:00Z`) : null);

export const assignmentSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), projectId: id, userId: id, role: z.enum(ProjectAssignmentRole), primary: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('remove'), projectId: id, assignmentId: id }).strict(),
]);
export const projectContactSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), projectId: id, contactId: id, role: z.enum(ProjectContactRole), primary: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('remove'), projectId: id, contactId: id, role: z.enum(ProjectContactRole) }).strict(),
]);
export const projectTaskSchema = z.object({
  id: id.optional(), projectId: id, name: z.string().trim().min(1).max(200), description: text(),
  status: z.enum(ProjectTaskStatus).default('NOT_STARTED'), startDate: date, endDate: date,
  actualStartDate: date, actualEndDate: date, milestone: z.boolean().default(false), sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  userIds: z.array(id).max(50).default([]), contactIds: z.array(id).max(50).default([]),
  predecessorId: id.optional().nullable(), dependencyType: z.enum(DependencyType).default('FINISH_TO_START'), lagDays: z.coerce.number().int().min(-365).max(365).default(0),
}).strict().refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { message: 'Finish date must not be before start date.', path: ['endDate'] });
export const taskActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('archive'), projectId: id, id }).strict(),
  z.object({ action: z.literal('complete'), projectId: id, id }).strict(),
]);
export const dailyLogSchema = z.object({
  id: id.optional(), projectId: id, date: z.string().date().transform((v) => new Date(`${v}T12:00:00Z`)),
  workCompleted: text(), siteConditions: text(), weatherNotes: text(), manpowerNotes: text(), delaysIssues: text(),
  deliveries: text(), visitors: text(), inspections: text(), generalNotes: text(), clientVisible: z.boolean().default(false),
}).strict().refine((v) => [v.workCompleted,v.siteConditions,v.weatherNotes,v.manpowerNotes,v.delaysIssues,v.deliveries,v.visitors,v.inspections,v.generalNotes].some(Boolean), { message: 'Add at least one daily log entry.' });
export const fileActionSchema = z.object({ action: z.literal('archive'), projectId: id, id }).strict();

export async function projectActivity(actor: Actor, projectId: string) {
  await requireProjectAccess(actor, projectId);
  return db.auditLog.findMany({
    where: { projectId, description: { not: null } },
    include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
}

export async function saveAssignment(actor: Actor, input: z.infer<typeof assignmentSchema>) {
  await requireCapability(actor, 'PROJECT_ASSIGN');
  return transaction(async (tx) => {
    const project = await requireProjectAccess(actor, input.projectId, tx);
    if (input.action === 'add') {
      const user = await tx.user.findFirst({ where: { id: input.userId, active: true } });
      ensure(user, 'Active user not found.', 404);
      const assignment = await tx.projectAssignment.upsert({
        where: { projectId_userId_role: { projectId: input.projectId, userId: input.userId, role: input.role } },
        update: { primary: input.primary }, create: { projectId: input.projectId, userId: input.userId, role: input.role, primary: input.primary },
      });
      await publishProjectEvent(tx, { projectId: project.id, actorId: actor.id, action: 'PROJECT_ASSIGNMENT_ADDED', entity: 'ProjectAssignment', entityId: assignment.id, description: `assigned ${user.firstName} ${user.lastName} as ${input.role.toLowerCase().replaceAll('_',' ')}`, after: assignment });
      if (user.id !== actor.id) await notify(tx, { userId: user.id, projectId: project.id, type: 'PROJECT_ASSIGNED', title: `Assigned to ${project.name}`, message: `You were assigned as ${input.role.toLowerCase().replaceAll('_',' ')}.`, actionUrl: `/projects/${project.id}`, entityType: 'ProjectAssignment', entityId: assignment.id });
      return assignment;
    }
    const assignment = await tx.projectAssignment.findFirst({ where: { id: input.assignmentId, projectId: input.projectId }, include: { user: true } });
    ensure(assignment, 'Assignment not found.', 404);
    await tx.projectAssignment.delete({ where: { id: assignment.id } });
    await publishProjectEvent(tx, { projectId: project.id, actorId: actor.id, action: 'PROJECT_ASSIGNMENT_REMOVED', entity: 'ProjectAssignment', entityId: assignment.id, description: `removed ${assignment.user.firstName} ${assignment.user.lastName} from ${assignment.role.toLowerCase().replaceAll('_',' ')}`, before: assignment });
    return { ok: true };
  });
}

export async function saveProjectContact(actor: Actor, input: z.infer<typeof projectContactSchema>) {
  await requireCapability(actor, 'PROJECT_CONTACT_MANAGE');
  return transaction(async (tx) => {
    const project = await requireProjectAccess(actor, input.projectId, tx);
    const contact = await tx.contact.findUnique({ where: { id: input.contactId } });
    ensure(contact, 'Contact not found.', 404);
    if (input.action === 'add') {
      const association = await tx.projectContact.upsert({ where: { projectId_contactId_role: { projectId: input.projectId, contactId: input.contactId, role: input.role } }, update: { primary: input.primary }, create: { projectId: input.projectId, contactId: input.contactId, role: input.role, primary: input.primary } });
      await publishProjectEvent(tx, { projectId: project.id, actorId: actor.id, action: 'PROJECT_CONTACT_ADDED', entity: 'ProjectContact', entityId: contact.id, description: `added ${contact.firstName} ${contact.lastName} as ${input.role.toLowerCase().replaceAll('_',' ')}`, after: association });
      return association;
    }
    const association = await tx.projectContact.findUnique({ where: { projectId_contactId_role: { projectId: input.projectId, contactId: input.contactId, role: input.role } } });
    ensure(association, 'Project contact association not found.', 404);
    await tx.projectContact.delete({ where: { projectId_contactId_role: { projectId: input.projectId, contactId: input.contactId, role: input.role } } });
    await publishProjectEvent(tx, { projectId: project.id, actorId: actor.id, action: 'PROJECT_CONTACT_REMOVED', entity: 'ProjectContact', entityId: contact.id, description: `removed ${contact.firstName} ${contact.lastName} as ${input.role.toLowerCase().replaceAll('_',' ')}`, before: association });
    return { ok: true };
  });
}

export async function schedule(actor: Actor, projectId: string) {
  await requireProjectAccess(actor, projectId);
  return db.projectTask.findMany({ where: { projectId, archivedAt: null }, include: { assignees: { include: { user: { select: { id:true,firstName:true,lastName:true } }, contact: { select: { id:true,firstName:true,lastName:true } } } }, predecessors: { include: { predecessor: { select: { id:true,name:true } } } } }, orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }, { createdAt: 'asc' }] });
}

async function ensureNoDependencyCycle(tx: Tx, projectId: string, predecessorId: string, successorId: string) {
  ensure(predecessorId !== successorId, 'A task cannot depend on itself.');
  const dependencies = await tx.projectTaskDependency.findMany({ where: { predecessor: { projectId } } });
  const edges = new Map<string,string[]>();
  for (const item of dependencies) edges.set(item.predecessorId, [...(edges.get(item.predecessorId) ?? []), item.successorId]);
  const stack = [successorId], visited = new Set<string>();
  while (stack.length) { const current = stack.pop()!; ensure(current !== predecessorId, 'This dependency would create a schedule cycle.'); if (!visited.has(current)) { visited.add(current); stack.push(...(edges.get(current) ?? [])); } }
}

export async function saveProjectTask(actor: Actor, input: z.infer<typeof projectTaskSchema>) {
  await requireCapability(actor, 'PROJECT_SCHEDULE_EDIT');
  return transaction(async (tx) => {
    const project = await requireProjectAccess(actor, input.projectId, tx);
    const before = input.id ? await tx.projectTask.findFirst({ where: { id: input.id, projectId: input.projectId } }) : null;
    if (input.id) ensure(before, 'Schedule task not found.', 404);
    const { id: taskId, userIds, contactIds, predecessorId, dependencyType, lagDays, ...fields } = input;
    const task = taskId ? await tx.projectTask.update({ where: { id: taskId }, data: fields }) : await tx.projectTask.create({ data: { ...fields, createdById: actor.id } });
    await tx.projectTaskAssignee.deleteMany({ where: { taskId: task.id } });
    if (userIds.length || contactIds.length)
      await tx.projectTaskAssignee.createMany({
        data: [
          ...[...new Set(userIds)].map((userId) => ({ taskId: task.id, userId })),
          ...[...new Set(contactIds)].map((contactId) => ({ taskId: task.id, contactId })),
        ],
      });
    await tx.projectTaskDependency.deleteMany({ where: { successorId: task.id } });
    if (predecessorId) { await ensureNoDependencyCycle(tx, project.id, predecessorId, task.id); await tx.projectTaskDependency.create({ data: { predecessorId, successorId: task.id, type: dependencyType, lagDays } }); }
    const action = before ? (before.status !== 'COMPLETE' && task.status === 'COMPLETE' ? 'PROJECT_TASK_COMPLETED' : 'PROJECT_TASK_UPDATED') : 'PROJECT_TASK_CREATED';
    const verb = action === 'PROJECT_TASK_COMPLETED' ? 'completed' : before ? 'updated' : 'created';
    await publishProjectEvent(tx, { projectId: project.id, actorId: actor.id, action, entity: 'ProjectTask', entityId: task.id, description: `${verb} schedule task “${task.name}”`, before, after: task });
    for (const userId of [...new Set(userIds)].filter((value) => value !== actor.id)) await notify(tx, { userId, projectId: project.id, type: 'TASK_ASSIGNED', title: `Task assigned: ${task.name}`, message: `You were assigned a schedule task on ${project.name}.`, actionUrl: `/projects/${project.id}/schedule`, entityType: 'ProjectTask', entityId: task.id });
    return task;
  });
}

export async function actOnProjectTask(actor: Actor, input: z.infer<typeof taskActionSchema>) {
  await requireCapability(actor, 'PROJECT_SCHEDULE_EDIT');
  return transaction(async (tx) => {
    const project = await requireProjectAccess(actor, input.projectId, tx);
    const before = await tx.projectTask.findFirst({ where: { id: input.id, projectId: input.projectId, archivedAt: null } }); ensure(before, 'Schedule task not found.', 404);
    const task = await tx.projectTask.update({ where: { id: input.id }, data: input.action === 'archive' ? { archivedAt: new Date() } : { status: 'COMPLETE', actualEndDate: new Date() } });
    await publishProjectEvent(tx, { projectId: project.id, actorId: actor.id, action: input.action === 'archive' ? 'PROJECT_TASK_ARCHIVED' : 'PROJECT_TASK_COMPLETED', entity: 'ProjectTask', entityId: task.id, description: `${input.action === 'archive' ? 'archived' : 'completed'} schedule task “${task.name}”`, before, after: task });
    return task;
  });
}

export async function dailyLogs(actor: Actor, projectId: string) {
  await requireProjectAccess(actor, projectId);
  return db.dailyLog.findMany({ where: { projectId }, include: { author: { select: { id:true,firstName:true,lastName:true } }, attachments: { where: { archivedAt: null }, select: { id:true,kind:true,originalFilename:true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
}
export async function saveDailyLog(actor: Actor, input: z.infer<typeof dailyLogSchema>) {
  await requireCapability(actor, input.id ? 'DAILY_LOG_EDIT' : 'DAILY_LOG_CREATE');
  return transaction(async (tx) => {
    const project = await requireProjectAccess(actor, input.projectId, tx);
    const before = input.id ? await tx.dailyLog.findFirst({ where: { id: input.id, projectId: input.projectId } }) : null;
    if (input.id) ensure(before, 'Daily log not found.', 404);
    const { id: logId, ...fields } = input;
    const log = logId ? await tx.dailyLog.update({ where: { id: logId }, data: fields }) : await tx.dailyLog.create({ data: { ...fields, authorId: actor.id } });
    await publishProjectEvent(tx, { projectId: project.id, actorId: actor.id, action: before ? 'DAILY_LOG_UPDATED' : 'DAILY_LOG_CREATED', entity: 'DailyLog', entityId: log.id, description: `${before ? 'updated' : 'created'} daily log for ${log.date.toISOString().slice(0,10)}`, before, after: log });
    return log;
  });
}

export async function files(actor: Actor, projectId: string, kind?: FileKind) {
  await requireProjectAccess(actor, projectId); await requireCapability(actor, 'FILE_VIEW_INTERNAL');
  const rows = await db.storedFile.findMany({ where: { projectId, archivedAt: null, ...(kind ? { kind } : {}) }, include: { uploader: { select: { firstName:true,lastName:true } } }, orderBy: { uploadedAt: 'desc' } });
  return rows.map(({ size, ...row }) => ({ ...row, size: size.toString() }));
}
export async function archiveFile(actor: Actor, input: z.infer<typeof fileActionSchema>) {
  await requireCapability(actor, 'FILE_UPLOAD');
  return transaction(async (tx) => {
    await requireProjectAccess(actor, input.projectId, tx);
    const before = await tx.storedFile.findFirst({ where: { id: input.id, projectId: input.projectId, archivedAt: null } }); ensure(before, 'File not found.', 404);
    const record = await tx.storedFile.update({ where: { id: input.id }, data: { archivedAt: new Date() } });
    await publishProjectEvent(tx, { projectId: input.projectId, actorId: actor.id, action: record.kind === 'PHOTO' ? 'PHOTO_ARCHIVED' : 'FILE_ARCHIVED', entity: 'StoredFile', entityId: record.id, description: `archived ${record.kind === 'PHOTO' ? 'photo' : 'file'} “${record.originalFilename}”`, before: { ...before, size: before.size.toString() }, after: { ...record, size: record.size.toString() } });
    return { ok: true };
  });
}

export async function notifications(actor: Actor) {
  return db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: 'desc' }, take: 100 });
}
export async function updateNotifications(actor: Actor, input: { id?: string; all?: boolean; unread?: boolean }) {
  const readAt = input.unread ? null : new Date();
  if (input.all) return db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt } });
  ensure(input.id, 'Notification is required.');
  const result = await db.notification.updateMany({ where: { id: input.id, userId: actor.id }, data: { readAt } }); ensure(result.count === 1, 'Notification not found.', 404); return { ok: true };
}
