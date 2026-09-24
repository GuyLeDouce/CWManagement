import { z } from 'zod';
import { Actor, can, capabilities, projectScope, requireProjectAccess } from './permissions';
import { db } from './db';
import { ensure } from './errors';
import { money } from './financial-math';
import {
  purchasingList,
  purchasingOptions,
  purchasingSchema,
  savePurchasing,
  purchasingAction,
} from './purchasing';
import {
  changeOrderList,
  changeOrderSchema,
  saveChangeOrder,
  changeOrderAction,
} from './change-orders';
import {
  commitmentLedger,
  actualLedger,
  reconcileActual,
  reconcileSchema,
  reverseActual,
  reversalSchema,
} from './commitments';
import { actualCostSchema, createActualCost, jobCost } from './financial';
import { transitionSchema } from './financial-documents';

export async function financialOverview(actor: Actor, projectId?: string) {
  if (projectId) await requireProjectAccess(actor, projectId);
  const grants = await capabilities(actor);
  const purchases = grants.some((x) => ['PURCHASE_ORDER_VIEW', 'WORK_ORDER_VIEW'].includes(x))
    ? await purchasingList(actor, projectId)
    : [];
  const changes = grants.includes('CHANGE_ORDER_VIEW')
    ? await changeOrderList(actor, projectId)
    : [];
  const scope = await projectScope(actor);
  const commitments = grants.includes('COMMITMENT_VIEW')
    ? await db.commitmentLine.findMany({
        where: {
          commitment: {
            ...(projectId ? { projectId } : {}),
            project: scope,
            status: { in: ['COMMITTED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
          },
        },
      })
    : [];
  const unreconciled = grants.includes('ACTUAL_COST_VIEW')
    ? await db.actualCost.count({
        where: {
          ...(projectId ? { projectId } : {}),
          project: scope,
          reversedAt: null,
          commitmentLineId: null,
        },
      })
    : null;
  const approved = grants.includes('JOB_COST_VIEW')
    ? await db.contractAdjustment.aggregate({
        where: { ...(projectId ? { projectId } : {}), project: scope },
        _sum: { amount: true },
      })
    : null;
  return {
    purchases: purchases.map((x) => ({
      id: x.id,
      projectId: x.projectId,
      project: x.project.name,
      number: x.number,
      title: x.revisions[0]?.title,
      status: x.revisions[0]?.status,
      type: x.type,
    })),
    changes: changes.map((x) => ({
      id: x.id,
      projectId: x.projectId,
      project: x.project.name,
      number: x.number,
      title: x.revisions[0]?.title,
      status: x.revisions[0]?.status,
    })),
    remainingCommitted: grants.includes('COMMITMENT_VIEW')
      ? commitments.reduce((a, x) => a.add(x.committedAmount.sub(x.consumedAmount)), money(0))
      : null,
    approvedChanges: approved ? money(approved._sum.amount || 0) : null,
    unreconciled,
  };
}
export async function dispatchFinancialOperations(
  actor: Actor,
  get: boolean,
  path: string,
  params: Record<string, string>,
  body: unknown,
) {
  const projectId = () => z.string().min(1).parse(params.projectId);
  if (get && path === 'overview') return financialOverview(actor, params.projectId);
  if (get && path === 'options') return purchasingOptions(actor, projectId());
  if (get && path === 'purchasing') return { documents: await purchasingList(actor, projectId()) };
  if (get && path === 'changes') return { documents: await changeOrderList(actor, projectId()) };
  if (get && path === 'commitments')
    return { commitments: await commitmentLedger(actor, projectId()) };
  if (get && path === 'actuals') return { actuals: await actualLedger(actor, projectId()) };
  if (get && path === 'budget-history') {
    ensure(await can(actor, 'BUDGET_VIEW'), 'Budget access required.', 403);
    await requireProjectAccess(actor, projectId());
    return {
      budgets: await db.budget.findMany({
        where: { projectId: projectId() },
        include: { versions: { orderBy: { version: 'desc' }, include: { lines: true } } },
      }),
    };
  }
  if (get && path === 'variance') {
    ensure(await can(actor, 'JOB_COST_VIEW'), 'Job cost access required.', 403);
    const projects = await db.project.findMany({
      where: { ...(await projectScope(actor)), archivedAt: null },
      select: { id: true, name: true },
    });
    const reports = await Promise.all(
      projects.map(async (p) => ({ project: p, report: await jobCost(actor, p.id) })),
    );
    return {
      alerts: reports
        .filter((x) => x.report.totals.variance.lt(0))
        .map((x) => ({ project: x.project, variance: x.report.totals.variance })),
    };
  }
  if (!get && path === 'purchasing') return savePurchasing(actor, purchasingSchema.parse(body));
  if (!get && path === 'purchasing/action')
    return purchasingAction(actor, transitionSchema.parse(body));
  if (!get && path === 'changes') return saveChangeOrder(actor, changeOrderSchema.parse(body));
  if (!get && path === 'changes/action')
    return changeOrderAction(actor, transitionSchema.parse(body));
  if (!get && path === 'actuals') return createActualCost(actor, actualCostSchema.parse(body));
  if (!get && path === 'actuals/reconcile')
    return reconcileActual(actor, reconcileSchema.parse(body));
  if (!get && path === 'actuals/reverse') return reverseActual(actor, reversalSchema.parse(body));
  ensure(false, 'Financial operation not found.', 404);
}
