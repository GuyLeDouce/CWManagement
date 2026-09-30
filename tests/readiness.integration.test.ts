import { beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { testEmail, confirmEmail, readiness, requireReadiness } from '../src/lib/readiness';
import { sendEmail } from '../src/lib/email';
vi.mock('../src/lib/email', () => ({
  appUrl: () => 'https://example.test',
  checkEmailConfiguration: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));
let owner: Awaited<ReturnType<typeof db.user.create>>;
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL || 'http://invalid').pathname.endsWith('_test'))
    throw Error('Isolated test database required');
  await db.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
  owner = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      firstName: 'Readiness',
      lastName: 'Test',
      roles: ['OWNER'],
    },
  });
});
afterAll(() => db.$disconnect());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('denies external and ordinary internal diagnostic access', () => {
  expect(() => requireReadiness({ ...owner, roles: ['CLIENT'] })).toThrow();
  expect(() => requireReadiness({ ...owner, roles: ['PM'] })).toThrow();
  expect(() => requireReadiness({ ...owner, roles: ['OWNER', 'VENDOR'] })).toThrow();
});
it('sends only to the operator and never repeats the same email request', async () => {
  vi.stubEnv('EMAIL_PROVIDER', 'smtp');
  const id = randomUUID();
  await testEmail(owner, id);
  await testEmail(owner, id);
  expect(sendEmail).toHaveBeenCalledOnce();
  expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(owner.email);
  await confirmEmail(owner, id);
  const r = await readiness(owner);
  expect(r.email.inboxConfirmed).toBe(true);
  expect(JSON.stringify(r)).not.toContain('fingerprint');
});
it('retains uncertain SMTP failure and requires a distinct deliberate attempt', async () => {
  vi.stubEnv('EMAIL_PROVIDER', 'smtp');
  vi.mocked(sendEmail).mockRejectedValueOnce(Error('Timeout'));
  const id = randomUUID();
  expect((await testEmail(owner, id)).state).toBe('ERROR');
  expect((await testEmail(owner, id)).state).toBe('ALREADY_REQUESTED');
  expect(sendEmail).toHaveBeenCalledOnce();
  await expect(confirmEmail(owner, id)).rejects.toThrow();
});
