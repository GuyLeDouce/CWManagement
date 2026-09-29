import { z } from 'zod';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { db } from './db';
import { AppError } from './errors';
import { crm, saveOpportunity, saveCrmActivity, configureCrm } from './crm';
import { internalWarranty, createWarranty, actWarranty } from './warranty';
import { availableReports, runReport, saveReport } from './portfolio-reports';
import { automationSettings, reviewDelivery } from './automation';
import { businessDashboard } from './business-dashboard';
import { storageConfigured, storageDriver } from './storage';
export async function dispatchBusiness(
  actor: Actor,
  get: boolean,
  path: string,
  params: Record<string, string>,
  body: unknown,
) {
  if (get && path === 'dashboard') return businessDashboard(actor);
  if (!get && path === 'automation/review') return reviewDelivery(actor, body);
  if (get && path === 'readiness') {
    await requireCapability(actor, 'SETTINGS_MANAGE');
    await db.$queryRaw`SELECT 1`;
    const migrations = await db.$queryRaw<
      { migration_name: string }[]
    >`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1`;
    return {
      database: true,
      latestMigration: migrations[0]?.migration_name || null,
      storageConfigured: storageConfigured(),
      storageDriver: storageDriver(),
      automationConfigured: (process.env.AUTOMATION_SECRET?.length || 0) >= 32,
    };
  }
  if (path === 'crm') return get ? crm(actor) : saveOpportunity(actor, body);
  if (!get && path === 'crm/activity') return saveCrmActivity(actor, body);
  if (!get && path === 'crm/configure') return configureCrm(actor, body);
  if (path === 'warranty')
    return get
      ? { requests: await internalWarranty(actor, params.projectId) }
      : createWarranty(actor, body);
  if (!get && path === 'warranty/action') return actWarranty(actor, body);
  if (get && path === 'warranty/options') {
    const projectId = z.string().min(1).parse(params.projectId);
    await requireCapability(actor, 'WARRANTY_VIEW');
    await requireProjectAccess(actor, projectId);
    return {
      contacts: await db.projectContact.findMany({
        where: { projectId },
        select: { role: true, contact: { select: { id: true, firstName: true, lastName: true } } },
      }),
      users: await db.projectAssignment.findMany({
        where: { projectId, user: { active: true } },
        select: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      project: await db.project.findUnique({
        where: { id: projectId },
        select: {
          warrantyStartDate: true,
          warrantyExpirationDate: true,
          weeklyClientSummaryEnabled: true,
        },
      }),
    };
  }
  if (get && path === 'reports')
    return {
      reports: await availableReports(actor),
      saved: await db.savedReport.findMany({
        where: { userId: actor.id },
        orderBy: { name: 'asc' },
      }),
    };
  if (!get && path === 'reports/run') return runReport(actor, body);
  if (!get && path === 'reports/save') return saveReport(actor, body);
  if (path === 'automation') return automationSettings(actor, get ? undefined : body);
  throw new AppError(404, 'Business action unavailable.');
}
