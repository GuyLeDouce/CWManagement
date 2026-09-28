import { z } from 'zod';
import { db, transaction } from './db';
import { Actor, can, projectScope, requireCapability, requireProjectAccess } from './permissions';
import { ensure } from './errors';
import { publishProjectEvent } from './activity';
export async function workQueue(actor: Actor, mine = false, projectId?: string) {
  const scope = { ...(await projectScope(actor)), ...(projectId ? { id: projectId } : {}) };
  const [tasks, notifications, deficiencies, selections] = await Promise.all([
    db.projectTask.findMany({
      where: {
        project: scope,
        archivedAt: null,
        status: { notIn: ['COMPLETE', 'CANCELLED'] },
        ...(mine ? { assignees: { some: { userId: actor.id } } } : {}),
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        status: true,
        endDate: true,
        milestone: true,
        project: { select: { name: true } },
      },
      orderBy: { endDate: 'asc' },
      take: 60,
    }),
    db.notification.findMany({
      where: { userId: actor.id, readAt: null, ...(projectId ? { projectId } : {}) },
      select: { id: true, title: true, actionUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    (await can(actor, 'DEFICIENCY_VIEW'))
      ? db.deficiency.findMany({
          where: { project: scope, status: 'READY_FOR_REVIEW' },
          select: { id: true, projectId: true, title: true },
          take: 20,
        })
      : [],
    (await can(actor, 'SELECTION_VIEW'))
      ? db.selection.findMany({
          where: { project: scope, status: { in: ['PUBLISHED', 'APPROVAL_REQUIRED'] } },
          select: { id: true, projectId: true, title: true, deadline: true, status: true },
          orderBy: { deadline: 'asc' },
          take: 20,
        })
      : [],
  ]);
  return { tasks, notifications, deficiencies, selections };
}
export async function globalSearch(actor: Actor, q: string) {
  const scope = await projectScope(actor);
  if (q.trim().length < 2) return { results: [] };
  const contains = { contains: q.slice(0, 100), mode: 'insensitive' as const };
  const projects = await db.project.findMany({
    where: { AND: [scope, { archivedAt: null, OR: [{ name: contains }, { number: contains }] }] },
    select: { id: true, number: true, name: true },
    take: 10,
  });
  const results = projects.map((p) => ({
    id: p.id,
    title: `${p.number} · ${p.name}`,
    type: 'Project',
    href: `/projects/${p.id}`,
  }));
  for (const type of ['PURCHASE_ORDER', 'WORK_ORDER'] as const) {
    if (await can(actor, type === 'PURCHASE_ORDER' ? 'PURCHASE_ORDER_VIEW' : 'WORK_ORDER_VIEW'))
      for (const d of await db.purchasingDocument.findMany({
        where: { project: scope, type, number: contains },
        select: { id: true, number: true, projectId: true },
        take: 8,
      }))
        results.push({
          id: d.id,
          title: d.number,
          type: type === 'WORK_ORDER' ? 'Work order' : 'Purchase order',
          href: `/projects/${d.projectId}/purchase-orders`,
        });
  }
  if (await can(actor, 'CHANGE_ORDER_VIEW'))
    for (const d of await db.changeOrder.findMany({
      where: { project: scope, number: contains },
      select: { id: true, number: true, projectId: true },
      take: 8,
    }))
      results.push({
        id: d.id,
        title: d.number,
        type: 'Change order',
        href: `/projects/${d.projectId}/change-orders`,
      });
  if (await can(actor, 'CONTACT_MANAGE'))
    for (const c of await db.contact.findMany({
      where: {
        OR: [{ firstName: contains }, { lastName: contains }, { company: { name: contains } }],
      },
      select: { id: true, firstName: true, lastName: true },
      take: 8,
    }))
      results.push({
        id: c.id,
        title: `${c.firstName} ${c.lastName}`,
        type: 'Contact',
        href: '/contacts',
      });
  if (await can(actor, 'SELECTION_VIEW'))
    for (const s of await db.selection.findMany({
      where: { project: scope, title: contains },
      select: { id: true, title: true, projectId: true },
      take: 8,
    }))
      results.push({
        id: s.id,
        title: s.title,
        type: 'Selection',
        href: `/projects/${s.projectId}/selections`,
      });
  if (await can(actor, 'FILE_VIEW_INTERNAL'))
    for (const f of await db.storedFile.findMany({
      where: { project: scope, archivedAt: null, originalFilename: contains },
      select: { id: true, originalFilename: true, projectId: true },
      take: 8,
    }))
      results.push({
        id: f.id,
        title: f.originalFilename,
        type: 'Document',
        href: `/projects/${f.projectId}/files`,
      });
  return { results };
}
export const scheduleBulkSchema = z
  .object({
    projectId: z.string(),
    ids: z.array(z.string()).min(1).max(100),
    status: z
      .enum(['NOT_STARTED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'CANCELLED'])
      .optional(),
    shiftDays: z.number().int().min(-365).max(365).optional(),
  })
  .strict();
export async function updateSchedule(actor: Actor, input: z.infer<typeof scheduleBulkSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'PROJECT_SCHEDULE_EDIT', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    const tasks = await tx.projectTask.findMany({
      where: { id: { in: input.ids }, projectId: input.projectId, archivedAt: null },
    });
    ensure(tasks.length === new Set(input.ids).size, 'One or more tasks are unavailable.');
    for (const task of tasks)
      await tx.projectTask.update({
        where: { id: task.id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.shiftDays !== undefined
            ? {
                startDate: task.startDate
                  ? new Date(+task.startDate + input.shiftDays * 86400000)
                  : null,
                endDate: task.endDate ? new Date(+task.endDate + input.shiftDays * 86400000) : null,
              }
            : {}),
        },
      });
    await publishProjectEvent(tx, {
      projectId: input.projectId,
      actorId: actor.id,
      entity: 'Project',
      entityId: input.projectId,
      action: 'SCHEDULE_UPDATED',
      description: `Updated ${tasks.length} schedule tasks.`,
      before: tasks,
      metadata: { status: input.status, shiftDays: input.shiftDays },
    });
    return { updated: tasks.length };
  });
}
