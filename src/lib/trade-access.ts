import { Prisma } from '@prisma/client';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { db, Tx, transaction } from './db';
import { ensure } from './errors';
import { isTrade } from './external-identity';
import { issueToken } from './auth';
import { sendEmail, appUrl } from './email';
import { documentEvent } from './financial-documents';

export async function requireTradeProjectAccess(actor: Actor, projectId: string, tx: Tx = db) {
  ensure(actor.active && isTrade(actor), 'Trade access required.', 403);
  const grant = await tx.tradeProjectAccess.findFirst({
    where: {
      projectId,
      userId: actor.id,
      active: true,
      revokedAt: null,
      user: { active: true },
      contact: {
        active: true,
        portalUserId: actor.id,
        OR: [{ companyId: null }, { company: { active: true } }],
      },
      project: { active: true, archivedAt: null },
    },
  });
  ensure(grant, 'Project not found or unavailable.', 404);
  return grant;
}
export async function projectTrade(tx: Tx, projectId: string, contactId: string) {
  const contact = await tx.contact.findFirst({
    where: {
      id: contactId,
      active: true,
      types: { hasSome: ['SUBTRADE', 'VENDOR'] },
      OR: [{ companyId: null }, { company: { active: true } }],
      projects: {
        some: {
          projectId,
          role: {
            in: ['SUBTRADE', 'VENDOR', 'ELECTRICIAN', 'PLUMBER', 'SUPPLIER', 'SUBCONTRACTOR'],
          },
        },
      },
    },
  });
  ensure(contact, 'Active project trade contact required.', 404);
  return contact;
}
export const tradeFileScope = (contactId: string): Prisma.StoredFileWhereInput => ({
  visibility: 'TRADE',
  archivedAt: null,
  OR: [{ tradeUploaderContactId: contactId }, { tradeShares: { some: { contactId } } }],
});
export const tradeTaskScope = (contactId: string): Prisma.ProjectTaskWhereInput => ({
  archivedAt: null,
  OR: [{ assignees: { some: { contactId } } }, { tradeReleases: { some: { contactId } } }],
});
export async function tradeFile(actor: Actor, id: string, tx: Tx = db) {
  const record = await tx.storedFile.findUnique({ where: { id } });
  ensure(record, 'File not found.', 404);
  const grant = await requireTradeProjectAccess(actor, record.projectId, tx);
  ensure(
    await tx.storedFile.findFirst({ where: { id, ...tradeFileScope(grant.contactId) } }),
    'File not found.',
    404,
  );
  return record; // Only the protected byte-stream handler may use storageKey.
}
export async function ensureTradeFileMutable(tx: Tx, id: string) {
  ensure(
    !(await tx.tradeFileShare.findFirst({ where: { fileId: id, lockedAt: { not: null } } })),
    'This file is retained as issued/acknowledged trade evidence.',
    409,
  );
}
export async function shareTradeFiles(
  tx: Tx,
  projectId: string,
  contactId: string,
  ids: string[],
  lock = false,
) {
  ensure(new Set(ids).size === ids.length, 'Duplicate attachments.');
  ensure(
    (await tx.storedFile.count({
      where: {
        id: { in: ids },
        projectId,
        visibility: 'TRADE',
        archivedAt: null,
        OR: [{ tradeUploaderContactId: null }, { tradeUploaderContactId: contactId }],
      },
    })) === ids.length,
    'Attachments must be trade-classified project files for this recipient.',
  );
  for (const fileId of ids)
    await tx.tradeFileShare.upsert({
      where: { fileId_contactId: { fileId, contactId } },
      create: { fileId, contactId, lockedAt: lock ? new Date() : null },
      update: lock ? { lockedAt: new Date() } : {},
    });
}
export async function manageTradeAccess(
  actor: Actor,
  projectId: string,
  contactId: string,
  action: 'invite' | 'revoke',
  role: 'SUBTRADE' | 'VENDOR',
) {
  const result = await transaction(async (tx) => {
    await requireCapability(actor, 'TRADE_ACCESS_MANAGE', tx);
    await requireProjectAccess(actor, projectId, tx);
    if (action === 'revoke') {
      await tx.tradeProjectAccess.updateMany({
        where: { projectId, contactId, active: true },
        data: { active: false, revokedAt: new Date() },
      });
      await documentEvent(tx, actor, {
        projectId,
        entity: 'Contact',
        entityId: contactId,
        action: 'TRADE_ACCESS_REVOKED',
        description: 'Trade project portal access revoked.',
        tab: 'trades',
      });
      return null;
    }
    const contact = await projectTrade(tx, projectId, contactId);
    ensure(contact.types.includes(role), 'Contact must have the selected trade type.');
    ensure(contact.email, 'Contact email required.');
    let user = contact.portalUserId
      ? await tx.user.findUnique({ where: { id: contact.portalUserId } })
      : await tx.user.findUnique({ where: { email: contact.email.toLowerCase().trim() } });
    ensure(
      !user || contact.portalUserId === user.id,
      'This contact requires an administrator to review its account link.',
    );
    if (!user)
      user = await tx.user.create({
        data: {
          email: contact.email.toLowerCase().trim(),
          firstName: contact.firstName,
          lastName: contact.lastName,
          roles: [role],
        },
      });
    ensure(
      user.active && isTrade(user) && user.roles[0] === role,
      'A dedicated compatible trade account is required.',
    );
    await tx.contact.update({ where: { id: contactId }, data: { portalUserId: user.id } });
    const grant = await tx.tradeProjectAccess.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id, contactId, invitedById: actor.id },
      update: { active: true, revokedAt: null, invitedAt: new Date(), invitedById: actor.id },
    });
    await documentEvent(tx, actor, {
      projectId,
      entity: 'TradeProjectAccess',
      entityId: grant.id,
      action: 'TRADE_ACCESS_GRANTED',
      description: 'Trade project portal invitation created or resent.',
      tab: 'trades',
    });
    await tx.notification.create({
      data: {
        userId: user.id,
        projectId,
        type: 'GENERAL',
        title: 'Your Cedar Winds trade portal',
        message: 'You have been invited to a project.',
        actionUrl: `/trade/projects/${projectId}`,
      },
    });
    return { id: user.id, email: user.email, setup: !user.passwordHash };
  });
  if (!result) return { ok: true };
  try {
    const path = result.setup
      ? `/reset-password?token=${await issueToken(result.id, 'RESET_PASSWORD')}`
      : '/trade';
    await sendEmail({
      to: result.email,
      subject: 'Your Cedar Winds trade portal invitation',
      text: `${result.setup ? 'Set your password within 30 minutes. Never share this link.' : 'Sign in with your existing account.'}\n${appUrl()}${path}`,
    });
    return { ok: true, message: 'Invitation sent.' };
  } catch {
    return {
      ok: true,
      message: 'Access saved. Email delivery failed; configure email and resend the invitation.',
    };
  }
}
