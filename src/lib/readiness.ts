import { randomUUID } from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { db, transaction, audit } from './db';
import { Actor, requireRole } from './permissions';
import { isExternal } from './external-identity';
import { ensure } from './errors';
import { privateKey, randomToken, digest } from './crypto';
import { storage, storageDriver, storageConfigured } from './storage';
import { checkEmailConfiguration, sendEmail, appUrl } from './email';
import { rateLimit, SESSION_COOKIE } from './auth';
import { rolloutStage } from './automation-rollout';
import { runAutomation } from './automation';

export function requireReadiness(actor: Actor) {
  ensure(actor.active && !isExternal(actor), 'Internal operator required.', 403);
  requireRole(actor, 'OWNER', 'CONTROLLER');
}
const object = (value: Prisma.JsonValue | null) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Prisma.JsonObject) : {};
export function configurationFingerprint(kind: 'storage' | 'email') {
  const names =
    kind === 'storage'
      ? [
          'STORAGE_DRIVER',
          'STORAGE_S3_BUCKET',
          'STORAGE_S3_REGION',
          'STORAGE_S3_ENDPOINT',
          'STORAGE_S3_ACCESS_KEY_ID',
          'STORAGE_S3_SECRET_ACCESS_KEY',
          'STORAGE_S3_PATH_STYLE',
        ]
      : [
          'EMAIL_PROVIDER',
          'EMAIL_FROM',
          'SMTP_HOST',
          'SMTP_PORT',
          'SMTP_USER',
          'SMTP_PASSWORD',
          'SMTP_SECURE',
        ];
  return privateKey(
    JSON.stringify([process.env.NODE_ENV, ...names.map((n) => process.env[n] || '')]),
  );
}
async function record(actor: Actor, kind: string, id: string, data: unknown) {
  await audit(db, actor.id, `READINESS_${kind}`, 'Readiness', id, null, data);
}
async function begin(actor: Actor, kind: string, id: string) {
  requireReadiness(actor);
  z.uuid().parse(id);
  return transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`readiness:${actor.id}:${id}`},0))`;
    const prior = await tx.auditLog.findFirst({
      where: { entity: 'Readiness', entityId: id, action: `READINESS_${kind}_START` },
    });
    if (prior) return false;
    await audit(tx, actor.id, `READINESS_${kind}_START`, 'Readiness', id, null, {
      state: 'STARTED',
    });
    return true;
  });
}
export async function readiness(actor: Actor) {
  requireReadiness(actor);
  await db.$queryRaw`SELECT 1`;
  const migrations = await db.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >`SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
  const s = await db.settings.findUniqueOrThrow({
    where: { id: 'company' },
    select: { automationEnabled: true, automationEmailEnabled: true },
  });
  let emailConfigured = false;
  try {
    checkEmailConfiguration();
    emailConfigured = process.env.EMAIL_PROVIDER === 'smtp';
  } catch {}
  const evidence = await db.auditLog.findMany({
    where: {
      entity: 'Readiness',
      action: {
        in: ['READINESS_STORAGE_RESULT', 'READINESS_EMAIL_RESULT', 'READINESS_EMAIL_CONFIRMED'],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const latest = (kind: 'storage' | 'email') =>
    evidence.find(
      (e) =>
        e.action === `READINESS_${kind.toUpperCase()}_RESULT` &&
        object(e.after).fingerprint === configurationFingerprint(kind),
    );
  const st = latest('storage'),
    em = latest('email');
  const summarize = (e: typeof st) =>
    e
      ? {
          state: object(e.after).state,
          date: e.createdAt,
          checks: object(e.after).checks,
          requestId: e.entityId,
          message: object(e.after).message,
        }
      : null;
  const storageTests = await db.auditLog.findMany({
    where: { entity: 'Readiness', action: 'READINESS_STORAGE_PROJECT' },
    select: { entityId: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const cleaned = await db.auditLog.findMany({
    where: {
      entity: 'Readiness',
      action: 'READINESS_STORAGE_CLEANED',
      entityId: { in: storageTests.map((e) => e.entityId) },
    },
    select: { entityId: true },
  });
  const lastRun = await db.automationRun.findFirst({ orderBy: { startedAt: 'desc' } });
  const interval = Number(process.env.AUTOMATION_EXPECTED_INTERVAL_MINUTES);
  return {
    application: {
      deployment: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) || 'Not supplied',
      database: true,
      migrations: migrations.length,
      pendingOrFailed: migrations.filter((m) => !m.finished_at && !m.rolled_back_at).length,
      latestMigration: migrations.at(-1)?.migration_name,
    },
    storage: {
      state: !storageConfigured()
        ? 'NOT_CONFIGURED'
        : object(st?.after || null).state === 'VERIFIED'
          ? 'VERIFIED'
          : object(st?.after || null).state === 'ERROR'
            ? 'ERROR'
            : 'CONFIGURED',
      lastTest: summarize(st),
      pendingCleanup: storageTests
        .filter((e) => !cleaned.some((c) => c.entityId === e.entityId))
        .map((e) => e.entityId),
    },
    email: {
      state: !emailConfigured
        ? 'NOT_CONFIGURED'
        : object(em?.after || null).state === 'LIVE_TESTED'
          ? 'LIVE_TESTED'
          : object(em?.after || null).state === 'ERROR'
            ? 'ERROR'
            : 'CONFIGURED',
      lastTest: summarize(em),
      inboxConfirmed:
        !!em &&
        evidence.some(
          (e) => e.action === 'READINESS_EMAIL_CONFIRMED' && e.entityId === em.entityId,
        ),
    },
    automation: {
      ...s,
      rolloutStage: rolloutStage(),
      secretConfigured: (process.env.AUTOMATION_SECRET?.length || 0) >= 32,
      lastRun,
      lastTest: await db.automationRun.findFirst({
        where: { status: 'TEST_SUCCEEDED' },
        orderBy: { startedAt: 'desc' },
      }),
      nextExpected:
        lastRun && Number.isFinite(interval) && interval > 0
          ? new Date(+lastRun.startedAt + interval * 60000)
          : null,
      failures: await db.deliveryRecord.count({
        where: { status: { in: ['FAILED', 'REVIEW_REQUIRED'] } },
      }),
    },
    quickBooks: await db.quickBooksConnection.findMany({
      select: {
        id: true,
        name: true,
        mode: true,
        lastConnectedAt: true,
        lastSuccessfulSyncAt: true,
      },
      where: { active: true },
    }),
  };
}
export async function testEmail(actor: Actor, id: string) {
  if (!(await begin(actor, 'EMAIL', id)))
    return {
      state: 'ALREADY_REQUESTED',
      message: 'This request was already attempted. Review its result before creating a new test.',
    };
  await rateLimit(`readiness-email:${actor.id}`, 3, 3600);
  const fingerprint = configurationFingerprint('email');
  try {
    ensure(process.env.EMAIL_PROVIDER === 'smtp', 'SMTP is not configured.', 503);
    checkEmailConfiguration();
    await sendEmail({
      to: actor.email,
      subject: 'CWManagement production email test',
      text: 'This is the single operator-requested CWManagement email validation message. Confirm receipt in Settings → Production readiness. No scheduled email has been enabled.',
    });
    await record(actor, 'EMAIL_RESULT', id, {
      state: 'LIVE_TESTED',
      fingerprint,
      message: 'SMTP submission succeeded. Inbox receipt still requires operator confirmation.',
    });
    return { state: 'LIVE_TESTED' };
  } catch {
    await record(actor, 'EMAIL_RESULT', id, {
      state: 'ERROR',
      fingerprint,
      message:
        'Email was not confirmed successful. Review SMTP configuration/provider outcome before requesting another test; an uncertain send may have been accepted.',
    });
    return { state: 'ERROR' };
  }
}
export async function confirmEmail(actor: Actor, id: string) {
  requireReadiness(actor);
  const e = await db.auditLog.findFirst({
    where: {
      entity: 'Readiness',
      entityId: id,
      action: 'READINESS_EMAIL_RESULT',
      actorId: actor.id,
    },
  });
  ensure(
    e &&
      object(e.after).state === 'LIVE_TESTED' &&
      object(e.after).fingerprint === configurationFingerprint('email'),
    'No successful matching email test.',
  );
  await record(actor, 'EMAIL_CONFIRMED', id, { state: 'CONFIRMED' });
  return { confirmed: true };
}
export async function testScheduler(actor: Actor, id: string) {
  requireReadiness(actor);
  z.uuid().parse(id);
  await rateLimit(`readiness-scheduler:${actor.id}`, 10, 3600);
  return runAutomation(new Date(), { userId: actor.id, requestId: id });
}

// Actual private-object and HTTP authorization probes, using disposable diagnostic identities.
// No existing client's credentials or sessions are used. Evidence remains; access and bytes are cleaned up.
export async function testStorage(actor: Actor, id: string, http: typeof fetch = fetch) {
  requireReadiness(actor);
  ensure(
    storageDriver() === 's3' && storageConfigured(),
    'Configure private S3 storage before testing.',
    503,
  );
  if (!(await begin(actor, 'STORAGE', id))) return { state: 'ALREADY_REQUESTED' };
  await rateLimit('readiness-storage', 3, 3600);
  const fingerprint = configurationFingerprint('storage'),
    projectId = randomUUID(),
    fileIds: string[] = [],
    keys: string[] = Array.from({ length: 3 }, () => `${projectId}/${randomUUID()}`),
    checks: Record<string, boolean> = {};
  const adapter = storage(),
    bytes = Buffer.from('%PDF-1.4\n% CWManagement diagnostic file\n%%EOF\n');
  let passed = false,
    cleanup = true;
  await record(actor, 'STORAGE_PROJECT', id, { projectId, keys });
  try {
    await db.project.create({
      data: {
        id: projectId,
        number: `DIAG-${id}`,
        name: 'TEST - CWManagement Storage Check',
        internalNotes: 'Disposable production storage diagnostic; never sync to accounting.',
      },
    });
    const roles: Role[] = ['PM', 'CLIENT', 'CLIENT', 'SUBTRADE', 'SUBTRADE'];
    const tokens: string[] = [],
      contacts: string[] = [];
    for (let n = 0; n < roles.length; n++) {
      const u = await db.user.create({
        data: {
          email: `diag-${id}-${n}@example.invalid`,
          firstName: 'TEST Storage',
          lastName: `Identity ${n}`,
          roles: [roles[n]],
        },
      });
      const token = randomToken();
      tokens.push(token);
      await db.session.create({
        data: { userId: u.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 300000) },
      });
      if (n === 0) {
        await db.projectAssignment.create({
          data: { projectId, userId: u.id, role: 'PRIMARY_PROJECT_MANAGER' },
        });
        contacts.push('');
        continue;
      }
      const c = await db.contact.create({
        data: {
          firstName: 'TEST Storage',
          lastName: `Contact ${n}`,
          types: [n < 3 ? 'CLIENT' : 'SUBTRADE'],
          portalUserId: u.id,
        },
      });
      contacts.push(c.id);
      await db.projectContact.create({
        data: { projectId, contactId: c.id, role: n < 3 ? 'CLIENT' : 'SUBTRADE' },
      });
      if (n === 1)
        await db.clientProjectAccess.create({
          data: { projectId, userId: u.id, contactId: c.id, invitedById: actor.id },
        });
      if (n >= 3)
        await db.tradeProjectAccess.create({
          data: { projectId, userId: u.id, contactId: c.id, invitedById: actor.id },
        });
    }
    for (const visibility of ['INTERNAL', 'CLIENT', 'TRADE'] as const) {
      const key = keys[fileIds.length];
      await adapter.put({ key, bytes, contentType: 'application/pdf' });
      ensure(Buffer.from(await adapter.get(key)).equals(bytes), 'Object content mismatch.');
      const f = await db.storedFile.create({
        data: {
          projectId,
          uploaderId: actor.id,
          visibility,
          kind: 'DOCUMENT',
          filename: 'diagnostic.pdf',
          originalFilename: 'diagnostic.pdf',
          mimeType: 'application/pdf',
          size: bytes.length,
          storageKey: key,
          storageProvider: 's3',
        },
      });
      fileIds.push(f.id);
      if (visibility === 'TRADE')
        await db.tradeFileShare.create({ data: { fileId: f.id, contactId: contacts[3] } });
    }
    checks.objectRoundTrip = true;
    checks.metadataPersisted =
      (await db.storedFile.count({ where: { id: { in: fileIds } } })) === 3;
    const probe = async (name: string, file: number, user: number | null, success: boolean) => {
      const r = await http(`${appUrl()}/api/files/${fileIds[file]}`, {
        headers: user === null ? {} : { Cookie: `${SESSION_COOKIE}=${tokens[user]}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      checks[name] = success
        ? r.status === 200 && Buffer.from(await r.arrayBuffer()).equals(bytes)
        : [401, 403, 404].includes(r.status);
    };
    await probe('internalAuthenticatedDownload', 0, 0, true);
    await probe('anonymousDenied', 0, null, false);
    await probe('authorizedClientDownload', 1, 1, true);
    await probe('clientInternalDenied', 0, 1, false);
    await probe('unrelatedClientDenied', 1, 2, false);
    await probe('assignedTradeDownload', 2, 3, true);
    await probe('unrelatedTradeDenied', 2, 4, false);
    await probe('tradeClientFileDenied', 1, 3, false);
    await db.storedFile.updateMany({
      where: { id: { in: fileIds } },
      data: { archivedAt: new Date() },
    });
    await probe('archivedDownloadDenied', 0, 0, false);
    passed = Object.values(checks).every(Boolean);
  } catch {
    passed = false;
  } finally {
    try {
      await cleanupStorage(actor, id);
    } catch {
      cleanup = false;
    }
  }
  checks.cleanup = cleanup;
  const result = {
    state: passed && cleanup ? 'VERIFIED' : 'ERROR',
    checks,
    message:
      passed && cleanup
        ? 'Private S3 upload, HTTP downloads, isolation and cleanup passed.'
        : 'Validation or cleanup failed. Review diagnostic evidence; do not treat storage as verified.',
  };
  await record(actor, 'STORAGE_RESULT', id, { ...result, fingerprint, projectId });
  return result;
}

export async function cleanupStorage(actor: Actor, id: string) {
  requireReadiness(actor);
  z.uuid().parse(id);
  const e = await db.auditLog.findFirst({
    where: { entity: 'Readiness', entityId: id, action: 'READINESS_STORAGE_PROJECT' },
  });
  ensure(e, 'No storage diagnostic exists.', 404);
  const { projectId, keys } = z
    .object({ projectId: z.uuid(), keys: z.array(z.string()).length(3) })
    .parse(e.after);
  const p = await db.project.findUnique({ where: { id: projectId } });
  ensure(!p || p.number === `DIAG-${id}`, 'Diagnostic project mismatch.', 409);
  ensure(
    keys.every((k) => k.startsWith(`${projectId}/`) && k.split('/').length === 2),
    'Invalid diagnostic key.',
    409,
  );
  // Revoke access even when object storage is unavailable. Retry the same cleanup ID later.
  const users = await db.user.findMany({
    where: { email: { startsWith: `diag-${id}-`, endsWith: '@example.invalid' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    await tx.clientProjectAccess.updateMany({
      where: { projectId },
      data: { active: false, revokedAt: new Date() },
    });
    await tx.tradeProjectAccess.updateMany({
      where: { projectId },
      data: { active: false, revokedAt: new Date() },
    });
    await tx.contact.updateMany({ where: { portalUserId: { in: ids } }, data: { active: false } });
    await tx.storedFile.updateMany({ where: { projectId }, data: { archivedAt: new Date() } });
    await tx.project.updateMany({
      where: { id: projectId },
      data: { active: false, archivedAt: new Date(), status: 'ARCHIVED' },
    });
  });
  const results = await Promise.allSettled(keys.map((k) => storage().remove(k)));
  ensure(
    results.every((r) => r.status === 'fulfilled'),
    'Diagnostic bytes need cleanup. Retry when storage is available.',
    503,
  );
  await record(actor, 'STORAGE_CLEANED', id, { projectId });
  return { state: 'CLEANED' };
}
