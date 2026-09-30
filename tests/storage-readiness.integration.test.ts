import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { digest } from '../src/lib/crypto';
import { AppError } from '../src/lib/errors';
import { testStorage, cleanupStorage } from '../src/lib/readiness';
import { GET } from '../src/app/api/files/[id]/route';
import type { Actor } from '../src/lib/permissions';
const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  objects: new Map<string, Uint8Array>(),
  failRemove: false,
}));
vi.mock('../src/lib/auth', async (original) => ({
  ...(await original<typeof import('../src/lib/auth')>()),
  rateLimit: async () => {},
  requireUser: async () => {
    if (!state.actor) throw new AppError(401, 'Authentication required.');
    return state.actor;
  },
}));
vi.mock('../src/lib/storage', () => ({
  storageConfigured: () => true,
  storageDriver: () => 's3',
  storage: () => ({
    put: async (o: { key: string; bytes: Uint8Array }) => {
      state.objects.set(o.key, o.bytes);
    },
    get: async (k: string) => state.objects.get(k)!,
    remove: async (k: string) => {
      if (state.failRemove) throw Error('Unavailable');
      state.objects.delete(k);
    },
  }),
}));
let owner: Actor;
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL || 'http://invalid').pathname.endsWith('_test'))
    throw Error('Isolated test database required');
  owner = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      firstName: 'Storage',
      lastName: 'Diagnostic',
      roles: ['OWNER'],
    },
  });
});
afterAll(() => db.$disconnect());
const http: typeof fetch = async (input, init) => {
  const req = new Request(input, init),
    token = req.headers.get('cookie')?.split('=')[1];
  const session = token
    ? await db.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: true } })
    : null;
  state.actor = session?.user || null;
  return GET(req, {
    params: Promise.resolve({ id: new URL(req.url).pathname.split('/').at(-1)! }),
  });
};
it('runs protected file handlers, cleans bytes/access and retains archived evidence', async () => {
  const id = randomUUID(),
    r = await testStorage(owner, id, http);
  expect(r.state, JSON.stringify(r)).toBe('VERIFIED');
  expect(state.objects.size).toBe(0);
  const p = await db.project.findUniqueOrThrow({ where: { number: `DIAG-${id}` } });
  expect(p.active).toBe(false);
  expect(p.archivedAt).not.toBeNull();
  expect(
    await db.session.count({ where: { user: { email: { startsWith: `diag-${id}-` } } } }),
  ).toBe(0);
  expect(await db.storedFile.count({ where: { projectId: p.id, archivedAt: { not: null } } })).toBe(
    3,
  );
  expect((await testStorage(owner, id, http)).state).toBe('ALREADY_REQUESTED');
});
it('revokes temporary access even when byte cleanup fails and permits deliberate cleanup retry', async () => {
  const id = randomUUID();
  state.failRemove = true;
  const r = await testStorage(owner, id, http);
  expect(r.state).toBe('ERROR');
  expect(
    await db.user.count({ where: { email: { startsWith: `diag-${id}-` }, active: true } }),
  ).toBe(0);
  state.failRemove = false;
  await cleanupStorage(owner, id);
  expect(state.objects.size).toBe(0);
  await expect(cleanupStorage(owner, randomUUID())).rejects.toThrow();
});
