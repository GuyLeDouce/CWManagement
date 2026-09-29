import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { runAutomation, enqueueReminder, reviewDelivery } from '../src/lib/automation';
import { checkEmailConfiguration, sendEmail } from '../src/lib/email';
vi.mock('../src/lib/email', () => ({
  appUrl: () => 'https://example.test',
  checkEmailConfiguration: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));
const key = randomUUID();
let owner: Awaited<ReturnType<typeof db.user.create>>, projectId: string, taskId: string;
beforeAll(async () => {
  if (
    new URL(process.env.DATABASE_URL || 'http://invalid').pathname !==
    '/cwmanagement_phase8a_automation_test'
  )
    throw Error('Use the dedicated cwmanagement_phase8a_automation_test database.');
  await db.settings.upsert({
    where: { id: 'company' },
    create: { automationEnabled: true, automationEmailEnabled: false },
    update: { automationEnabled: true, automationEmailEnabled: false },
  });
  owner = await db.user.create({
    data: {
      email: `${key}@example.test`,
      firstName: 'Scheduler',
      lastName: 'Test',
      roles: ['OWNER'],
      dailyDigestEnabled: true,
    },
  });
  const p = await db.project.create({
    data: {
      name: 'Scheduler test',
      number: key,
      assignments: { create: { userId: owner.id, role: 'PRIMARY_PROJECT_MANAGER' } },
    },
  });
  projectId = p.id;
  const t = await db.projectTask.create({
    data: {
      projectId,
      name: 'Overdue task',
      createdById: owner.id,
      endDate: new Date(Date.now() - 86400000),
      assignees: { create: { userId: owner.id } },
    },
  });
  taskId = t.id;
});
afterAll(async () => {
  await db.settings.update({
    where: { id: 'company' },
    data: { automationEnabled: false, automationEmailEnabled: false },
  });
  await db.$disconnect();
});
it('generates actual due reminders once across repeated durable runs', async () => {
  await runAutomation();
  await runAutomation();
  expect(
    await db.deliveryRecord.count({ where: { userId: owner.id, entityId: taskId, kind: 'TASK' } }),
  ).toBe(1);
  expect(
    await db.notification.count({ where: { userId: owner.id, title: 'Assigned task due' } }),
  ).toBe(1);
  expect(sendEmail).not.toHaveBeenCalled();
});
it('retries a configuration failure only after repair and never repeats a delivered email', async () => {
  await db.settings.update({ where: { id: 'company' }, data: { automationEmailEnabled: true } });
  await enqueueReminder(
    {
      userId: owner.id,
      kind: 'DIGEST',
      entityId: owner.id,
      title: 'Test retry',
      actionUrl: '/my-work',
      period: key,
    },
    true,
  );
  vi.mocked(checkEmailConfiguration).mockImplementation(() => {
    throw Error('Test configuration unavailable');
  });
  await runAutomation();
  let d = await db.deliveryRecord.findFirstOrThrow({
    where: { userId: owner.id, title: 'Test retry' },
  });
  expect(d.status).toBe('FAILED');
  expect(d.deliveredAt).toBeNull();
  expect(sendEmail).not.toHaveBeenCalled();
  vi.mocked(checkEmailConfiguration).mockImplementation(() => undefined);
  await reviewDelivery(owner, { id: d.id, action: 'retry', reason: 'Test configuration repaired' });
  await runAutomation();
  d = await db.deliveryRecord.findUniqueOrThrow({ where: { id: d.id } });
  expect(d.status).toBe('DELIVERED');
  expect(d.deliveredAt).not.toBeNull();
  const sent = vi.mocked(sendEmail).mock.calls.length;
  await runAutomation();
  expect(sendEmail).toHaveBeenCalledTimes(sent);
});
it('quarantines uncertain SMTP and interrupted sends without automatically duplicating mail', async () => {
  await enqueueReminder(
    {
      userId: owner.id,
      kind: 'DIGEST',
      entityId: owner.id,
      title: 'Uncertain send',
      actionUrl: '/my-work',
      period: key + '-uncertain',
    },
    true,
  );
  vi.mocked(sendEmail).mockRejectedValue(new Error('Simulated lost SMTP acknowledgement'));
  await runAutomation();
  const d = await db.deliveryRecord.findFirstOrThrow({
    where: { userId: owner.id, title: 'Uncertain send' },
  });
  expect(d.status).toBe('REVIEW_REQUIRED');
  expect(d.deliveredAt).toBeNull();
  const sent = vi.mocked(sendEmail).mock.calls.length;
  await runAutomation();
  expect(sendEmail).toHaveBeenCalledTimes(sent);
  const stale = await db.deliveryRecord.create({
    data: {
      dedupeKey: key + '-stale',
      userId: owner.id,
      kind: 'DIGEST',
      entityId: owner.id,
      title: 'Interrupted send',
      actionUrl: '/my-work',
      status: 'SENDING',
    },
  });
  await runAutomation();
  expect((await db.deliveryRecord.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(
    'REVIEW_REQUIRED',
  );
  expect(sendEmail).toHaveBeenCalledTimes(sent);
});
