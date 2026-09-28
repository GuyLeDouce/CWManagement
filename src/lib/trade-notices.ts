import { Tx } from './db';
export { deliverPortalNotices } from './client-notices';
export async function tradeNotice(tx: Tx, projectId: string, contactIds: string[], title: string) {
  const grants = await tx.tradeProjectAccess.findMany({
    where: {
      projectId,
      contactId: { in: contactIds },
      active: true,
      revokedAt: null,
      user: {
        active: true,
        OR: [{ roles: { equals: ['SUBTRADE'] } }, { roles: { equals: ['VENDOR'] } }],
      },
      contact: { active: true },
    },
    include: { contact: { select: { portalUserId: true } } },
  });
  const ids: string[] = [];
  for (const g of grants)
    if (g.contact.portalUserId === g.userId) {
      const n = await tx.notification.create({
        data: {
          userId: g.userId,
          projectId,
          type: 'GENERAL',
          title,
          message: 'Open your trade portal to review this update.',
          actionUrl: `/trade/projects/${projectId}`,
        },
      });
      ids.push(n.id);
    }
  return ids;
}
