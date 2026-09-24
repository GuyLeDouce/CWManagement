import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { db, Tx, transaction } from './db';
import { ensure } from './errors';
import { issueToken } from './auth';
import { appUrl, sendEmail } from './email';
import { documentEvent } from './financial-documents';

export async function requireClientProjectAccess(actor: Actor, projectId: string, tx: Tx = db) {
  ensure(
    actor.active && actor.roles.length === 1 && actor.roles[0] === 'CLIENT',
    'Client access required.',
    403,
  );
  const grant = await tx.clientProjectAccess.findFirst({
    where: {
      projectId,
      userId: actor.id,
      active: true,
      revokedAt: null,
      user: { active: true },
      contact: { active: true, portalUserId: actor.id },
      project: { active: true, archivedAt: null },
    },
  });
  ensure(grant, 'Project not found or unavailable.', 404);
  return grant;
}

export async function clientFile(actor: Actor, id: string, tx: Tx = db) {
  const file = await tx.storedFile.findFirst({
    where: { id, visibility: 'CLIENT', archivedAt: null },
  });
  ensure(file, 'File not found.', 404);
  await requireClientProjectAccess(actor, file.projectId, tx);
  return file; // Server-only download adapter; never serialize this record.
}

export async function manageClientAccess(
  actor: Actor,
  projectId: string,
  contactId: string,
  action: 'invite' | 'revoke',
) {
  const result = await transaction(async (tx) => {
    await requireCapability(actor, 'CLIENT_ACCESS_MANAGE', tx);
    await requireProjectAccess(actor, projectId, tx);
    const link = await tx.projectContact.findUnique({
      where: { projectId_contactId_role: { projectId, contactId, role: 'CLIENT' } },
      include: { contact: true },
    });
    ensure(link?.contact.active, 'Active project client contact required.');
    const contact = link.contact;
    if (action === 'revoke') {
      await tx.clientProjectAccess.updateMany({
        where: { projectId, contactId, active: true },
        data: { active: false, revokedAt: new Date() },
      });
      await documentEvent(tx, actor, {
        projectId,
        entity: 'Contact',
        entityId: contactId,
        action: 'CLIENT_ACCESS_REVOKED',
        description: 'Client portal project access revoked.',
        tab: 'clients',
      });
      return null;
    }
    ensure(contact.email, 'Contact email is required.');
    const email = contact.email.trim().toLowerCase();
    let user = contact.portalUserId
      ? await tx.user.findUnique({ where: { id: contact.portalUserId } })
      : await tx.user.findUnique({ where: { email } });
    // Never attach an existing account by matching an email alone.
    ensure(
      !user || contact.portalUserId === user.id,
      'This contact requires an administrator to review its account link.',
    );
    if (!user)
      user = await tx.user.create({
        data: {
          email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          roles: ['CLIENT'],
        },
      });
    ensure(
      user.active && user.roles.length === 1 && user.roles[0] === 'CLIENT',
      'A dedicated active client account is required.',
    );
    await tx.contact.update({ where: { id: contactId }, data: { portalUserId: user.id } });
    const grant = await tx.clientProjectAccess.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id, contactId, invitedById: actor.id },
      update: { active: true, revokedAt: null, invitedAt: new Date(), invitedById: actor.id },
    });
    await documentEvent(tx, actor, {
      projectId,
      entity: 'ClientProjectAccess',
      entityId: grant.id,
      action: 'CLIENT_ACCESS_GRANTED',
      description: 'Client portal invitation created or resent.',
      tab: 'clients',
    });
    await tx.notification.create({
      data: {
        userId: user.id,
        projectId,
        type: 'GENERAL',
        title: 'Your Cedar Winds project',
        message: 'You have been invited to your project portal.',
        actionUrl: '/client',
      },
    });
    return { userId: user.id, email: user.email, needsSetup: !user.passwordHash };
  });
  if (!result) return { ok: true };
  try {
    const link = result.needsSetup
      ? `/reset-password?token=${await issueToken(result.userId, 'RESET_PASSWORD')}`
      : '/client';
    await sendEmail({
      to: result.email,
      subject: 'Your Cedar Winds client portal invitation',
      text: `Welcome to your project portal. ${result.needsSetup ? 'Set your password within 30 minutes. Never share this link.' : 'Sign in with your existing account.'}\n${appUrl()}${link}`,
    });
    return { ok: true, message: 'Invitation sent.' };
  } catch {
    return {
      ok: true,
      message:
        'Project access saved. Email delivery failed; configure email and resend the invitation.',
    };
  }
}
