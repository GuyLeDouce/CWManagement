import { Capability, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, Tx, json } from './db';
import { Actor, roleGrants, requireProjectAccess } from './permissions';
import { ensure } from './errors';
import { publishProjectEvent } from './activity';
import { estimateLineSchema } from './financial';

export const identifier = z.string().min(1).max(100);
export function without<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
}
export const optionalId = z
  .string()
  .max(100)
  .nullish()
  .transform((v) => v || null);
export const note = z
  .string()
  .trim()
  .max(10000)
  .nullish()
  .transform((v) => v || null);
export const day = z
  .union([z.iso.date(), z.literal('')])
  .nullish()
  .transform((v) => (v ? new Date(v + 'T00:00:00Z') : null));
export const documentLineFields = estimateLineSchema.pick({
  costCodeId: true,
  costType: true,
  description: true,
  quantity: true,
  unit: true,
  unitCost: true,
  taxable: true,
  sortOrder: true,
});
export const transitionSchema = z
  .object({
    id: identifier,
    expectedVersion: z.number().int().positive(),
    action: z.enum([
      'review',
      'return',
      'approve',
      'issue',
      'revise',
      'cancel',
      'accept',
      'reject',
      'void',
    ]),
    reason: note,
    acceptedByName: note,
    acceptanceReference: note,
  })
  .strict();
export type Transition = z.infer<typeof transitionSchema>;
export function checkVersion(item: { version: number }, version: number) {
  ensure(item.version === version, 'Document changed. Refresh before saving.', 409);
}
export async function validAttachments(tx: Tx, projectId: string, ids: string[]) {
  ensure(new Set(ids).size === ids.length, 'Duplicate attachments.');
  const files = await tx.storedFile.findMany({
    where: { id: { in: ids }, projectId, archivedAt: null },
    select: { id: true, originalFilename: true, storageKey: true },
  });
  ensure(files.length === ids.length, 'Attachments must be active files from this project.');
  return files;
}
export async function contactSnapshot(tx: Tx, id: string) {
  const contact = await tx.contact.findUnique({ where: { id }, include: { company: true } });
  ensure(
    contact?.active && (!contact.company || contact.company.active),
    'Choose an active contact and company.',
  );
  return {
    contact,
    name:
      contact.company?.legalName ||
      contact.company?.name ||
      contact.firstName + ' ' + contact.lastName,
    contactName: contact.firstName + ' ' + contact.lastName,
    email: contact.email || contact.company?.email || '',
    phone: contact.phone || contact.company?.phone || '',
    address: [
      contact.company?.address || contact.address,
      contact.company?.municipality || contact.municipality,
      contact.company?.province || contact.province,
      contact.company?.postalCode || contact.postalCode,
    ]
      .filter(Boolean)
      .join(', '),
  };
}
export async function documentIdentity(
  tx: Tx,
  actor: Actor,
  projectId: string,
  attachmentIds: string[],
) {
  const project = await requireProjectAccess(actor, projectId, tx);
  const settings = await tx.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
  const attachments = await validAttachments(tx, projectId, attachmentIds);
  return {
    project: {
      name: project.name,
      number: project.number,
      address: [project.address, project.municipality, project.province, project.postalCode]
        .filter(Boolean)
        .join(', '),
    },
    company: { name: settings.legalName, address: settings.companyAddress },
    attachments: attachments.map((x) => ({
      id: x.id,
      name: x.originalFilename,
      storageKey: x.storageKey,
    })),
  };
}
export async function documentEvent(
  tx: Tx,
  actor: Actor,
  input: {
    projectId: string;
    entity: string;
    entityId: string;
    action: string;
    description: string;
    reason?: string | null;
    notifyCapability?: Capability;
    tab: string;
  },
) {
  await publishProjectEvent(tx, { ...input, actorId: actor.id, reason: input.reason || undefined });
  if (!input.notifyCapability) return;
  const users = await tx.user.findMany({
    where: { active: true, id: { not: actor.id } },
    include: {
      capabilities: true,
      projectAssignments: { where: { projectId: input.projectId } },
      managedJobs: { where: { jobsiteId: input.projectId } },
      jobs: { where: { jobsiteId: input.projectId } },
    },
  });
  const recipients = users.filter((user) => {
    if (user.roles.includes('CLIENT')) return false;
    const has = (capability: Capability) =>
      user.capabilities.find((x) => x.capability === capability)?.granted ??
      roleGrants(user, capability);
    return (
      has(input.notifyCapability!) &&
      (has('PROJECT_VIEW_ALL') ||
        (has('PROJECT_VIEW_ASSIGNED') &&
          user.projectAssignments.length + user.managedJobs.length + user.jobs.length > 0))
    );
  });
  if (recipients.length)
    await tx.notification.createMany({
      data: recipients.map((user) => ({
        userId: user.id,
        projectId: input.projectId,
        type: 'GENERAL',
        title: input.description,
        message: input.description,
        entityType: input.entity,
        entityId: input.entityId,
        actionUrl: '/projects/' + input.projectId + '/' + input.tab,
      })),
    });
}
export async function numbering(tx: Tx, type: 'PURCHASE_ORDER' | 'WORK_ORDER' | 'CHANGE_ORDER') {
  await tx.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
  const counter =
    type === 'PURCHASE_ORDER'
      ? 'nextPurchaseOrderNumber'
      : type === 'WORK_ORDER'
        ? 'nextWorkOrderNumber'
        : 'nextChangeOrderNumber';
  const prefix =
    type === 'PURCHASE_ORDER'
      ? 'purchaseOrderPrefix'
      : type === 'WORK_ORDER'
        ? 'workOrderPrefix'
        : 'changeOrderPrefix';
  const settings = await tx.settings.update({
    where: { id: 'company' },
    data: { [counter]: { increment: 1 } },
  });
  return {
    number: settings[prefix] + '-' + String(settings[counter] - 1).padStart(4, '0'),
    settings,
  };
}
export { json, db, Prisma };
