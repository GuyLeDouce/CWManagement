import { Capability, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, json } from './db';
import { Actor, can, projectScope, requireCapability, segmentScope } from './permissions';
import { jobCost } from './financial';
import { crmScope } from './crm';
import { ensure } from './errors';
export const reportTypes = [
  'projects',
  'tasks',
  'financial',
  'cost-codes',
  'purchasing',
  'change-orders',
  'selections',
  'crm',
  'follow-ups',
  'time',
  'warranty',
  'trades',
  'activity',
] as const;
export const reportSchema = z
  .object({
    report: z.enum(reportTypes),
    projectId: z.string().optional(),
    ownerId: z.string().optional(),
    tradeId: z.string().optional(),
    status: z.string().max(80).optional(),
    q: z.string().max(150).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    overdue: z.boolean().default(false),
    milestones: z.boolean().default(false),
    groupBy: z.enum(['project', 'employee', 'task', 'code', 'stage', 'source', 'owner']).optional(),
  })
  .strict();
export type ReportFilters = z.infer<typeof reportSchema>;
const requirements: Record<(typeof reportTypes)[number], Capability> = {
  projects: 'REPORT_VIEW',
  tasks: 'REPORT_VIEW',
  financial: 'JOB_COST_VIEW',
  'cost-codes': 'JOB_COST_VIEW',
  purchasing: 'COMMITMENT_VIEW',
  'change-orders': 'CHANGE_ORDER_VIEW',
  selections: 'SELECTION_VIEW',
  crm: 'CRM_VIEW',
  'follow-ups': 'CRM_VIEW',
  time: 'TIME_APPROVE',
  warranty: 'WARRANTY_VIEW',
  trades: 'TRADE_ACCESS_MANAGE',
  activity: 'REPORT_VIEW',
};
export async function availableReports(actor: Actor) {
  await requireCapability(actor, 'REPORT_VIEW');
  const result = [];
  for (const report of reportTypes) if (await can(actor, requirements[report])) result.push(report);
  return result;
}
export type ReportRow = Record<string, string | number | null>;
export async function runReport(actor: Actor, raw: unknown) {
  const f = reportSchema.parse(raw);
  await requireCapability(actor, 'REPORT_VIEW');
  await requireCapability(actor, requirements[f.report]);
  ensure(
    !(['financial', 'cost-codes'].includes(f.report) && (f.from || f.to || f.overdue)),
    'Financial reports are cumulative snapshots. Clear the date and overdue filters.',
  );
  ensure(
    !f.groupBy ||
      (f.report === 'time'
        ? ['project', 'employee', 'task', 'code'].includes(f.groupBy)
        : f.report === 'crm' && ['stage', 'source', 'owner'].includes(f.groupBy)),
    'Grouping is available for time and pipeline reports only.',
  );
  const scope: Prisma.ProjectWhereInput = {
    AND: [
      await projectScope(actor),
      { archivedAt: null },
      ...(f.projectId ? [{ id: f.projectId }] : []),
      ...(f.ownerId
        ? [
            {
              assignments: {
                some: { userId: f.ownerId, role: 'PRIMARY_PROJECT_MANAGER' as const },
              },
            },
          ]
        : []),
    ],
  };
  const rows: ReportRow[] = [];
  const link = (id: string, tab = '') => `/projects/${id}/${tab}`;
  if (f.report === 'projects')
    for (const p of await db.project.findMany({
      where: scope,
      include: {
        assignments: {
          where: { role: 'PRIMARY_PROJECT_MANAGER' },
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        contacts: {
          where: { role: 'CLIENT' },
          include: { contact: { select: { firstName: true, lastName: true } } },
        },
        scheduleTasks: {
          where: { archivedAt: null, status: { notIn: ['COMPLETE', 'CANCELLED'] } },
          select: { endDate: true },
        },
        selections: {
          where: { status: { in: ['PUBLISHED', 'APPROVAL_REQUIRED'] } },
          select: { id: true },
        },
        warrantyRequests: {
          where: { status: { notIn: ['CLOSED', 'NOT_WARRANTY'] } },
          select: { id: true },
        },
      },
    }))
      rows.push({
        project: p.name,
        number: p.number,
        status: p.status,
        stage: p.stage,
        client: p.contacts.map((c) => `${c.contact.firstName} ${c.contact.lastName}`).join(', '),
        manager: p.assignments.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(', '),
        projectType: p.projectType,
        start: p.startDate?.toISOString() || null,
        due: p.targetCompletion?.toISOString() || null,
        openTasks: p.scheduleTasks.length,
        overdueTasks: p.scheduleTasks.filter((t) => t.endDate && t.endDate < new Date()).length,
        selections: p.selections.length,
        warranty: p.warrantyRequests.length,
        href: link(p.id),
      });
  if (f.report === 'tasks')
    for (const t of await db.projectTask.findMany({
      where: {
        project: scope,
        archivedAt: null,
        ...(f.milestones ? { milestone: true } : {}),
        ...(f.tradeId ? { assignees: { some: { contactId: f.tradeId } } } : {}),
      },
      include: {
        project: { select: { name: true } },
        assignees: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            contact: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { endDate: 'asc' },
    }))
      rows.push({
        project: t.project.name,
        title: t.name,
        status: t.status,
        start: t.startDate?.toISOString() || null,
        due: t.endDate?.toISOString() || null,
        milestone: t.milestone ? 'Yes' : 'No',
        assigned: t.assignees
          .map((a) =>
            a.user
              ? `${a.user.firstName} ${a.user.lastName}`
              : a.contact
                ? `${a.contact.firstName} ${a.contact.lastName}`
                : '',
          )
          .join(', '),
        href: link(t.projectId, 'schedule'),
      });
  if (['financial', 'cost-codes'].includes(f.report))
    for (const p of await db.project.findMany({ where: scope, select: { id: true, name: true } })) {
      const cost = await jobCost(actor, p.id);
      if (f.report === 'financial') {
        const { forecastProfit, forecastMargin, ...summary } = cost.summary;
        rows.push({
          project: p.name,
          ...Object.fromEntries(
            Object.entries({ ...cost.totals, ...summary }).map(([k, v]) => [k, String(v)]),
          ),
          ...((await can(actor, 'FINANCIAL_MARGIN_VIEW'))
            ? { forecastProfit: String(forecastProfit), forecastMargin: String(forecastMargin) }
            : {}),
          href: link(p.id, 'budget'),
        });
      } else
        for (const r of cost.rows)
          rows.push({
            project: p.name,
            code: r.code,
            name: r.name,
            type: r.type,
            original: String(r.original),
            current: String(r.current),
            committed: String(r.committed),
            actual: String(r.actual),
            forecast: String(r.forecast),
            variance: String(r.variance),
            href: link(p.id, 'budget'),
          });
    }
  if (f.report === 'purchasing')
    for (const r of await db.purchasingRevision.findMany({
      where: {
        document: {
          project: scope,
          type: {
            in: [
              ...((await can(actor, 'PURCHASE_ORDER_VIEW')) ? ['PURCHASE_ORDER' as const] : []),
              ...((await can(actor, 'WORK_ORDER_VIEW')) ? ['WORK_ORDER' as const] : []),
            ],
          },
        },
        status: { not: 'SUPERSEDED' },
      },
      include: {
        document: {
          include: {
            project: { select: { name: true } },
            commitment: { include: { lines: true } },
          },
        },
        vendorContact: { select: { firstName: true, lastName: true } },
      },
    }))
      rows.push({
        project: r.document.project.name,
        number: r.document.number,
        type: r.document.type,
        status: r.status,
        vendor: `${r.vendorContact.firstName} ${r.vendorContact.lastName}`,
        amount: String(r.total),
        remaining: String(
          (r.document.commitment?.lines || []).reduce(
            (s, l) => s.add(l.committedAmount.sub(l.consumedAmount)),
            new Prisma.Decimal(0),
          ),
        ),
        acknowledged: r.acknowledgedAt ? 'Yes' : 'No',
        due: r.expectedDate?.toISOString() || null,
        href: link(r.document.projectId, 'purchase-orders'),
      });
  if (f.report === 'change-orders')
    for (const r of await db.changeOrderRevision.findMany({
      where: { changeOrder: { project: scope } },
      include: { changeOrder: { include: { project: { select: { name: true } } } } },
    }))
      rows.push({
        project: r.changeOrder.project.name,
        number: r.changeOrder.number,
        revision: r.revision,
        title: r.title,
        status: r.status,
        amount: String(r.total),
        scheduleDays: r.scheduleDays,
        issued: r.issuedAt?.toISOString() || null,
        accepted: r.acceptedAt?.toISOString() || null,
        href: link(r.changeOrder.projectId, 'change-orders'),
      });
  if (f.report === 'selections')
    for (const s of await db.selection.findMany({
      where: { project: scope },
      include: {
        project: { select: { name: true } },
        allowance: true,
        decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }))
      rows.push({
        project: s.project.name,
        title: s.title,
        status: s.status,
        due: s.deadline?.toISOString() || null,
        allowance: String(s.allowance?.amount || 0),
        decision: s.decisions.length ? 'Recorded' : 'Pending',
        selectedValue: s.decisions.length
          ? String((s.decisions[0].snapshot as Prisma.JsonObject).selectedPrice ?? '')
          : null,
        variance: s.decisions.length
          ? String((s.decisions[0].snapshot as Prisma.JsonObject).variance ?? '')
          : null,
        href: link(s.projectId, 'selections'),
      });
  if (f.report === 'crm')
    for (const o of await db.opportunity.findMany({
      where: { AND: [await crmScope(actor), ...(f.ownerId ? [{ ownerId: f.ownerId }] : [])] },
      include: {
        stage: true,
        source: true,
        owner: { select: { firstName: true, lastName: true } },
      },
    }))
      rows.push({
        title: o.title,
        stage: o.stage.name,
        source: o.source?.name || '',
        status: o.status,
        value: String(o.estimatedValue),
        probability: o.probability,
        owner: `${o.owner.firstName} ${o.owner.lastName}`,
        ownerId: o.ownerId,
        due: o.nextFollowUp?.toISOString() || null,
        closed: o.closedAt?.toISOString() || null,
        converted: o.projectId ? 'Yes' : 'No',
        href: '/leads',
      });
  if (f.report === 'follow-ups')
    for (const a of await db.crmActivity.findMany({
      where: { opportunity: await crmScope(actor) },
      include: { opportunity: { select: { title: true } } },
    }))
      rows.push({
        title: a.title,
        opportunity: a.opportunity.title,
        category: a.category,
        status: a.completedAt ? 'COMPLETE' : 'OPEN',
        due: a.dueAt.toISOString(),
        href: '/leads',
      });
  if (f.report === 'warranty')
    for (const w of await db.warrantyRequest.findMany({
      where: { project: scope, ...(f.tradeId ? { assignedTradeId: f.tradeId } : {}) },
      include: { project: { select: { name: true, warrantyExpirationDate: true } } },
    }))
      rows.push({
        project: w.project.name,
        number: w.number,
        title: w.title,
        status: w.status,
        category: w.category,
        priority: w.priority,
        due: w.dueAt?.toISOString() || null,
        ageDays: Math.floor((Date.now() - +w.createdAt) / 86400000),
        expiration: w.project.warrantyExpirationDate?.toISOString() || null,
        href: link(w.projectId, 'warranty'),
      });
  if (f.report === 'time')
    for (const t of await db.timeSegment.findMany({
      where: { AND: [segmentScope(actor), { jobsite: scope, end: { not: null } }] },
      include: {
        jobsite: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
        task: { select: { name: true } },
        costCode: { select: { code: true } },
      },
    }))
      rows.push({
        project: t.jobsite.name,
        projectId: t.jobsiteId,
        employee: `${t.user.firstName} ${t.user.lastName}`,
        employeeId: t.userId,
        task: t.task?.name || '',
        taskId: t.taskId,
        code: t.costCode?.code || '',
        status: t.status,
        due: t.effectiveStart.toISOString(),
        hours: new Prisma.Decimal(+t.end! - +t.effectiveStart).div(3600000).toFixed(4),
        href: link(t.jobsiteId, 'time'),
      });
  if (f.report === 'trades')
    for (const g of await db.tradeProjectAccess.findMany({
      where: { project: scope },
      include: {
        project: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
      },
    }))
      rows.push({
        project: g.project.name,
        trade: `${g.contact.firstName} ${g.contact.lastName}`,
        status: g.active && !g.revokedAt ? 'ACTIVE' : 'REVOKED',
        href: link(g.projectId, 'trades'),
      });
  if (f.report === 'activity')
    for (const a of await db.auditLog.findMany({
      where: { project: scope },
      select: { id: true, projectId: true, description: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }))
      rows.push({
        description: a.description,
        due: a.createdAt.toISOString(),
        href: link(a.projectId!),
      });
  const filtered = rows.filter(
    (r) =>
      (!f.status || r.status === f.status) &&
      (!f.q || Object.values(r).join(' ').toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.from || (typeof r.due === 'string' && r.due.slice(0, 10) >= f.from)) &&
      (!f.to || (typeof r.due === 'string' && r.due.slice(0, 10) <= f.to)) &&
      (!f.overdue ||
        (typeof r.due === 'string' &&
          new Date(r.due) < new Date() &&
          !['COMPLETE', 'CANCELLED', 'CLOSED', 'CLIENT_VERIFIED', 'FULFILLED', 'ACCEPTED'].includes(
            String(r.status),
          ))),
  );
  return {
    report: f.report,
    rows: f.groupBy
      ? groupReportRows(filtered, f.groupBy, f.report === 'time' ? 'hours' : 'value')
      : filtered,
    generatedAt: new Date().toISOString(),
    basis:
      'Operational CWManagement records; not a general ledger. Date filters apply to the Due/date column. Financial reports are cumulative snapshots.',
  };
}
export function groupReportRows(rows: ReportRow[], group: string, amount: string): ReportRow[] {
  const groups = new Map<
    string,
    { total: Prisma.Decimal; count: number; label: string; id?: string }
  >();
  for (const row of rows) {
    const label = String(row[group] || 'Not specified');
    const id = row[`${group}Id`] ? String(row[`${group}Id`]) : undefined;
    const key = id || label;
    const g = groups.get(key) || { total: new Prisma.Decimal(0), count: 0, label, id };
    g.total = g.total.add(String(row[amount] || 0));
    g.count++;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    [group]: g.label,
    ...(g.id ? { [`${group}Id`]: g.id } : {}),
    records: g.count,
    [amount]: g.total.toFixed(amount === 'hours' ? 4 : 2),
  }));
}
export async function saveReport(actor: Actor, raw: unknown) {
  await requireCapability(actor, 'REPORT_VIEW');
  const i = z
    .object({ name: z.string().trim().min(1).max(100), filters: reportSchema })
    .strict()
    .parse(raw);
  await requireCapability(actor, requirements[i.filters.report]);
  return db.savedReport.upsert({
    where: { userId_name: { userId: actor.id, name: i.name } },
    create: { userId: actor.id, name: i.name, report: i.filters.report, filters: json(i.filters) },
    update: { report: i.filters.report, filters: json(i.filters) },
  });
}
export function reportCsv(rows: ReportRow[]) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'href');
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return (
      '"' + (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
    );
  };
  return [columns, ...rows.map((r) => columns.map((c) => r[c]))]
    .map((r) => r.map(escape).join(','))
    .join('\r\n');
}
