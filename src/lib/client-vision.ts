import { z } from 'zod';
import { db, Tx, transaction, audit } from './db';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { isExternal } from './external-identity';
import { ensure } from './errors';
import { clientPreferences, clientPreferencesSelect } from './client-preferences';
import { projectProjection } from './client-projections';
import { documentEvent } from './financial-documents';

export async function requireClientPreview(actor: Actor, projectId: string, tx: Tx = db) {
  ensure(actor.active && !isExternal(actor), 'Internal client preview access required.', 403);
  await requireCapability(actor, 'CLIENT_PREVIEW', tx);
  await requireProjectAccess(actor, projectId, tx);
}
export async function clientPreview(actor: Actor, projectId: string, contactId?: string) {
  return transaction(async (tx) => {
    await requireClientPreview(actor, projectId, tx);
    const links = await tx.projectContact.findMany({
      where: { projectId, role: 'CLIENT', contact: { active: true } },
      select: {
        contact: { select: { id: true, firstName: true, lastName: true, portalUserId: true } },
      },
    });
    const selected = contactId ? links.find((l) => l.contact.id === contactId)?.contact : undefined;
    ensure(!contactId || selected, 'Project client not found.', 404);
    return {
      ...(await projectProjection(tx, projectId, contactId, selected?.portalUserId ?? undefined)),
      preview: {
        clients: links.map(({ contact }) => ({
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`,
        })),
        contactId: contactId ?? null,
      },
    };
  });
}
export async function previewFile(actor: Actor, id: string, projectId: string, tx: Tx = db) {
  await requireClientPreview(actor, projectId, tx);
  const file = await tx.storedFile.findFirst({
    where: { id, projectId, visibility: 'CLIENT', archivedAt: null },
  });
  ensure(file, 'File not found.', 404);
  return file; // Server-only storage adapter; never a DTO.
}
export const clientPreferencesSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    clientTaxDisplayMode: z.enum(['FINAL_TOTAL_ONLY', 'SHOW_TAX_BREAKDOWN']).nullable(),
    clientFinancialSummaryEnabled: z.boolean().nullable(),
    clientManagerVisible: z.boolean().nullable(),
  })
  .strict();
export async function viewClientPreferences(actor: Actor, projectId?: string) {
  if (projectId) {
    await requireCapability(actor, 'CLIENT_CONTENT_PUBLISH');
    await requireProjectAccess(actor, projectId);
    return clientPreferences(db, projectId);
  }
  await requireCapability(actor, 'SETTINGS_MANAGE');
  return db.settings.upsert({
    where: { id: 'company' },
    create: {},
    update: {},
    select: clientPreferencesSelect,
  });
}
export async function saveClientPreferences(
  actor: Actor,
  input: z.infer<typeof clientPreferencesSchema>,
) {
  return transaction(async (tx) => {
    const { projectId, ...data } = input;
    if (projectId) {
      await requireCapability(actor, 'CLIENT_CONTENT_PUBLISH', tx);
      await requireProjectAccess(actor, projectId, tx);
      const before = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: clientPreferencesSelect,
      });
      await tx.project.update({ where: { id: projectId }, data });
      await audit(tx, actor.id, 'CLIENT_VIEW_SETTINGS_CHANGED', 'Project', projectId, before, data);
      await documentEvent(tx, actor, {
        projectId,
        entity: 'Project',
        entityId: projectId,
        action: 'CLIENT_VIEW_SETTINGS_CHANGED',
        description: 'Client View presentation settings updated.',
        tab: 'settings',
      });
    } else {
      await requireCapability(actor, 'SETTINGS_MANAGE', tx);
      ensure(
        data.clientTaxDisplayMode !== null &&
          data.clientFinancialSummaryEnabled !== null &&
          data.clientManagerVisible !== null,
        'Company defaults cannot inherit.',
      );
      const before = await tx.settings.findUnique({
        where: { id: 'company' },
        select: clientPreferencesSelect,
      });
      const defaults = {
        clientTaxDisplayMode: data.clientTaxDisplayMode!,
        clientFinancialSummaryEnabled: data.clientFinancialSummaryEnabled!,
        clientManagerVisible: data.clientManagerVisible!,
      };
      await tx.settings.upsert({ where: { id: 'company' }, create: defaults, update: defaults });
      await audit(
        tx,
        actor.id,
        'CLIENT_VIEW_DEFAULTS_CHANGED',
        'Settings',
        'company',
        before,
        defaults,
      );
    }
    return { ok: true };
  });
}
