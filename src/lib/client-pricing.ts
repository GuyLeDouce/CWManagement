import { Prisma, ClientTaxDisplayMode } from '@prisma/client';
import { Tx } from './db';
import { money } from './financial-math';
// Presentation only. Never infer historical tax from today's company tax rate.
export function clientPrice(
  subtotal: Prisma.Decimal.Value,
  tax: Prisma.Decimal.Value,
  total: Prisma.Decimal.Value,
  mode: ClientTaxDisplayMode,
) {
  return mode === 'SHOW_TAX_BREAKDOWN'
    ? {
        subtotal: money(subtotal).toFixed(2),
        tax: money(tax).toFixed(2),
        total: money(total).toFixed(2),
      }
    : { total: money(total).toFixed(2) };
}
export async function clientContractSummary(
  tx: Tx,
  projectId: string,
  contactId: string | undefined,
  mode: ClientTaxDisplayMode,
) {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { contractAmount: true },
  });
  const sources = await tx.proposalRevision.findMany({
    where: {
      proposal: { projectId },
      status: 'ACCEPTED',
      subtotal: project.contractAmount ?? undefined,
    },
    select: { subtotal: true, taxAmount: true, total: true, clientId: true },
  });
  const adjustments = await tx.contractAdjustment.findMany({
    where: { projectId },
    select: {
      amount: true,
      revision: { select: { clientId: true, subtotal: true, taxAmount: true, total: true } },
    },
  });
  // A complete project total would disclose another recipient's addressed changes.
  if (adjustments.some((a) => a.revision.clientId !== (contactId ?? null))) return null;
  const matching = sources.filter((s) => s.clientId === null || s.clientId === contactId);
  if (project.contractAmount === null || matching.length !== 1) return null;
  const original = matching[0];
  if (
    !original.subtotal.eq(project.contractAmount) ||
    !original.total.eq(original.subtotal.add(original.taxAmount))
  )
    return null;
  if (
    adjustments.some(
      (a) =>
        !a.amount.eq(a.revision.subtotal) ||
        !a.revision.total.eq(a.revision.subtotal.add(a.revision.taxAmount)),
    )
  )
    return null;
  const subtotal = money(adjustments.reduce((n, a) => n.add(a.amount), money(0)));
  const tax = money(adjustments.reduce((n, a) => n.add(a.revision.taxAmount), money(0)));
  return {
    original: clientPrice(original.subtotal, original.taxAmount, original.total, mode),
    approvedChanges: clientPrice(subtotal, tax, subtotal.add(tax), mode),
    current: clientPrice(
      original.subtotal.add(subtotal),
      original.taxAmount.add(tax),
      original.total.add(subtotal).add(tax),
      mode,
    ),
  };
}
