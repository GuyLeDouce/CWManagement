import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { resetOwnerPassword } from './owner-password';

const db = new PrismaClient();
resetOwnerPassword(db, process.env.OWNER_EMAIL ?? '', process.env.OWNER_PASSWORD ?? '')
  .then(() => {
    console.info(
      'Owner password reset. Sign in with OWNER_EMAIL and OWNER_PASSWORD. Remove OWNER_PASSWORD from service variables after confirming access.',
    );
  })
  .catch((error) => {
    if (error instanceof Error && error.constructor === Error) console.error(error.message);
    else
      console.error(
        'Owner password reset failed. Check DATABASE_URL, database migrations, and rerun the command.',
      );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
