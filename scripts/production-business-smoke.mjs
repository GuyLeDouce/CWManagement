// Explicit controlled production pilot; run inside the application container with --run.
// Uses new TEST identities, never real client credentials. No accounting writes or email.
import { PrismaClient } from '@prisma/client';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
const db = new PrismaClient(),
  key = randomUUID(),
  users = [],
  contacts = [],
  projects = [],
  checks = [];
let stageId,
  opportunityId,
  step = 'preflight';
const origin = new URL(process.env.APP_URL || 'http://invalid');
const verify = (name, ok) => {
  checks.push({ name, passed: !!ok });
  if (!ok) throw Error(name);
};
async function call(user, path, body, denied = false) {
  step = path;
  const r = await fetch(new URL('/api/' + path, origin), {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin.origin,
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (denied) {
    verify(`Denied ${path}`, [401, 403, 404].includes(r.status));
    return;
  }
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r.json();
}
try {
  if (
    process.argv[2] !== '--run' ||
    origin.protocol !== 'https:' ||
    process.env.NODE_ENV !== 'production'
  )
    throw Error('Explicit production invocation required');
  const config = await db.settings.findUniqueOrThrow({ where: { id: 'company' } });
  if (config.automationEnabled || config.automationEmailEnabled)
    throw Error('Disable normal automation for this controlled pilot');
  for (const role of ['OWNER', 'PM', 'CLIENT', 'CLIENT', 'SUBTRADE', 'SUBTRADE']) {
    const password = randomBytes(32).toString('base64url'),
      salt = randomBytes(16).toString('hex');
    const u = await db.user.create({
      data: {
        email: `smoke-${key}-${users.length}@example.invalid`,
        firstName: 'TEST Pilot',
        lastName: role,
        roles: [role],
        passwordHash: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
      },
    });
    users.push(u);
    const r = await fetch(new URL('/api/auth/login', origin), {
      method: 'POST',
      headers: { Origin: origin.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password }),
      signal: AbortSignal.timeout(30000),
    });
    verify(`Password login ${role}`, r.ok);
    u.cookie = r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    if (['CLIENT', 'SUBTRADE'].includes(role)) {
      const c = await db.contact.create({
        data: {
          firstName: 'TEST Pilot',
          lastName: `${role} ${users.length}`,
          types: [role],
          portalUserId: u.id,
        },
      });
      contacts.push(c);
      u.contactId = c.id;
    }
  }
  const [owner, pm, client, otherClient, trade, otherTrade] = users;
  await db.auditLog.create({
    data: {
      actorId: owner.id,
      action: 'PRODUCTION_BUSINESS_PILOT_STARTED',
      entity: 'Readiness',
      entityId: key,
      after: { userIds: users.map((u) => u.id) },
    },
  });
  stageId = (await db.opportunityStage.create({ data: { name: `TEST Pilot ${key.slice(0, 8)}` } }))
    .id;
  const input = {
    title: 'TEST - CWManagement Full Workflow',
    contactId: client.contactId,
    stageId,
    ownerId: pm.id,
    estimatedValue: '0',
  };
  let opportunity = await call(owner, 'business/crm', input);
  opportunityId = opportunity.id;
  await call(owner, 'business/crm/activity', {
    opportunityId,
    title: 'TEST consultation complete',
    category: 'Consultation',
    ownerId: pm.id,
    dueAt: new Date().toISOString(),
    complete: true,
  });
  opportunity = await call(owner, 'business/crm', {
    ...input,
    id: opportunity.id,
    version: opportunity.version,
    status: 'WON',
  });
  const setup = {
    opportunityId,
    contactId: client.contactId,
    name: input.title,
    number: `TEST-${key.slice(0, 8)}`,
    managerId: pm.id,
    startDate: new Date().toISOString().slice(0, 10),
  };
  const p = await call(owner, 'standards/setup', setup);
  projects.push(p.id);
  verify('Conversion is idempotent', (await call(owner, 'standards/setup', setup)).id === p.id);
  const other = await db.project.create({
    data: { number: `TEST-OTHER-${key.slice(0, 8)}`, name: 'TEST - isolated pilot project' },
  });
  projects.push(other.id);
  for (const u of [client, otherClient, trade, otherTrade]) {
    if (u !== client)
      await db.projectContact.create({
        data: { projectId: p.id, contactId: u.contactId, role: u.roles[0] },
      });
    const table = u.roles[0] === 'CLIENT' ? db.clientProjectAccess : db.tradeProjectAccess;
    await table.create({
      data: { projectId: p.id, contactId: u.contactId, userId: u.id, invitedById: owner.id },
    });
  }
  await call(client, `client/project?projectId=${other.id}`, undefined, true);
  await call(trade, `trade/project?projectId=${other.id}`, undefined, true);
  for (const u of [client, trade]) {
    await call(u, 'business/readiness', undefined, true);
    await call(u, 'business/reports', undefined, true);
  }
  await call(client, `trade/project?projectId=${p.id}`, undefined, true);
  await call(trade, `client/project?projectId=${p.id}`, undefined, true);
  const service = await call(client, 'client/warranty', {
    projectId: p.id,
    title: 'TEST service validation',
    description: 'Controlled live validation only; no actual repair required.',
  });
  const act = async (u, action, extra = {}) => {
    const r = await db.warrantyRequest.findUniqueOrThrow({ where: { id: service.id } });
    return call(
      u,
      (u === client ? 'client' : u === trade ? 'trade' : 'business') + '/warranty/action',
      { id: r.id, version: r.version, action, ...extra },
    );
  };
  await act(pm, 'accept');
  await act(pm, 'assign', {
    assignedTradeId: trade.contactId,
    tradeDescription: 'TEST assigned repair evidence',
  });
  verify(
    'Other client cannot see service',
    !(await call(otherClient, `client/project?projectId=${p.id}`)).warranty.some(
      (w) => w.id === service.id,
    ),
  );
  verify(
    'Other trade cannot see service',
    !(await call(otherTrade, `trade/project?projectId=${p.id}`)).warranty.some(
      (w) => w.id === service.id,
    ),
  );
  const r = await db.warrantyRequest.findUniqueOrThrow({ where: { id: service.id } });
  await call(
    otherTrade,
    'trade/warranty/action',
    { id: r.id, version: r.version, action: 'ready' },
    true,
  );
  await call(
    trade,
    'trade/warranty/action',
    { id: r.id, version: r.version, action: 'close' },
    true,
  );
  await act(trade, 'ready');
  await act(pm, 'complete');
  await act(client, 'verify');
  await act(pm, 'close');
  verify(
    'Warranty closed after client verification',
    (await db.warrantyRequest.findUniqueOrThrow({ where: { id: service.id } })).status === 'CLOSED',
  );
  const actual = await call(client, `client/project?projectId=${p.id}`),
    preview = await call(
      pm,
      `client-management/preview?projectId=${p.id}&contactId=${client.contactId}`,
    );
  delete preview.preview;
  verify(
    'Client Vision matches real client projection',
    JSON.stringify(preview) === JSON.stringify(actual),
  );
  const forbidden =
    /^(unitCost|estimatedCost|costTotal|markup|markupMethod|markupValue|grossProfit|grossMargin|originalBudget|currentBudget|actualCost|internalNotes|passwordHash|storageKey)$/i;
  const safe = (o) =>
    !o ||
    typeof o !== 'object' ||
    Object.entries(o).every(([k, v]) => !forbidden.test(k) && safe(v));
  verify('Client projection has no forbidden fields', safe(actual));
  for (const report of ['projects', 'tasks', 'financial', 'crm', 'time', 'warranty']) {
    await call(owner, 'business/reports/run', { report, projectId: p.id });
    verify(`Report ${report}`, true);
  }
  const scoped = await call(pm, 'business/reports/run', {
    report: 'projects',
    projectId: other.id,
  });
  verify('PM report excludes unrelated project', scoped.rows.length === 0);
  await db.auditLog.create({
    data: {
      actorId: owner.id,
      action: 'PRODUCTION_BUSINESS_PILOT_RESULT',
      entity: 'Readiness',
      entityId: key,
      after: { checks, projects, opportunityId },
    },
  });
  console.log(JSON.stringify({ pilotId: key, projectId: p.id, checks }));
} catch {
  console.log(JSON.stringify({ pilotId: key, state: 'FAILED', step, checks }));
  process.exitCode = 1;
} finally {
  const ids = users.map((u) => u.id);
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.actionToken.updateMany({
    where: { userId: { in: ids }, usedAt: null },
    data: { usedAt: new Date() },
  });
  await db.user.updateMany({
    where: { id: { in: ids } },
    data: { active: false, passwordHash: null },
  });
  await db.contact.updateMany({
    where: { id: { in: contacts.map((c) => c.id) } },
    data: { active: false },
  });
  await db.clientProjectAccess.updateMany({
    where: { userId: { in: ids } },
    data: { active: false, revokedAt: new Date() },
  });
  await db.tradeProjectAccess.updateMany({
    where: { userId: { in: ids } },
    data: { active: false, revokedAt: new Date() },
  });
  await db.project.updateMany({
    where: { id: { in: projects } },
    data: { active: false, archivedAt: new Date(), status: 'ARCHIVED' },
  });
  if (stageId)
    await db.opportunityStage.update({ where: { id: stageId }, data: { active: false } });
  console.log(
    JSON.stringify({
      pilotId: key,
      cleanup: 'Archived projects; revoked disposable access; retained history',
    }),
  );
  await db.$disconnect();
}
