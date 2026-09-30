export function rolloutStage() {
  const raw = process.env.AUTOMATION_ROLLOUT_STAGE;
  if (raw === undefined) return process.env.NODE_ENV === 'production' ? 0 : 7;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 7 ? n : 0;
}
export function rolloutAllows(kind: string, roles: string[], stage = rolloutStage()) {
  if (kind === 'READINESS_TEST')
    return (
      roles.some((r) => ['OWNER', 'CONTROLLER'].includes(r)) &&
      !roles.some((r) => ['CLIENT', 'SUBTRADE', 'VENDOR'].includes(r))
    );
  if (kind === 'SUMMARY') return stage >= 7;
  if (kind === 'DIGEST') return stage >= 6;
  if (roles.includes('CLIENT')) return stage >= 5;
  if (roles.some((r) => ['SUBTRADE', 'VENDOR'].includes(r))) return stage >= 4;
  if (['WARRANTY', 'EXPIRATION'].includes(kind)) return stage >= 3;
  return stage >= 2;
}
