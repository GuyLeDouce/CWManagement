// Run only inside the linked application container. Never prints credentials or payloads.
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
const db = new PrismaClient(),
  kind = process.argv[2],
  id = process.argv[3] || randomUUID();
let sessionId;
try {
  if (!['storage', 'email', 'scheduler', 'inspect', 'smoke'].includes(kind))
    throw Error('Choose storage, email, scheduler, inspect or smoke.');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error('A UUID request ID is required.');
  const origin = new URL(process.env.APP_URL || '');
  if (origin.protocol !== 'https:' || origin.pathname !== '/')
    throw Error('Production HTTPS origin required.');
  const owner = await db.user.findFirst({
    where: {
      email: process.env.OWNER_EMAIL?.trim().toLowerCase(),
      active: true,
      roles: { has: 'OWNER' },
    },
  });
  if (
    !process.env.OWNER_EMAIL ||
    !owner ||
    owner.roles.some((r) => ['CLIENT', 'SUBTRADE', 'VENDOR'].includes(r))
  )
    throw Error('Configured active Owner required.');
  // Explicitly authorized operational test session. Does not verify the Owner password.
  const token = randomBytes(32).toString('base64url');
  const session = await db.session.create({
    data: {
      userId: owner.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 300000),
    },
  });
  sessionId = session.id;
  await db.auditLog.create({
    data: {
      actorId: owner.id,
      action: 'READINESS_OPERATOR_SESSION',
      entity: 'Readiness',
      entityId: id,
      after: { operation: kind, source: 'Authorized container diagnostic', expiresInMinutes: 5 },
    },
  });
  const request = async (path, body, authenticated = true) =>
    fetch(new URL(path, origin), {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(authenticated ? { Cookie: `__Host-cw-session=${token}` } : {}),
        Origin: origin.origin,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
    });
  if (kind === 'smoke') {
    for (const path of [
      '/api/health',
      '/login',
      '/api/business/crm',
      '/api/business/reports',
      '/api/business/dashboard',
      '/api/state',
      '/api/business/warranty',
    ]) {
      const r = await request(path);
      console.log(JSON.stringify({ path, status: r.status }));
      if (r.status !== 200) process.exitCode = 1;
    }
    for (const path of [
      '/api/business/readiness',
      '/api/business/reports',
      '/api/files/nonexistent-diagnostic',
    ]) {
      const r = await request(path, undefined, false);
      console.log(JSON.stringify({ path, anonymousStatus: r.status }));
      if (![401, 403, 404].includes(r.status)) process.exitCode = 1;
    }
    const r = await fetch(new URL('/api/automation/run', origin), { method: 'POST' });
    console.log(JSON.stringify({ schedulerUnauthorizedStatus: r.status }));
    if (r.status !== 401) process.exitCode = 1;
  } else if (kind === 'scheduler') {
    if ((process.env.AUTOMATION_SECRET?.length || 0) < 32)
      throw Error('Configure scheduler authentication first.');
    for (let n = 0; n < 2; n++) {
      const r = await fetch(new URL('/api/automation/run', origin), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AUTOMATION_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: owner.id, requestId: id }),
        signal: AbortSignal.timeout(120000),
      });
      const result = await r.json();
      console.log(
        JSON.stringify({
          requestId: id,
          attempt: n + 1,
          status: r.status,
          generated: result.generated,
        }),
      );
      if (!r.ok) process.exitCode = 1;
    }
    console.log(
      JSON.stringify({
        deliveryRecords: await db.deliveryRecord.count({
          where: { kind: 'READINESS_TEST', entityId: id, userId: owner.id },
        }),
        leaseRemaining: await db.automationLease.count({ where: { id: 'reminders' } }),
      }),
    );
  } else {
    const r = await request(
      '/api/business/readiness' + (kind === 'inspect' ? '' : '/' + kind),
      kind === 'inspect' ? undefined : { id },
    );
    const result = await r.json();
    console.log(JSON.stringify({ requestId: id, status: r.status, result }));
    if (!r.ok || result.state === 'ERROR') process.exitCode = 1;
  }
} catch {
  console.error(
    'Production diagnostic did not complete. Inspect authorized readiness evidence; no credentials were logged.',
  );
  process.exitCode = 1;
} finally {
  if (sessionId) await db.session.deleteMany({ where: { id: sessionId } });
  await db.$disconnect();
}
