import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db, Tx, transaction } from './db';
import { Actor } from './permissions';
import { requireClientProjectAccess } from './client-access';
import { selectionVariance } from './financial-math';
export { selectionVariance } from './financial-math';

export const clientFileSelect = {
  id: true,
  originalFilename: true,
  caption: true,
  description: true,
  kind: true,
  mimeType: true,
  uploadedAt: true,
} satisfies Prisma.StoredFileSelect;
export const clientOptionSelect = {
  id: true,
  name: true,
  description: true,
  manufacturer: true,
  model: true,
  finish: true,
  referenceUrl: true,
  leadTime: true,
  attachmentIds: true,
  quantity: true,
  unit: true,
  clientPrice: true,
  taxable: true,
  recommended: true,
} satisfies Prisma.SelectionOptionSelect;
export const clientSelectionSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  deadline: true,
  status: true,
  version: true,
  publishedAt: true,
  approvedAt: true,
  allowance: { select: { name: true, amount: true, taxable: true } },
  options: {
    where: { active: true },
    orderBy: { sortOrder: 'asc' as const },
    select: clientOptionSelect,
  },
  decisions: {
    select: { id: true, optionId: true, snapshot: true, comments: true, createdAt: true },
  },
} satisfies Prisma.SelectionSelect;
// Parse (strip unknown keys), never cast an issued JSON snapshot into a client DTO.
const text = z.string().nullable().optional();
export const clientChangeOrderSnapshot = z.object({
  number: z.string(),
  revision: z.number(),
  title: z.string(),
  description: text,
  scope: text,
  terms: text,
  scheduleDays: z.number(),
  issuedAt: z.string(),
  subtotal: z.string(),
  tax: z.string(),
  total: z.string(),
  taxRate: z.string(),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.string(),
      unit: text,
      amount: z.string(),
      taxable: z.boolean(),
    }),
  ),
});
export function changeOrderProjection(
  item: {
    id: string;
    version: number;
    status: string;
    snapshot: Prisma.JsonValue;
    acceptedAt: Date | null;
    clientApproval?: { snapshot: Prisma.JsonValue } | null;
  },
  visibleFileIds: string[] = [],
) {
  const source = item.clientApproval?.snapshot ?? item.snapshot;
  const refs = z
    .object({ attachments: z.array(z.object({ id: z.string(), name: z.string() })).default([]) })
    .parse(source);
  const document = {
    ...clientChangeOrderSnapshot.parse(source),
    attachments: refs.attachments.filter((f) => visibleFileIds.includes(f.id)),
  };
  return {
    id: item.id,
    version: item.version,
    status: item.status,
    acceptedAt: item.acceptedAt,
    document,
    documentHash: createHash('sha256').update(JSON.stringify(document)).digest('hex'),
  };
}
export async function clientProjects(actor: Actor) {
  if (!actor.active || actor.roles.length !== 1 || actor.roles[0] !== 'CLIENT') return [];
  return db.project.findMany({
    where: {
      active: true,
      archivedAt: null,
      portalAccess: {
        some: {
          userId: actor.id,
          active: true,
          revokedAt: null,
          contact: { active: true, portalUserId: actor.id },
        },
      },
    },
    select: { id: true, name: true, number: true, stage: true },
  });
}
export async function projectProjection(tx: Tx, projectId: string, contactId?: string) {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      number: true,
      stage: true,
      clientVisibleNotes: true,
      clientTargetCompletion: true,
    },
  });
  const schedule = await tx.projectTask.findMany({
    where: { projectId, clientVisible: true, archivedAt: null },
    select: {
      id: true,
      clientTitle: true,
      clientDescription: true,
      startDate: true,
      endDate: true,
      status: true,
      milestone: true,
    },
    orderBy: { startDate: 'asc' },
  });
  const updates = await tx.dailyLog.findMany({
    where: { projectId, clientVisible: true, clientSummary: { not: null } },
    select: { id: true, date: true, clientSummary: true },
    orderBy: { date: 'desc' },
    take: 100,
  });
  const files = await tx.storedFile.findMany({
    where: { projectId, visibility: 'CLIENT', archivedAt: null },
    select: clientFileSelect,
    orderBy: { uploadedAt: 'desc' },
  });
  const selections = await tx.selection.findMany({
    where: { projectId, publishedAt: { not: null }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    select: clientSelectionSelect,
    orderBy: { deadline: 'asc' },
  });
  const changes = await tx.changeOrderRevision.findMany({
    where: {
      changeOrder: { projectId },
      issuedAt: { not: null },
      status: { in: ['ISSUED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'] },
      ...(contactId ? { clientId: contactId } : {}),
    },
    select: {
      id: true,
      version: true,
      status: true,
      snapshot: true,
      acceptedAt: true,
      attachmentIds: true,
      clientApproval: { select: { snapshot: true } },
    },
    orderBy: { issuedAt: 'desc' },
  });
  const fileIds = new Set(files.map((f) => f.id));
  return {
    project,
    schedule,
    updates,
    files,
    selections: selections.map((s) => ({
      ...s,
      options: s.options.map((o) => ({
        ...o,
        attachmentIds: o.attachmentIds.filter((id) => fileIds.has(id)),
        variance: selectionVariance(s.allowance?.amount || 0, o.clientPrice).toString(),
      })),
    })),
    changeOrders: changes.map((c) => {
      const projected = changeOrderProjection(c, [...fileIds]);
      return { ...projected, attachmentIds: projected.document.attachments.map((f) => f.id) };
    }),
  };
}
export async function clientProject(actor: Actor, projectId: string) {
  return transaction(async (tx) => {
    const grant = await requireClientProjectAccess(actor, projectId, tx);
    return projectProjection(tx, projectId, grant.contactId);
  });
}
export type ClientProject = Awaited<ReturnType<typeof projectProjection>>;
