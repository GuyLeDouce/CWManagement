import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { transaction, Tx } from './db';
import { Actor } from './permissions';
import { requireTradeProjectAccess, tradeFileScope, tradeTaskScope } from './trade-access';
import { ensure } from './errors';
import { isTrade } from './external-identity';

const optionalText = z.string().nullable().optional();
// Unknown fields are stripped recursively. Never spread financial snapshots into a portal response.
export const tradePurchasingSnapshot = z.object({
  number: z.string(),
  revision: z.number(),
  type: z.string(),
  title: z.string(),
  scope: optionalText,
  terms: optionalText,
  notes: optionalText,
  expectedDate: optionalText,
  issuedAt: z.string(),
  project: z.object({ name: z.string(), number: z.string(), address: optionalText }),
  company: z.object({ name: z.string(), address: optionalText }),
  vendor: z.object({
    name: z.string(),
    contactName: z.string(),
    email: optionalText,
    phone: optionalText,
    address: optionalText,
  }),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.string(),
      unit: optionalText,
      unitCost: z.string(),
      amount: z.string(),
      taxable: z.boolean(),
    }),
  ),
  subtotal: z.string(),
  tax: z.string(),
  total: z.string(),
});
export function purchasingProjection(snapshot: unknown) {
  const s = tradePurchasingSnapshot.parse(snapshot);
  return {
    ...s,
    lines: s.lines.map(({ unitCost, ...line }) => ({ ...line, unitPrice: unitCost })),
  };
}
export const instructionSnapshot = z.object({
  number: z.string(),
  title: z.string(),
  description: z.string(),
  issuedAt: z.string(),
  acknowledgementRequired: z.boolean(),
  attachments: z.array(z.object({ id: z.string(), name: z.string(), revision: optionalText })),
});
export const evidenceHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const tradeFileSelect = {
  id: true,
  originalFilename: true,
  caption: true,
  description: true,
  kind: true,
  category: true,
  mimeType: true,
  uploadedAt: true,
  revisionLabel: true,
  origin: true,
  deficiencyId: true,
  siteInstructionId: true,
  tradePurchasingRevisionId: true,
} satisfies Prisma.StoredFileSelect;
export async function ownPurchasing(
  tx: Tx,
  projectId: string,
  contactId: string,
  id: string,
  current = false,
) {
  const r = await tx.purchasingRevision.findFirst({
    where: {
      id,
      vendorContactId: contactId,
      issuedAt: { not: null },
      document: { projectId },
      ...(current ? { status: { in: ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'] } } : {}),
    },
    include: { document: true },
  });
  ensure(r, 'Issued work not found.', 404);
  return r;
}
export async function tradeProjects(actor: Actor) {
  ensure(actor.active && isTrade(actor), 'Trade access required.', 403);
  return transaction(async (tx) => {
    const grants = await tx.tradeProjectAccess.findMany({
      where: { userId: actor.id, active: true, revokedAt: null },
      select: { projectId: true },
    });
    const result = [];
    for (const g of grants) {
      try {
        await requireTradeProjectAccess(actor, g.projectId, tx);
      } catch {
        continue;
      }
      const p = await tx.project.findUniqueOrThrow({
        where: { id: g.projectId },
        select: { id: true, name: true, number: true, address: true },
      });
      result.push(p);
    }
    return result;
  });
}
export async function tradeProject(actor: Actor, projectId: string) {
  return transaction(async (tx) => {
    const grant = await requireTradeProjectAccess(actor, projectId, tx);
    const contactId = grant.contactId;
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        number: true,
        address: true,
        municipality: true,
        province: true,
        postalCode: true,
      },
    });
    const managers = await tx.projectAssignment.findMany({
      where: { projectId, role: 'PRIMARY_PROJECT_MANAGER' },
      select: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    const files = await tx.storedFile.findMany({
      where: { projectId, ...tradeFileScope(contactId) },
      select: tradeFileSelect,
      orderBy: { uploadedAt: 'desc' },
    });
    const work = await tx.purchasingRevision.findMany({
      where: { document: { projectId }, vendorContactId: contactId, issuedAt: { not: null } },
      select: {
        id: true,
        status: true,
        snapshot: true,
        attachmentIds: true,
        tradeAcknowledgements: {
          where: { contactId },
          select: { createdAt: true, typedName: true, snapshotHash: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
    const schedule = await tx.projectTask.findMany({
      where: { projectId, ...tradeTaskScope(contactId) },
      select: {
        id: true,
        name: true,
        tradeTitle: true,
        tradeDescription: true,
        startDate: true,
        endDate: true,
        status: true,
        milestone: true,
        tradeResponses: {
          where: { contactId },
          select: {
            id: true,
            response: true,
            comment: true,
            createdAt: true,
            resolvedAt: true,
            resolution: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { startDate: 'asc' },
    });
    const instructions = await tx.siteInstruction.findMany({
      where: { projectId, issuedAt: { not: null }, recipients: { some: { contactId } } },
      select: {
        id: true,
        status: true,
        snapshot: true,
        acknowledgements: {
          where: { contactId },
          select: { createdAt: true, typedName: true, snapshotHash: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
    const deficiencies = await tx.deficiency.findMany({
      where: { projectId, assignedContactId: contactId },
      select: {
        id: true,
        number: true,
        title: true,
        description: true,
        location: true,
        priority: true,
        status: true,
        version: true,
        dueDate: true,
        completedAt: true,
        verifiedAt: true,
        attachmentIds: true,
        updates: {
          where: { recipientContactId: contactId },
          select: { status: true, comment: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    const notifications = await tx.notification.findMany({
      where: { userId: actor.id, projectId, actionUrl: { startsWith: '/trade' } },
      select: { id: true, title: true, createdAt: true, readAt: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    const threads = await tx.conversation.findMany({
      where: { projectId, audience: 'TRADE', tradeContactId: contactId },
      select: {
        reads: { where: { userId: actor.id }, select: { readAt: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    });
    return {
      project,
      unreadConversations: threads.filter(
        (t) => t.messages[0] && (!t.reads[0] || t.messages[0].createdAt > t.reads[0].readAt),
      ).length,
      siteContacts: managers.map((m) => m.user),
      role: actor.roles[0],
      files,
      work: work.map((r) => ({
        id: r.id,
        status: r.status,
        document: purchasingProjection(r.snapshot),
        attachments: files.filter((f) => r.attachmentIds.includes(f.id)),
        acknowledgement: r.tradeAcknowledgements[0] ?? null,
      })),
      schedule: schedule.map(({ name, tradeTitle, tradeDescription, tradeResponses, ...s }) => ({
        ...s,
        title: tradeTitle || name,
        description: tradeDescription,
        responses: tradeResponses,
      })),
      instructions: instructions.map((r) => ({
        id: r.id,
        status: r.status,
        document: instructionSnapshot.parse(r.snapshot),
        acknowledgement: r.acknowledgements[0] ?? null,
      })),
      deficiencies: deficiencies.map(({ attachmentIds, ...d }) => ({
        ...d,
        attachments: files.filter((f) => attachmentIds.includes(f.id) || f.deficiencyId === d.id),
      })),
      notifications,
    };
  });
}
export type TradeProject = Awaited<ReturnType<typeof tradeProject>>;
