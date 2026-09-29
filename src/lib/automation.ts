import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { db, transaction, audit, Tx } from './db';
import { Actor, can, requireCapability, requireProjectAccess } from './permissions';
import { isExternal } from './external-identity';
import { requireClientProjectAccess } from './client-access';
import { requireTradeProjectAccess, tradeTaskScope } from './trade-access';
import { appUrl, sendEmail, checkEmailConfiguration } from './email';
import { ensure } from './errors';
import { requireOpportunity } from './crm';
import { clientProject } from './client-projections';
import { workQueue } from './productivity';

type Candidate = {
  userId: string;
  projectId?: string;
  kind: string;
  entityId: string;
  title: string;
  actionUrl: string;
  period: string;
};
// Recheck at generation AND delivery: queued mail cannot outlive revoked access.
export async function deliveryAllowed(tx: Tx, c: Omit<Candidate, 'period'>) {
  const u = await tx.user.findUnique({ where: { id: c.userId } });
  if (!u?.active) return false;
  try {
    if (c.kind === 'CRM') {
      const a = await tx.crmActivity.findUnique({ where: { id: c.entityId } });
      if (!a || a.completedAt) return false;
      await requireOpportunity(u, a.opportunityId, tx);
      return true;
    }
    if (c.kind === 'QUICKBOOKS') return !isExternal(u) && (await can(u, 'QUICKBOOKS_VIEW', tx));
    if (c.kind === 'DIGEST') return !isExternal(u) && u.dailyDigestEnabled;
    if (!c.projectId) return false;
    if (!isExternal(u)) {
      await requireProjectAccess(u, c.projectId, tx);
      if (c.kind === 'WARRANTY') await requireCapability(u, 'WARRANTY_VIEW', tx);
      if (c.kind === 'SELECTION') await requireCapability(u, 'SELECTION_VIEW', tx);
      return true;
    }
    if (u.roles.includes('CLIENT')) {
      const g = await requireClientProjectAccess(u, c.projectId, tx);
      if (c.kind === 'SUMMARY')
        return !!(await tx.project.findFirst({
          where: { id: c.projectId, weeklyClientSummaryEnabled: true },
        }));
      if (c.kind === 'WARRANTY')
        return !!(await tx.warrantyRequest.findFirst({
          where: {
            id: c.entityId,
            projectId: c.projectId,
            clientContactId: g.contactId,
            status: { notIn: ['CLOSED', 'NOT_WARRANTY'] },
          },
        }));
      if (c.kind === 'SELECTION')
        return !!(await tx.selection.findFirst({
          where: {
            id: c.entityId,
            projectId: c.projectId,
            publishedAt: { not: null },
            status: 'PUBLISHED',
          },
        }));
      return false;
    }
    const g = await requireTradeProjectAccess(u, c.projectId, tx);
    if (c.kind === 'WARRANTY')
      return !!(await tx.warrantyRequest.findFirst({
        where: {
          id: c.entityId,
          projectId: c.projectId,
          assignedTradeId: g.contactId,
          status: { in: ['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'] },
        },
      }));
    if (c.kind === 'TASK')
      return !!(await tx.projectTask.findFirst({
        where: {
          id: c.entityId,
          projectId: c.projectId,
          ...tradeTaskScope(g.contactId),
          status: { notIn: ['COMPLETE', 'CANCELLED'] },
        },
      }));
    if (c.kind === 'PURCHASING')
      return !!(await tx.purchasingRevision.findFirst({
        where: {
          id: c.entityId,
          document: { projectId: c.projectId },
          vendorContactId: g.contactId,
          issuedAt: { not: null },
          acknowledgedAt: null,
          status: { in: ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
        },
      }));
    if (c.kind === 'DEFICIENCY')
      return !!(await tx.deficiency.findFirst({
        where: {
          id: c.entityId,
          projectId: c.projectId,
          assignedContactId: g.contactId,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
        },
      }));
    if (c.kind === 'INSTRUCTION')
      return !!(await tx.siteInstruction.findFirst({
        where: {
          id: c.entityId,
          projectId: c.projectId,
          status: 'ISSUED',
          recipients: { some: { contactId: g.contactId } },
        },
      }));
    return false;
  } catch {
    return false;
  }
}
export async function enqueueReminder(c: Candidate, emailEnabled: boolean) {
  return transaction(async (tx) => {
    const dedupeKey = [c.kind, c.entityId, c.userId, c.period].join(':');
    if (
      (await tx.deliveryRecord.findUnique({ where: { dedupeKey } })) ||
      !(await deliveryAllowed(tx, c))
    )
      return false;
    await tx.deliveryRecord.create({
      data: {
        dedupeKey,
        userId: c.userId,
        projectId: c.projectId,
        kind: c.kind,
        entityId: c.entityId,
        title: c.title,
        actionUrl: c.actionUrl,
        status: emailEnabled ? 'PENDING' : 'IN_APP',
      },
    });
    await tx.notification.create({
      data: {
        userId: c.userId,
        projectId: c.projectId,
        type: 'GENERAL',
        title: c.title,
        message: 'Open CWManagement to review the current details.',
        actionUrl: c.actionUrl,
      },
    });
    return true;
  });
}
export async function runAutomation(now = new Date()) {
  const token = randomUUID();
  const lease = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('cw-automation',0))`;
    const old = await tx.automationLease.findUnique({ where: { id: 'reminders' } });
    if (old && old.expiresAt > now) return false;
    await tx.automationLease.upsert({
      where: { id: 'reminders' },
      create: { id: 'reminders', token, expiresAt: new Date(+now + 600000) },
      update: { token, expiresAt: new Date(+now + 600000) },
    });
    return true;
  });
  if (!lease) return { busy: true };
  const run = await db.automationRun.create({ data: {} });
  let generated = 0,
    delivered = 0;
  try {
    const settings = await db.settings.findUniqueOrThrow({ where: { id: 'company' } });
    if (!settings.automationEnabled) {
      await db.automationRun.update({
        where: { id: run.id },
        data: { status: 'DISABLED', completedAt: now },
      });
      return { disabled: true };
    }
    const day = DateTime.fromJSDate(now).setZone(settings.timezone),
      period = day.toISODate()!,
      week = `${day.weekYear}-${day.weekNumber}`;
    const soon = new Date(+now + 7 * 86400000);
    const emit = async (c: Omit<Candidate, 'period'>, key = period) => {
      const renewed = await db.automationLease.updateMany({
        where: { id: 'reminders', token, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date(Date.now() + 600000) },
      });
      ensure(renewed.count === 1, 'Scheduled lease expired.');
      if (await enqueueReminder({ ...c, period: key }, settings.automationEmailEnabled))
        generated++;
    };
    const staff = async (projectId: string, kind: string, entityId: string, title: string) => {
      for (const a of await db.projectAssignment.findMany({
        where: { projectId, role: 'PRIMARY_PROJECT_MANAGER' },
      }))
        await emit({
          userId: a.userId,
          projectId,
          kind,
          entityId,
          title,
          actionUrl: `/projects/${projectId}/${kind === 'WARRANTY' ? 'warranty' : kind === 'SELECTION' ? 'selections' : 'schedule'}`,
        });
    };
    const clients = async (projectId: string, kind: string, entityId: string, title: string) => {
      for (const g of await db.clientProjectAccess.findMany({
        where: { projectId, active: true, revokedAt: null },
      }))
        await emit({
          userId: g.userId,
          projectId,
          kind,
          entityId,
          title,
          actionUrl: `/client/projects/${projectId}/${kind === 'WARRANTY' ? 'warranty' : 'selections'}`,
        });
    };
    const trades = async (
      projectId: string,
      contactId: string,
      kind: string,
      entityId: string,
      title: string,
    ) => {
      for (const g of await db.tradeProjectAccess.findMany({
        where: { projectId, contactId, active: true, revokedAt: null },
      }))
        await emit({
          userId: g.userId,
          projectId,
          kind,
          entityId,
          title,
          actionUrl: `/trade/projects/${projectId}/${kind === 'WARRANTY' ? 'warranty' : kind === 'TASK' ? 'schedule' : kind === 'DEFICIENCY' ? 'deficiencies' : kind === 'INSTRUCTION' ? 'instructions' : 'work'}`,
        });
    };
    for (const s of await db.selection.findMany({
      where: { status: 'PUBLISHED', deadline: { lte: soon }, publishedAt: { not: null } },
    })) {
      const renewed = await db.automationLease.updateMany({
        where: { id: 'reminders', token, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date(Date.now() + 600000) },
      });
      ensure(renewed.count === 1, 'Scheduled lease expired.');
      await staff(s.projectId, 'SELECTION', s.id, 'Selection decision due');
      await clients(s.projectId, 'SELECTION', s.id, 'A selection needs your attention');
    }
    for (const t of await db.projectTask.findMany({
      where: {
        archivedAt: null,
        status: { notIn: ['COMPLETE', 'CANCELLED'] },
        endDate: { lte: soon },
      },
      include: { assignees: true, tradeReleases: true },
    })) {
      for (const a of t.assignees) {
        if (a.userId)
          await emit({
            userId: a.userId,
            projectId: t.projectId,
            kind: 'TASK',
            entityId: t.id,
            title: 'Assigned task due',
            actionUrl: `/projects/${t.projectId}/schedule`,
          });
        if (a.contactId)
          await trades(t.projectId, a.contactId, 'TASK', t.id, 'Scheduled work reminder');
      }
      for (const r of t.tradeReleases)
        await trades(t.projectId, r.contactId, 'TASK', t.id, 'Scheduled work reminder');
    }
    for (const r of await db.purchasingRevision.findMany({
      where: {
        issuedAt: { not: null },
        acknowledgedAt: null,
        status: { in: ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
      },
      include: { document: true },
    }))
      await trades(
        r.document.projectId,
        r.vendorContactId,
        'PURCHASING',
        r.id,
        'Issued work awaiting acknowledgement',
      );
    for (const d of await db.deficiency.findMany({
      where: { dueDate: { lte: soon }, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    }))
      if (d.assignedContactId)
        await trades(
          d.projectId,
          d.assignedContactId,
          'DEFICIENCY',
          d.id,
          'Deficiency needs attention',
        );
    for (const i of await db.siteInstruction.findMany({
      where: { status: 'ISSUED', acknowledgementRequired: true },
      include: { recipients: true },
    }))
      for (const r of i.recipients)
        await trades(
          i.projectId,
          r.contactId,
          'INSTRUCTION',
          i.id,
          'Site instruction awaiting acknowledgement',
        );
    for (const w of await db.warrantyRequest.findMany({
      where: {
        status: { notIn: ['CLOSED', 'NOT_WARRANTY'] },
        OR: [
          { dueAt: { lte: soon } },
          { status: { in: ['SUBMITTED', 'REVIEWING', 'READY_FOR_REVIEW', 'READY_FOR_CLIENT'] } },
        ],
      },
    })) {
      await staff(w.projectId, 'WARRANTY', w.id, 'Service request needs attention');
      if (w.status === 'READY_FOR_CLIENT')
        await clients(w.projectId, 'WARRANTY', w.id, 'Please review completed service work');
      if (w.assignedTradeId)
        await trades(
          w.projectId,
          w.assignedTradeId,
          'WARRANTY',
          w.id,
          'Service work needs attention',
        );
    }
    for (const p of await db.project.findMany({
      where: {
        active: true,
        archivedAt: null,
        warrantyExpirationDate: { gte: now, lte: new Date(+now + 30 * 86400000) },
      },
    }))
      await staff(p.id, 'EXPIRATION', p.id, 'Project warranty date approaching');
    for (const a of await db.crmActivity.findMany({
      where: { completedAt: null, dueAt: { lte: soon } },
    }))
      await emit({
        userId: a.ownerId,
        kind: 'CRM',
        entityId: a.id,
        title: 'Sales follow-up due',
        actionUrl: '/leads',
      });
    for (const u of await db.user.findMany({ where: { active: true, dailyDigestEnabled: true } }))
      if (!isExternal(u))
        await emit({
          userId: u.id,
          kind: 'DIGEST',
          entityId: u.id,
          title: 'Your daily work review',
          actionUrl: '/my-work',
        });
    for (const p of await db.project.findMany({
      where: { active: true, archivedAt: null, weeklyClientSummaryEnabled: true },
      include: { portalAccess: { where: { active: true, revokedAt: null } } },
    }))
      for (const g of p.portalAccess)
        await emit(
          {
            userId: g.userId,
            projectId: p.id,
            kind: 'SUMMARY',
            entityId: p.id,
            title: 'Your weekly project review',
            actionUrl: `/client/projects/${p.id}`,
          },
          week,
        );
    for (const c of await db.quickBooksConnection.findMany({ where: { active: true } })) {
      const blocked = await db.quickBooksSyncJob.count({
        where: { connectionId: c.id, status: { in: ['BLOCKED', 'FAILED'] } },
      });
      if (
        blocked ||
        !c.lastConnectedAt ||
        +c.lastConnectedAt < +now - Math.max(120, c.intervalMinutes * 3) * 60000
      )
        for (const u of await db.user.findMany({
          where: { active: true, roles: { hasSome: ['OWNER', 'CONTROLLER'] } },
        }))
          await emit({
            userId: u.id,
            kind: 'QUICKBOOKS',
            entityId: c.id,
            title: 'QuickBooks connection needs review',
            actionUrl: '/financials/quickbooks',
          });
    }
    // A process dying during SMTP is uncertain, not proof of failure. Never blindly resend.
    await db.deliveryRecord.updateMany({
      where: { status: 'SENDING' },
      data: {
        status: 'REVIEW_REQUIRED',
        safeError: 'Delivery outcome uncertain. Review before retry.',
      },
    });
    if (settings.automationEmailEnabled)
      for (const d of await db.deliveryRecord.findMany({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          availableAt: { lte: now },
          attempts: { lt: 5 },
        },
        take: 15,
        orderBy: { createdAt: 'asc' },
      })) {
        const allowed = await deliveryAllowed(db, { ...d, projectId: d.projectId || undefined });
        if (!allowed) {
          await db.deliveryRecord.update({ where: { id: d.id }, data: { status: 'CANCELLED' } });
          continue;
        }
        try {
          checkEmailConfiguration();
        } catch {
          await db.deliveryRecord.update({
            where: { id: d.id },
            data: {
              status: 'FAILED',
              attempts: { increment: 1 },
              safeError: 'Email configuration unavailable.',
              availableAt: new Date(+now + 3600000),
            },
          });
          continue;
        }
        await db.deliveryRecord.update({
          where: { id: d.id },
          data: { status: 'SENDING', attempts: { increment: 1 } },
        });
        try {
          const u = await db.user.findUniqueOrThrow({ where: { id: d.userId } });
          let summary = 'Open your secure workspace to review current details.';
          if (d.kind === 'SUMMARY' && d.projectId) {
            const p = await clientProject(u, d.projectId);
            summary = `Your project review: ${p.schedule.filter((t) => t.milestone && t.status !== 'COMPLETE').length} upcoming published milestones, ${p.updates.length} published updates, ${p.files.filter((f) => f.kind === 'PHOTO').length} shared photos, ${p.selections.filter((s) => s.status === 'PUBLISHED').length} selections awaiting a decision, and ${p.changeOrders.filter((c) => c.status === 'ISSUED').length} changes awaiting review. Open the portal for dates and details.`;
          }
          if (d.kind === 'DIGEST') {
            const q = await workQueue(u, true);
            summary = `Your work review: ${q.tasks.length} assigned open tasks, ${q.followUps.length} sales follow-ups, ${q.warranty.length} assigned service requests and ${q.notifications.length} unread notifications. Open My Work for current priorities.`;
          }
          await sendEmail({
            to: u.email,
            subject: d.title,
            text: `${summary}\n${appUrl()}${d.actionUrl}`,
          });
          await db.deliveryRecord.update({
            where: { id: d.id },
            data: { status: 'DELIVERED', deliveredAt: new Date(), safeError: null },
          });
          delivered++;
        } catch {
          await db.deliveryRecord.update({
            where: { id: d.id },
            data: {
              status: 'REVIEW_REQUIRED',
              safeError: 'SMTP result requires review before retry.',
            },
          });
        }
      }
    await db.automationRun.update({
      where: { id: run.id },
      data: { status: 'SUCCEEDED', completedAt: new Date(), generated, delivered },
    });
    return { generated, delivered };
  } catch {
    await db.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        safeError: 'Scheduled processing failed.',
      },
    });
    throw new Error('Scheduled processing failed.');
  } finally {
    await db.automationLease.deleteMany({ where: { id: 'reminders', token } });
  }
}
export async function automationSettings(actor: Actor, raw?: unknown) {
  if (raw) {
    const i = z
      .object({
        dailyDigestEnabled: z.boolean().optional(),
        automationEnabled: z.boolean().optional(),
        automationEmailEnabled: z.boolean().optional(),
        projectId: z.string().optional(),
        weeklyClientSummaryEnabled: z.boolean().optional(),
        warrantyStartDate: z.iso.date().nullable().optional(),
        warrantyExpirationDate: z.iso.date().nullable().optional(),
      })
      .strict()
      .parse(raw);
    return transaction(async (tx) => {
      ensure(!isExternal(actor), 'Internal settings required.', 403);
      if (i.dailyDigestEnabled !== undefined)
        await tx.user.update({
          where: { id: actor.id },
          data: { dailyDigestEnabled: i.dailyDigestEnabled },
        });
      if (i.automationEnabled !== undefined || i.automationEmailEnabled !== undefined) {
        await requireCapability(actor, 'AUTOMATION_MANAGE', tx);
        await tx.settings.update({
          where: { id: 'company' },
          data: {
            automationEnabled: i.automationEnabled,
            automationEmailEnabled: i.automationEmailEnabled,
          },
        });
      }
      if (i.projectId) {
        await requireCapability(actor, 'WARRANTY_MANAGE', tx);
        await requireProjectAccess(actor, i.projectId, tx);
        if (i.weeklyClientSummaryEnabled !== undefined)
          await requireCapability(actor, 'CLIENT_CONTENT_PUBLISH', tx);
        const p = await tx.project.findUniqueOrThrow({ where: { id: i.projectId } });
        const start =
          i.warrantyStartDate === undefined
            ? p.warrantyStartDate
            : i.warrantyStartDate
              ? new Date(i.warrantyStartDate)
              : null;
        const end =
          i.warrantyExpirationDate === undefined
            ? p.warrantyExpirationDate
            : i.warrantyExpirationDate
              ? new Date(i.warrantyExpirationDate)
              : null;
        ensure(
          !start || !end || start <= end,
          'Warranty expiration must be on or after its start date.',
        );
        await tx.project.update({
          where: { id: i.projectId },
          data: {
            weeklyClientSummaryEnabled: i.weeklyClientSummaryEnabled,
            warrantyStartDate: i.warrantyStartDate
              ? new Date(i.warrantyStartDate)
              : i.warrantyStartDate,
            warrantyExpirationDate: i.warrantyExpirationDate
              ? new Date(i.warrantyExpirationDate)
              : i.warrantyExpirationDate,
          },
        });
      }
      await audit(
        tx,
        actor.id,
        'REMINDER_SETTINGS_UPDATED',
        'Settings',
        i.projectId || actor.id,
        null,
        i,
      );
      return { saved: true };
    });
  }
  ensure(!isExternal(actor), 'Internal settings required.', 403);
  return {
    dailyDigestEnabled: actor.dailyDigestEnabled,
    ...((await can(actor, 'AUTOMATION_MANAGE'))
      ? {
          settings: await db.settings.findUnique({
            where: { id: 'company' },
            select: { automationEnabled: true, automationEmailEnabled: true },
          }),
          runs: await db.automationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
          deliveries: await db.deliveryRecord.findMany({
            where: { status: { in: ['FAILED', 'REVIEW_REQUIRED'] } },
            select: { id: true, status: true, safeError: true, attempts: true, createdAt: true },
            take: 50,
          }),
        }
      : {}),
  };
}
export async function reviewDelivery(actor: Actor, raw: unknown) {
  const i = z
    .object({
      id: z.string(),
      action: z.enum(['retry', 'cancel']),
      reason: z.string().trim().min(10).max(2000),
      acknowledgeDuplicateRisk: z.boolean().default(false),
    })
    .strict()
    .parse(raw);
  return transaction(async (tx) => {
    await requireCapability(actor, 'AUTOMATION_MANAGE', tx);
    const d = await tx.deliveryRecord.findUnique({ where: { id: i.id } });
    ensure(
      d && ['FAILED', 'REVIEW_REQUIRED'].includes(d.status),
      'Delivery is not awaiting review.',
      409,
    );
    if (i.action === 'retry' && d.status === 'REVIEW_REQUIRED')
      ensure(
        i.acknowledgeDuplicateRisk,
        'Confirm the provider outcome first; retry may duplicate an accepted email.',
      );
    await tx.deliveryRecord.update({
      where: { id: d.id },
      data: {
        status: i.action === 'retry' ? 'PENDING' : 'CANCELLED',
        attempts: i.action === 'retry' ? 0 : d.attempts,
        availableAt: new Date(),
        safeError: null,
      },
    });
    await audit(
      tx,
      actor.id,
      'DELIVERY_REVIEWED',
      'DeliveryRecord',
      d.id,
      { status: d.status },
      { action: i.action },
      i.reason,
    );
    return { saved: true };
  });
}
