// Railway Cron start command. Values come from private service variables.
try {
  const url = new URL(process.env.APP_URL || '');
  if (url.protocol !== 'https:' || (process.env.AUTOMATION_SECRET?.length || 0) < 32) throw Error();
  const response = await fetch(new URL('/api/automation/run', url), {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.AUTOMATION_SECRET}` },
    signal: AbortSignal.timeout(240000),
  });
  if (!response.ok) throw Error();
  const result = await response.json();
  console.log(
    JSON.stringify({
      scheduler: result.busy ? 'BUSY' : result.disabled ? 'DISABLED' : 'COMPLETED',
      generated: result.generated,
      delivered: result.delivered,
    }),
  );
} catch {
  console.error('Scheduler invocation failed; check authorized readiness diagnostics.');
  process.exitCode = 1;
}
