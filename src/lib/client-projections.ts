import { ClientTaxDisplayMode, Prisma } from '@prisma/client';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db, Tx, transaction } from './db';
import { Actor } from './permissions';
import { requireClientProjectAccess } from './client-access';
import { clientPreferences } from './client-preferences';
import { clientContractSummary, clientPrice } from './client-pricing';
import { clientConversations } from './client-messages';
import { warrantyProjection } from './warranty';
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
  taxDisplayMode: ClientTaxDisplayMode = 'FINAL_TOTAL_ONLY',
) {
  const source = item.clientApproval?.snapshot ?? item.snapshot;
  const refs = z
    .object({ attachments: z.array(z.object({ id: z.string(), name: z.string() })).default([]) })
    .parse(source);
  const document = {
    ...clientChangeOrderSnapshot.parse(source),
    taxDisplayMode:
      z
        .object({ taxDisplayMode: z.enum(['FINAL_TOTAL_ONLY', 'SHOW_TAX_BREAKDOWN']).optional() })
        .parse(source).taxDisplayMode ?? taxDisplayMode,
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
export async function projectProjection(
  tx: Tx,
  projectId: string,
  contactId?: string,
  userId?: string,
) {
  const { effective: preferences } = await clientPreferences(tx, projectId);
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      number: true,
      stage: true,
      clientVisibleNotes: true,
      clientTargetCompletion: true,
      address: true,
      status: true,
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
    where: { projectId, visibility: 'CLIENT', archivedAt: null, OR:[{warrantyRequestId:null},{warrantyRequest:{clientContactId:contactId??'__no_client__'}}] },
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
      clientId: contactId ?? '__general_preview_no_recipient__',
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
  const specifications = await tx.projectSpecification.findMany({
    where: { projectId, clientVisible: true },
    select: { id: true, title: true, category: true, description: true, updatedAt: true },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
  });
  const proposals = await tx.proposalRevision.findMany({
    where: {
      proposal: { projectId },
      status: { in: ['ISSUED', 'ACCEPTED', 'SUPERSEDED'] },
      issueDate: { not: null },
      OR: [{ clientId: null }, ...(contactId ? [{ clientId: contactId }] : [])],
    },
    select: {
      id: true,
      revision: true,
      status: true,
      issueDate: true,
      acceptedAt: true,
      introduction: true,
      scope: true,
      exclusions: true,
      assumptions: true,
      terms: true,
      projectNameSnapshot: true,
      sectionsSnapshot: true,
      subtotal: true,
      taxAmount: true,
      total: true,
      proposal: { select: { proposalNumber: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const sectionSchema = z.array(
    z.object({
      name: z.string(),
      description: text,
      lines: z.array(
        z.object({ description: z.string(), quantity: z.string(), unit: text, price: z.string() }),
      ),
    }),
  );
  const managers = preferences.clientManagerVisible
    ? await tx.projectAssignment.findMany({
        where: { projectId, role: 'PRIMARY_PROJECT_MANAGER', user: { active: true } },
        select: { user: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const notifications = userId
    ? await tx.notification.findMany({
        where: { userId, projectId, actionUrl: { startsWith: '/client' } },
        select: { id: true, title: true, message: true, readAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    : [];
  return {
    warranty: await warrantyProjection(tx,projectId,contactId),
    presentation: { taxDisplayMode: preferences.clientTaxDisplayMode },
    managers: managers.map((m) => ({ name: `${m.user.firstName} ${m.user.lastName}` })),
    financialSummary: preferences.clientFinancialSummaryEnabled
      ? await clientContractSummary(tx, projectId, contactId, preferences.clientTaxDisplayMode)
      : null,
    proposals: proposals.map((p) => ({
      id: p.id,
      number: p.proposal.proposalNumber,
      title: p.proposal.title,
      revision: p.revision,
      status: p.status,
      issueDate: p.issueDate,
      acceptedAt: p.acceptedAt,
      projectName: p.projectNameSnapshot,
      introduction: p.introduction,
      scope: p.scope,
      exclusions: p.exclusions,
      assumptions: p.assumptions,
      terms: p.terms,
      sections: sectionSchema.parse(p.sectionsSnapshot),
      price: clientPrice(p.subtotal, p.taxAmount, p.total, preferences.clientTaxDisplayMode),
    })),
    conversations: await clientConversations(tx, projectId, contactId, userId),
    notifications,
    specifications,
    project,
    schedule,
    updates,
    files,
    selections: selections.map((s) => ({
      ...s,
      decisions: s.decisions.map(({ snapshot, ...decision }) => ({
        ...decision,
        snapshot: z
          .object({
            title: z.string(),
            selectedPrice: z.string(),
            allowance: z.string(),
            variance: z.string(),
          })
          .parse(snapshot),
      })),
      options: s.options.map((o) => ({
        ...o,
        attachmentIds: o.attachmentIds.filter((id) => fileIds.has(id)),
        variance: selectionVariance(s.allowance?.amount || 0, o.clientPrice).toString(),
      })),
    })),
    changeOrders: changes.map((c) => {
      const projected = changeOrderProjection(c, [...fileIds], preferences.clientTaxDisplayMode);
      return { ...projected, attachmentIds: projected.document.attachments.map((f) => f.id) };
    }),
  };
}
export async function clientProject(actor: Actor, projectId: string) {
  return transaction(async (tx) => {
    const grant = await requireClientProjectAccess(actor, projectId, tx);
    return projectProjection(tx, projectId, grant.contactId, actor.id);
  });
}
export type ClientProject = Awaited<ReturnType<typeof projectProjection>>;
