import { it, expect, vi, afterEach } from 'vitest';
import { rolloutAllows, rolloutStage } from '../src/lib/automation-rollout';
import { startProduction } from '../scripts/start-production.mjs';
afterEach(() => vi.unstubAllEnvs());
it('fails closed on migration failure before serving requests', async () => {
  const serve = vi.fn();
  await expect(startProduction({ migrate: () => 1, serve })).rejects.toThrow();
  expect(serve).not.toHaveBeenCalled();
  await startProduction({ migrate: () => 0, serve });
  expect(serve).toHaveBeenCalledOnce();
});
it('defaults production reminders off and rejects invalid stages', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTOMATION_ROLLOUT_STAGE', undefined);
  expect(rolloutStage()).toBe(0);
  vi.stubEnv('AUTOMATION_ROLLOUT_STAGE', '99');
  expect(rolloutStage()).toBe(0);
});
it('releases reminders gradually without enabling client summaries early', () => {
  expect(rolloutAllows('TASK', ['PM'], 1)).toBe(false);
  expect(rolloutAllows('TASK', ['PM'], 2)).toBe(true);
  expect(rolloutAllows('WARRANTY', ['PM'], 2)).toBe(false);
  expect(rolloutAllows('WARRANTY', ['PM'], 3)).toBe(true);
  expect(rolloutAllows('TASK', ['SUBTRADE'], 3)).toBe(false);
  expect(rolloutAllows('TASK', ['SUBTRADE'], 4)).toBe(true);
  expect(rolloutAllows('SELECTION', ['CLIENT'], 4)).toBe(false);
  expect(rolloutAllows('SELECTION', ['CLIENT'], 5)).toBe(true);
  expect(rolloutAllows('DIGEST', ['OWNER'], 5)).toBe(false);
  expect(rolloutAllows('SUMMARY', ['CLIENT'], 6)).toBe(false);
  expect(rolloutAllows('SUMMARY', ['CLIENT'], 7)).toBe(true);
});
it('limits diagnostic reminders to unmixed internal operators', () => {
  expect(rolloutAllows('READINESS_TEST', ['OWNER'], 0)).toBe(true);
  expect(rolloutAllows('READINESS_TEST', ['OWNER', 'CLIENT'], 0)).toBe(false);
  expect(rolloutAllows('READINESS_TEST', ['PM'], 0)).toBe(false);
});
