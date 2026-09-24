import { Tx, db } from './db';
import { sendEmail, appUrl } from './email';
export async function clientNotice(tx: Tx, projectId: string, title: string, contactId?: string) {
  const grants = await tx.clientProjectAccess.findMany({
    where: {
      projectId,
      active: true,
      revokedAt: null,
      user: { active: true, roles: { equals: ['CLIENT'] } },
      contact: { active: true },
      ...(contactId ? { contactId } : {}),
    },
    include: { contact: { select: { portalUserId: true } } },
  });
  const ids: string[] = [];
  for (const grant of grants) {
    if (grant.contact.portalUserId !== grant.userId) continue;
    const n = await tx.notification.create({
      data: {
        userId: grant.userId,
        projectId,
        type: 'GENERAL',
        title,
        message: 'Open your project portal to review this update.',
        actionUrl: `/client/projects/${projectId}`,
      },
    });
    ids.push(n.id);
  }
  return ids;
}
// Called once after the event transaction commits; inbox remains authoritative if SMTP fails.
export async function deliverClientNotices(ids: string[]) {
  for (const id of ids) {
    const n = await db.notification
      .findUnique({ where: { id }, include: { user: true } })
      .catch(() => null);
    if (n)
      await sendEmail({
        to: n.user.email,
        subject: n.title,
        text: `${n.message}\n${appUrl()}${n.actionUrl}`,
      }).catch(() => undefined);
  }
}
