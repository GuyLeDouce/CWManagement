import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword, randomToken } from '../src/lib/crypto';
import { validZone } from '../src/lib/time';
const db = new PrismaClient();
async function main() {
  const email = process.env.OWNER_EMAIL?.toLowerCase().trim(),
    password = process.env.OWNER_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      'Set OWNER_EMAIL and a unique OWNER_PASSWORD of at least 12 characters before seeding.',
    );
  const timezone = process.env.APP_TIMEZONE ?? 'America/Toronto';
  if (!validZone(timezone)) throw new Error('Invalid APP_TIMEZONE.');
  await db.settings.upsert({
    where: { id: 'company' },
    update: {},
    create: { id: 'company', timezone },
  });
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing)
    await db.user.create({
      data: {
        firstName: process.env.OWNER_FIRST_NAME ?? 'Owner',
        lastName: process.env.OWNER_LAST_NAME ?? 'Account',
        email,
        passwordHash: await hashPassword(password),
        roles: ['OWNER', 'ADMIN'],
        earliestStart: '07:00',
      },
    });
  // Rerunning the seed never changes an existing password or permission assignment.
  for (const [number, name] of [
    ['OVERHEAD-ADMIN', 'Cedar Winds – General Administration'],
    ['OVERHEAD-SALES', 'Cedar Winds – Sales'],
    ['OVERHEAD-EST', 'Cedar Winds – Estimating'],
  ])
    await db.jobsite.upsert({
      where: { number },
      update: {},
      create: { number, name, overhead: true },
    });
  if (!(await db.qrCode.findFirst({ where: { type: 'SHOP', active: true } })))
    await db.qrCode.create({
      data: { type: 'SHOP', label: 'Shop entrance', token: randomToken() },
    });
  console.info(
    'Setup complete. Sign in as the configured owner. Add employees, projects, tasks, and accounting mappings in Admin.',
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : 'Seed failed.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
