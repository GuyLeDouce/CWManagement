import { Prisma } from '@prisma/client';
import { db } from './db';
import { Actor, can, projectScope } from './permissions';
import { crmScope } from './crm';
import { jobCost } from './financial';
export async function businessDashboard(actor: Actor) {
  const scope = await projectScope(actor),
    cards: { label: string; value: string; href: string }[] = [];
  cards.push({
    label: 'Projects past target',
    value: String(
      await db.project.count({
        where: {
          AND: [
            scope,
            {
              archivedAt: null,
              targetCompletion: { lt: new Date() },
              status: { notIn: ['COMPLETE', 'ARCHIVED', 'WARRANTY'] },
            },
          ],
        },
      }),
    ),
    href: '/reports',
  });
  if (await can(actor, 'CRM_VIEW')) {
    const pipeline = await db.opportunity.aggregate({
      where: { ...(await crmScope(actor)), status: 'OPEN' },
      _count: true,
      _sum: { estimatedValue: true },
    });
    cards.push(
      { label: 'Open opportunities', value: String(pipeline._count), href: '/leads' },
      {
        label: 'Entered pipeline value',
        value: String(pipeline._sum.estimatedValue || 0),
        href: '/leads',
      },
    );
  }
  if (await can(actor, 'WARRANTY_VIEW')) {
    cards.push({
      label: 'Open service requests',
      value: String(
        await db.warrantyRequest.count({
          where: { project: scope, status: { notIn: ['CLOSED', 'NOT_WARRANTY'] } },
        }),
      ),
      href: '/reports',
    });
    cards.push({
      label: 'Overdue service requests',
      value: String(
        await db.warrantyRequest.count({
          where: {
            project: scope,
            status: { notIn: ['CLOSED', 'NOT_WARRANTY', 'CLIENT_VERIFIED'] },
            dueAt: { lt: new Date() },
          },
        }),
      ),
      href: '/reports',
    });
  }
  if (await can(actor, 'QUICKBOOKS_VIEW'))
    cards.push({
      label: 'QuickBooks exceptions',
      value: String(
        await db.quickBooksSyncJob.count({ where: { status: { in: ['FAILED', 'BLOCKED'] } } }),
      ),
      href: '/financials/quickbooks',
    });
  if (await can(actor, 'JOB_COST_VIEW')) {
    let contract = new Prisma.Decimal(0),
      forecast = new Prisma.Decimal(0),
      over = 0;
    for (const p of await db.project.findMany({
      where: {
        AND: [
          scope,
          {
            active: true,
            overhead: false,
            archivedAt: null,
            status: { notIn: ['COMPLETE', 'ARCHIVED', 'WARRANTY'] },
          },
        ],
      },
      select: { id: true },
    })) {
      const r = await jobCost(actor, p.id);
      contract = contract.add(r.summary.contract);
      forecast = forecast.add(r.totals.forecast);
      if (r.totals.variance.lt(0)) over++;
    }
    cards.push(
      {
        label: 'Active portfolio contract (pre-tax)',
        value: contract.toFixed(2),
        href: '/reports',
      },
      { label: 'Forecast cost', value: forecast.toFixed(2), href: '/reports' },
      { label: 'Projects over budget forecast', value: String(over), href: '/reports' },
    );
    if (await can(actor, 'FINANCIAL_MARGIN_VIEW'))
      cards.push({
        label: 'Forecast margin',
        value: contract.eq(0)
          ? '—'
          : `${contract.sub(forecast).div(contract).mul(100).toFixed(2)}%`,
        href: '/reports',
      });
  }
  return { cards };
}
