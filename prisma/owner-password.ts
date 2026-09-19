import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, privateKey } from '../src/lib/crypto';

// Called only by the operator's CLI command, never from an HTTP route.
export async function resetOwnerPassword(db: PrismaClient, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (
    !z.email().safeParse(normalizedEmail).success ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error('Set OWNER_EMAIL and an OWNER_PASSWORD of 12–128 characters.');
  const loginKey = privateKey(`login:${normalizedEmail}`);
  const passwordHash = await hashPassword(password);
  await db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { email: normalizedEmail } });
      if (!user || !user.active || !user.roles.includes('OWNER'))
        throw new Error(
          'OWNER_EMAIL must match an existing active Owner account. No account was changed.',
        );
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.actionToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.rateLimit.deleteMany({ where: { key: loginKey } });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'OWNER_PASSWORD_RECOVERY',
          entity: 'User',
          entityId: user.id,
          after: { sessionsRevoked: true, tokensRevoked: true, loginLimitCleared: true },
          reason: 'Operator ran db:owner-reset inside the application service.',
        },
      });
    },
    { isolationLevel: 'Serializable', timeout: 20000 },
  );
}
