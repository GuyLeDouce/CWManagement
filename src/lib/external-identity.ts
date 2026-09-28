import type { User } from '@prisma/client';
export const isExternal = (user: Pick<User, 'roles'>) =>
  user.roles.some((r) => ['CLIENT', 'SUBTRADE', 'VENDOR'].includes(r));
export const isTrade = (user: Pick<User, 'roles'>) =>
  user.roles.length === 1 && ['SUBTRADE', 'VENDOR'].includes(user.roles[0]);
export const portalPath = (user: Pick<User, 'roles'>) =>
  user.roles.length !== 1
    ? '/login?restricted=1'
    : user.roles[0] === 'CLIENT'
      ? '/client'
      : isTrade(user)
        ? '/trade'
        : '/';
