import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function startProduction({ migrate, serve }) {
  const result = await migrate();
  if (result !== 0) throw new Error('Production migrations failed; application startup stopped.');
  await serve();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required before startup.');
    await startProduction({
      migrate: () =>
        spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
          stdio: 'inherit',
        }).status,
      serve: () => import(pathToFileURL(resolve('server.js')).href),
    });
  } catch {
    console.error('Production startup blocked: check migration logs and configuration.');
    process.exitCode = 1;
  }
}
