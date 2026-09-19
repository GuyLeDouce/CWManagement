import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { db } from '../src/lib/db';
import { punch, punchSchema } from '../src/lib/clock';
import { approveRecords, editRecord, closeForgottenDay } from '../src/lib/records';
import { finalizeExport } from '../src/lib/reports';
import { has, segmentScope, requireManagement } from '../src/lib/permissions';
import { randomToken, privateKey, verifyPassword } from '../src/lib/crypto';
import { resetOwnerPassword } from '../prisma/owner-password';
import { previousWeek } from '../src/lib/time';
import { importCsv } from '../src/lib/imports';
import { visit } from '../src/lib/visits';
import { adminSchema, saveAdmin } from '../src/lib/admin';
import { transaction } from '../src/lib/db';
import { resetPassword, issueToken } from '../src/lib/auth';
const suffix = randomUUID().slice(0, 8);
describe('operator owner password recovery', () => {
  it('repairs a malformed hash and revokes only the recovered owner credentials', async () => {
    const f = await fixture();
    const password = 'recovered-test-password-12345';
    await db.user.update({ where: { id: f.owner.id }, data: { passwordHash: 'plain-password' } });
    for (const user of [f.owner, f.user]) {
      await db.session.create({
        data: {
          userId: user.id,
          tokenHash: randomToken(),
          expiresAt: new Date(Date.now() + 100000),
        },
      });
      await issueToken(user.id, 'RESET_PASSWORD');
      await db.rateLimit.create({
        data: {
          key: privateKey(`login:${user.email}`),
          count: 10,
          resetsAt: new Date(Date.now() + 100000),
        },
      });
    }
    await resetOwnerPassword(db, ` ${f.owner.email.toUpperCase()} `, password);
    const owner = await db.user.findUniqueOrThrow({ where: { id: f.owner.id } });
    expect(await verifyPassword(password, owner.passwordHash)).toBe(true);
    expect(owner.roles).toEqual(f.owner.roles);
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
    expect(await db.actionToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(0);
    expect(
      await db.rateLimit.findUnique({ where: { key: privateKey(`login:${owner.email}`) } }),
    ).toBeNull();
    expect(await db.session.count({ where: { userId: f.user.id } })).toBe(1);
    expect(await db.actionToken.count({ where: { userId: f.user.id, usedAt: null } })).toBe(1);
    expect(
      await db.rateLimit.findUnique({ where: { key: privateKey(`login:${f.user.email}`) } }),
    ).not.toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: owner.id, action: 'OWNER_PASSWORD_RECOVERY' },
    });
    expect(audit.actorId).toBeNull();
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain(owner.passwordHash!);
  });
  it('refuses missing, inactive, and non-owner accounts without changing them', async () => {
    const f = await fixture();
    await db.user.update({ where: { id: f.owner.id }, data: { active: false } });
    for (const email of [f.owner.email, f.user.email, `missing-${randomUUID()}@example.test`]) {
      await expect(resetOwnerPassword(db, email, 'recovery-password-12345')).rejects.toThrow(
        'existing active Owner',
      );
      await db.$disconnect();
    }
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: f.owner.id } })).passwordHash,
    ).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).passwordHash).toBeNull();
  });
  it('rejects invalid setup credentials before changing the owner', async () => {
    const f = await fixture();
    for (const password of ['', 'short', 'a'.repeat(129)])
      await expect(resetOwnerPassword(db, f.owner.email, password)).rejects.toThrow('12–128');
    await expect(resetOwnerPassword(db, 'not-an-email', 'recovery-password-12345')).rejects.toThrow(
      'OWNER_EMAIL',
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: f.owner.id } })).passwordHash,
    ).toBeNull();
  });
});
let sequence = 0;
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Integration tests require a dedicated database with a name ending in _test.');
  process.env.APP_SECRET = 'integration-only-secret-not-for-deployment-123456';
  await db.settings.upsert({
    where: { id: 'company' },
    update: {},
    create: { id: 'company', timezone: 'America/Toronto' },
  });
});
afterAll(() => db.$disconnect());
afterEach(() => db.$disconnect());
async function fixture() {
  const n = `${suffix}-${++sequence}`;
  const owner = await db.user.create({
    data: { firstName: 'Owner', lastName: n, email: `owner-${n}@example.test`, roles: ['OWNER'] },
  });
  const user = await db.user.create({
    data: {
      firstName: 'Employee',
      lastName: n,
      email: `employee-${n}@example.test`,
      roles: ['SHOP', 'SITE', 'OFFICE'],
      earliestStart: '00:00',
    },
  });
  const pm = await db.user.create({
    data: { firstName: 'PM', lastName: n, email: `pm-${n}@example.test`, roles: ['PM'] },
  });
  const task = await db.task.create({ data: { name: `Framing-${n}` } }),
    task2 = await db.task.create({ data: { name: `Finishing-${n}` } });
  const code = await db.accountingCode.create({
    data: { code: `LAB-${n}`, description: 'Labour' },
  });
  const job = await db.jobsite.create({ data: { name: `Project A-${n}`, number: `A-${n}` } }),
    job2 = await db.jobsite.create({ data: { name: `Project B-${n}`, number: `B-${n}` } });
  for (const jobsite of [job, job2]) {
    await db.employeeJobsite.create({ data: { userId: user.id, jobsiteId: jobsite.id } });
    await db.pmJobsite.create({ data: { pmId: pm.id, jobsiteId: jobsite.id } });
    for (const t of [task, task2])
      await db.jobsiteTask.create({ data: { jobsiteId: jobsite.id, taskId: t.id } });
    await db.accountingMapping.create({
      data: { jobsiteId: jobsite.id, accountingCodeId: code.id },
    });
  }
  for (const t of [task, task2])
    await db.employeeTask.create({ data: { userId: user.id, taskId: t.id } });
  await db.pmEmployee.create({ data: { pmId: pm.id, employeeId: user.id } });
  const truck = await db.truck.create({ data: { name: `Truck-${n}` } });
  const shopQr = await db.qrCode.create({
      data: { type: 'SHOP', label: 'Shop', token: randomToken() },
    }),
    truckQr = await db.qrCode.create({
      data: { type: 'TRUCK', truckId: truck.id, label: 'Truck', token: randomToken() },
    });
  return { owner, user, pm, task, task2, code, job, job2, truck, shopQr, truckQr };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function current(f: Fixture) {
  return db.timeSegment.findFirstOrThrow({ where: { userId: f.user.id, end: null } });
}
function input(f: Fixture, fields: Record<string, unknown> = {}) {
  return punchSchema.parse({
    key: randomUUID(),
    qrToken: f.shopQr.token,
    action: 'CLOCK_IN',
    mode: 'SHOP',
    jobsiteId: f.job.id,
    taskId: f.task.id,
    expectedSegmentId: null,
    ...fields,
  });
}
async function historic(f: Fixture, code = true) {
  const start = DateTime.fromJSDate(previousWeek(new Date(), 'America/Toronto').start)
      .plus({ hours: 12 })
      .toJSDate(),
    end = new Date(+start + 3600000);
  const day = await db.workDay.create({
    data: {
      userId: f.user.id,
      date: DateTime.fromJSDate(start).toISODate()!,
      timezone: 'America/Toronto',
      originalStart: start,
      paidStart: start,
      endedAt: end,
    },
  });
  return db.timeSegment.create({
    data: {
      userId: f.user.id,
      workDayId: day.id,
      type: 'SHOP',
      jobsiteId: f.job.id,
      taskId: f.task.id,
      accountingCodeId: code ? f.code.id : null,
      originalStart: start,
      originalEnd: end,
      effectiveStart: start,
      end,
      status: 'PENDING_PM_APPROVAL',
    },
  });
}
describe('database timekeeping transactions', () => {
  it('starts at shop, travels, arrives, switches task, travels to another site, and clocks out', async () => {
    const f = await fixture();
    await punch(f.user, input(f, { mode: 'SITE', taskId: null }));
    const travel = await current(f);
    expect(travel.type).toBe('TRAVEL');
    await punch(
      f.user,
      input(f, { action: 'ARRIVED', qrToken: f.truckQr.token, expectedSegmentId: travel.id }),
    );
    const site = await current(f);
    expect(site.type).toBe('SITE');
    expect((await db.timeSegment.findUniqueOrThrow({ where: { id: travel.id } })).end).toEqual(
      site.effectiveStart,
    );
    await punch(
      f.user,
      input(f, {
        action: 'SWITCH',
        mode: 'SITE',
        qrToken: f.truckQr.token,
        expectedSegmentId: site.id,
        taskId: f.task2.id,
      }),
    );
    const second = await current(f);
    expect(second.type).toBe('SITE');
    expect(second.taskId).toBe(f.task2.id);
    await punch(
      f.user,
      input(f, {
        action: 'SWITCH',
        mode: 'SITE',
        qrToken: f.truckQr.token,
        expectedSegmentId: second.id,
        jobsiteId: f.job2.id,
        taskId: null,
      }),
    );
    const nextTravel = await current(f);
    expect(nextTravel.type).toBe('TRAVEL');
    expect(nextTravel.taskId).toBeNull();
    await punch(
      f.user,
      input(f, {
        action: 'ARRIVED',
        qrToken: f.truckQr.token,
        expectedSegmentId: nextTravel.id,
        jobsiteId: f.job2.id,
      }),
    );
    const arrived = await current(f);
    await punch(
      f.user,
      input(f, { action: 'CLOCK_OUT', qrToken: f.truckQr.token, expectedSegmentId: arrived.id }),
    );
    expect(await db.timeSegment.count({ where: { userId: f.user.id, end: null } })).toBe(0);
    expect(await db.workDay.count({ where: { userId: f.user.id, endedAt: null } })).toBe(0);
    expect(
      (await db.truck.findUniqueOrThrow({ where: { id: f.truck.id } })).inferredJobsiteId,
    ).toBe(f.job2.id);
  });
  it('replays identical punches without creating extra records', async () => {
    const f = await fixture(),
      p = input(f);
    expect(await punch(f.user, p)).toEqual(await punch(f.user, p));
    expect(await db.timeSegment.count({ where: { userId: f.user.id } })).toBe(1);
  });
  it('allows only one of two simultaneous clock-ins', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([punch(f.user, input(f)), punch(f.user, input(f))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.timeSegment.count({ where: { userId: f.user.id, end: null } })).toBe(1);
  });
  it('replays a simultaneous retry of the same idempotency key', async () => {
    const f = await fixture(),
      p = input(f);
    const result = await Promise.all([punch(f.user, p), punch(f.user, p)]);
    expect(result[0]).toEqual(result[1]);
    expect(await db.timeSegment.count({ where: { userId: f.user.id } })).toBe(1);
  });
  it('rejects stale expected state and modified reused keys', async () => {
    const f = await fixture(),
      p = input(f);
    await punch(f.user, p);
    await expect(punch(f.user, input(f))).rejects.toThrow('status changed');
    await expect(punch(f.user, { ...p, notes: 'different' })).rejects.toThrow('key has already');
  });
  it('rejects revoked QR codes and starting from a truck', async () => {
    const f = await fixture();
    await expect(punch(f.user, input(f, { qrToken: f.truckQr.token }))).rejects.toThrow('shop QR');
    await db.qrCode.update({ where: { id: f.shopQr.id }, data: { active: false } });
    await expect(punch(f.user, input(f))).rejects.toThrow('revoked');
  });
  it('rejects unavailable projects and unassigned work modes', async () => {
    const f = await fixture();
    await db.employeeJobsite.delete({
      where: { userId_jobsiteId: { userId: f.user.id, jobsiteId: f.job.id } },
    });
    await expect(punch(f.user, input(f))).rejects.toThrow('not available');
    await db.user.update({ where: { id: f.user.id }, data: { roles: ['OFFICE'] } });
    await expect(punch(f.user, input(f))).rejects.toThrow('mode is not available');
  });
  it('switches shop employees to site travel at the shop without gaps', async () => {
    const f = await fixture();
    await punch(f.user, input(f));
    const shop = await current(f);
    await punch(
      f.user,
      input(f, { action: 'SWITCH', mode: 'SITE', expectedSegmentId: shop.id, taskId: null }),
    );
    const travel = await current(f);
    expect(travel.type).toBe('TRAVEL');
    expect((await db.timeSegment.findUniqueOrThrow({ where: { id: shop.id } })).end).toEqual(
      travel.effectiveStart,
    );
  });
  it('closes forgotten shifts with a reason without inventing an original scan', async () => {
    const f = await fixture();
    await punch(f.user, input(f));
    const r = await current(f);
    await closeForgottenDay(f.pm, {
      id: r.id,
      version: r.version,
      end: new Date().toISOString(),
      reason: 'Employee confirmed end of work',
    });
    const closed = await db.timeSegment.findUniqueOrThrow({ where: { id: r.id } });
    expect(closed.end).not.toBeNull();
    expect(closed.originalEnd).toBeNull();
    expect(closed.status).toBe('PENDING_PM_APPROVAL');
  });
  it('records office time without requiring a task', async () => {
    const f = await fixture();
    await punch(f.user, input(f, { mode: 'OFFICE', taskId: null }));
    expect((await current(f)).type).toBe('OFFICE');
    expect((await current(f)).taskId).toBeNull();
  });
  it('blocks overlapping records at the database layer', async () => {
    const f = await fixture(),
      r = await historic(f);
    await expect(
      db.timeSegment.create({
        data: {
          userId: f.user.id,
          workDayId: r.workDayId,
          type: 'OFFICE',
          jobsiteId: f.job.id,
          originalStart: r.originalStart,
          effectiveStart: r.effectiveStart,
          end: r.end,
        },
      }),
    ).rejects.toThrow('no_employee_time_overlap');
  });
});
describe('approval, exports, scope, and audit', () => {
  it('requires accounting codes for normal labour', async () => {
    const f = await fixture(),
      r = await historic(f, false);
    await expect(
      approveRecords(f.pm, { records: [{ id: r.id, version: r.version }] }),
    ).rejects.toThrow('accounting code');
  });
  it('scopes PM approvals to assigned employees AND projects', async () => {
    const f = await fixture(),
      r = await historic(f);
    await db.pmJobsite.deleteMany({ where: { pmId: f.pm.id } });
    await expect(
      approveRecords(f.pm, { records: [{ id: r.id, version: r.version }] }),
    ).rejects.toThrow('outside');
    expect(await db.timeSegment.count({ where: { AND: [{ id: r.id }, segmentScope(f.pm)] } })).toBe(
      0,
    );
  });
  it('requires controller clock-in even when also a PM for accounting access', async () => {
    const f = await fixture();
    const controller = { ...f.pm, roles: ['CONTROLLER', 'PM'] as Role[] };
    await expect(requireManagement(controller, 'send')).rejects.toThrow('Clock in');
  });
  it('approves a closed previous-week line and exports an immutable snapshot', async () => {
    const f = await fixture(),
      r = await historic(f);
    await approveRecords(f.pm, { records: [{ id: r.id, version: r.version }] });
    const approved = await db.timeSegment.findUniqueOrThrow({ where: { id: r.id } });
    expect(approved.status).toBe('PM_APPROVED');
    const result = await finalizeExport(f.owner, {
      records: [{ id: r.id, version: approved.version }],
    });
    const batch = await db.exportBatch.findUniqueOrThrow({ where: { id: result.id } });
    expect(batch.csv).toContain('1.0000');
    expect(batch.csv).toContain('PM');
    expect((await db.timeSegment.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'EXPORTED',
    );
    await expect(
      db.timeSegment.update({ where: { id: r.id }, data: { notes: 'tampered' } }),
    ).rejects.toThrow('immutable');
    await db.$disconnect();
    await expect(
      finalizeExport(f.owner, { records: [{ id: r.id, version: approved.version }] }),
    ).rejects.toThrow('already been exported');
  });
  it('does not export unapproved time without an explicit audited owner override', async () => {
    const f = await fixture(),
      r = await historic(f);
    await expect(
      finalizeExport(f.owner, { records: [{ id: r.id, version: r.version }] }),
    ).rejects.toThrow('PM-approved');
    const result = await finalizeExport(f.owner, {
      records: [{ id: r.id, version: r.version }],
      overrideReason: 'Accounting deadline authorized by owner',
    });
    expect((await db.exportBatch.findUniqueOrThrow({ where: { id: result.id } })).reason).toContain(
      'Accounting deadline',
    );
  });
  it('retains original timestamps and invalidates approval on correction', async () => {
    const f = await fixture(),
      r = await historic(f);
    await approveRecords(f.pm, { records: [{ id: r.id, version: r.version }] });
    const approved = await db.timeSegment.findUniqueOrThrow({ where: { id: r.id } });
    await editRecord(f.pm, {
      id: r.id,
      version: approved.version,
      userId: r.userId,
      jobsiteId: r.jobsiteId,
      taskId: r.taskId,
      effectiveStart: new Date(+r.effectiveStart + 60000).toISOString(),
      end: r.end!.toISOString(),
      accountingCodeId: r.accountingCodeId,
      notes: 'Corrected',
      reason: 'Confirmed actual work start',
    });
    const edited = await db.timeSegment.findUniqueOrThrow({ where: { id: r.id } });
    expect(edited.originalStart).toEqual(r.originalStart);
    expect(edited.status).toBe('PENDING_PM_APPROVAL');
    expect(await db.auditLog.count({ where: { entityId: r.id, action: 'RECORD_CORRECTED' } })).toBe(
      1,
    );
  });
  it('prevents audit deletion and original timestamp edits', async () => {
    const f = await fixture(),
      r = await historic(f);
    await approveRecords(f.pm, { records: [{ id: r.id, version: r.version }] });
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: r.id } });
    await expect(db.auditLog.delete({ where: { id: audit.id } })).rejects.toThrow('append-only');
    await db.$disconnect();
    await expect(
      db.timeSegment.update({ where: { id: r.id }, data: { originalStart: new Date() } }),
    ).rejects.toThrow('immutable');
  });
  it('rejects invalid CSV as one unit and requires a matching preview', async () => {
    const f = await fixture();
    const text = `name\nImport-${randomUUID()}\n\"unterminated`;
    await expect(importCsv(f.owner, { entity: 'tasks', csv: text, commit: false })).rejects.toThrow(
      'could not be read',
    );
    const name = `Imported-${randomUUID()}`,
      csv = `name\n${name}`;
    await expect(importCsv(f.owner, { entity: 'tasks', csv, commit: true })).rejects.toThrow(
      'Preview',
    );
    const preview = await importCsv(f.owner, { entity: 'tasks', csv, commit: false });
    expect('previewToken' in preview).toBe(true);
    if ('previewToken' in preview)
      await importCsv(f.owner, {
        entity: 'tasks',
        csv,
        commit: true,
        previewToken: preview.previewToken,
      });
    expect(await db.task.findUnique({ where: { name } })).not.toBeNull();
  });
  it('does not let an Admin grant themselves Owner access', async () => {
    const f = await fixture();
    const admin = await db.user.create({
      data: {
        email: `admin-${randomUUID()}@example.test`,
        firstName: 'Admin',
        lastName: 'Test',
        roles: ['ADMIN'],
      },
    });
    const change = adminSchema.parse({
      entity: 'employees',
      id: admin.id,
      data: { firstName: 'Admin', lastName: 'Test', email: admin.email, roles: ['OWNER'] },
    });
    await expect(transaction((tx) => saveAdmin(tx, admin, change))).rejects.toThrow(
      'Only an Owner',
    );
    expect(has(f.owner, 'OWNER')).toBe(true);
  });
  it('records site visits separately without creating payroll segments', async () => {
    const f = await fixture();
    await visit(f.owner, { action: 'START', jobsiteId: f.job.id, notes: '' });
    await expect(
      visit(f.owner, { action: 'START', jobsiteId: f.job.id, notes: '' }),
    ).rejects.toThrow('current visit');
    await visit(f.owner, { action: 'END', notes: '' });
    expect(await db.timeSegment.count({ where: { userId: f.owner.id } })).toBe(0);
  });
  it('consumes reset tokens once and revokes existing sessions', async () => {
    const f = await fixture();
    const token = await issueToken(f.user.id, 'RESET_PASSWORD');
    await db.session.create({
      data: {
        userId: f.user.id,
        tokenHash: randomToken(),
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    await resetPassword(token, 'new-test-password-12345');
    expect(await db.session.count({ where: { userId: f.user.id } })).toBe(0);
    await expect(resetPassword(token, 'another-password-12345')).rejects.toThrow(
      'already been used',
    );
  });
});
