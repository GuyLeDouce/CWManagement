import { CostCodeType, Prisma } from '@prisma/client';
import { Tx, json } from '../db';
import { digest } from '../crypto';
import { ensure } from '../errors';
import { money } from '../financial-math';
import { consumeCommitment, refreshCommitment } from '../commitments';
import { Actor, requireCapability, requireProjectAccess } from '../permissions';
import { object, list, text, required, XmlNode } from './xml';
import { issue, qbAudit } from './state';
import { publishProjectEvent } from '../activity';
import { financialMode, pilotConfig } from './pilot';
import { lockConnection } from './state';
import { z } from 'zod';
export function billData(node: XmlNode) {
  const lines: Array<XmlNode & { kind: string }> = [
    ...list(node.ItemLineRet).map((x) => ({ ...x, kind: 'COST_CODE' })),
    ...list(node.ExpenseLineRet).map((x) => ({ ...x, kind: 'ACCOUNT_COST_CODE' })),
  ];
  return {
    unsupported: node.ItemGroupLineRet
      ? 'Grouped Bill lines require Controller reconciliation.'
      : text(node.IsTaxIncluded) === 'true'
        ? 'Tax-inclusive Bills require Controller tax review.'
        : text(node.ExchangeRate) && text(node.ExchangeRate) !== '1'
          ? 'Foreign-currency Bills require Controller review.'
          : null,
    txnId: required(node, 'TxnID'),
    editSequence: required(node, 'EditSequence'),
    date: required(node, 'TxnDate'),
    vendor: text(object(node.VendorRef).ListID),
    reference: text(node.RefNumber),
    unsupportedLines: list(node.ItemGroupLineRet).map((x) => ({
      id: text(x.TxnLineID),
      description: text(x.Desc).slice(0, 4000),
      amount: text(x.TotalAmount),
    })),
    linked: list(node.LinkedTxn)
      .filter((x) => text(x.TxnType) === 'PurchaseOrder')
      .map((x) => text(x.TxnID)),
    lines: lines.map((x) => ({
      id: required(x, 'TxnLineID'),
      kind: x.kind,
      project: text(object(x.CustomerRef).ListID),
      item: text(object(x.ItemRef ?? x.AccountRef).ListID),
      amount: required(x, 'Amount'),
      description: text(x.Desc ?? x.Memo).slice(0, 4000),
    })),
  };
}
export type Bill = ReturnType<typeof billData>;
export const lineDecisionSchema = z
  .object({
    projectId: z.string().optional(),
    costCodeId: z.string().optional(),
    costType: z.nativeEnum(CostCodeType).optional(),
    ignore: z.boolean().optional(),
  })
  .strict();
export async function stageBill(tx: Tx, connectionId: string, node: XmlNode) {
  const bill = billData(node),
    contentHash = digest(JSON.stringify(bill));
  const old = await tx.quickBooksBillMirror.findUnique({
    where: { connectionId_txnId: { connectionId, txnId: bill.txnId } },
  });
  return tx.quickBooksBillMirror.upsert({
    where: { connectionId_txnId: { connectionId, txnId: bill.txnId } },
    create: {
      connectionId,
      txnId: bill.txnId,
      editSequence: bill.editSequence,
      contentHash,
      payload: json(bill),
    },
    update: {
      editSequence: bill.editSequence,
      contentHash,
      payload: json(bill),
      observedAt: new Date(),
      ...(old && old.contentHash !== contentHash
        ? {
            lineDecisions: Prisma.DbNull,
            ...(old.lineDecisions && !old.suppressedAt ? { status: 'REVIEW_REQUIRED' } : {}),
          }
        : {}),
    },
  });
}
// Preflight the complete transaction before reversing any previously imported costs.
export async function applyBill(
  tx: Tx,
  actor: Actor,
  id: string,
  options: { preview?: boolean; reviewedHash?: string; reason?: string } = {},
) {
  await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
  const mirror = await tx.quickBooksBillMirror.findUniqueOrThrow({ where: { id } });
  await lockConnection(tx, mirror.connectionId);
  const connection = await tx.quickBooksConnection.findUniqueOrThrow({
    where: { id: mirror.connectionId },
  });
  financialMode(connection);
  ensure(
    !mirror.suppressedAt,
    'This Bill was manually reversed/ignored and is held. Review its source in QuickBooks before restoring it.',
  );
  const applicationHash = digest(
    JSON.stringify([mirror.contentHash, mirror.lineLinks, mirror.lineDecisions]),
  );
  if (options.reviewedHash)
    ensure(
      options.reviewedHash === applicationHash,
      'Preview and approve this exact Bill version and allocation again.',
    );
  if (mirror.appliedHash === applicationHash && !options.preview) {
    if (mirror.status === 'REVIEW_REQUIRED') {
      ensure(
        options.reviewedHash === applicationHash,
        'Confirm the unchanged reviewed Bill allocation.',
      );
      const unmatched = await tx.actualCost.count({
        where: {
          externalSystem: 'QB:' + mirror.connectionId,
          quickBooksTxnId: mirror.txnId,
          reversedAt: null,
          commitmentLineId: null,
          amount: { gt: 0 },
        },
      });
      await tx.quickBooksBillMirror.update({
        where: { id },
        data: { status: unmatched ? 'UNRECONCILED' : 'APPLIED', lastError: null },
      });
    }
    return;
  }
  if ((connection.mode === 'PILOT' || mirror.status === 'REVIEW_REQUIRED') && !options.preview)
    ensure(
      options.reviewedHash === applicationHash && options.reason && options.reason.length >= 5,
      'Preview and explicitly approve this exact Bill and allocation before applying pilot costs.',
    );
  const bill = mirror.payload as unknown as Bill,
    externalSystem = 'QB:' + mirror.connectionId;
  const previous = await tx.actualCost.findMany({
    where: { externalSystem, quickBooksTxnId: bill.txnId, reversedAt: null },
  });
  for (const a of previous) await requireProjectAccess(actor, a.projectId, tx);
  const oldConsumption = new Map<string, Prisma.Decimal>();
  for (const a of previous)
    if (a.commitmentLineId)
      oldConsumption.set(
        a.commitmentLineId,
        (oldConsumption.get(a.commitmentLineId) ?? money(0)).add(a.amount),
      );
  const links = object(mirror.lineLinks),
    planned: Array<{
      id: string;
      projectId: string;
      costCodeId: string;
      costType: CostCodeType;
      amount: Prisma.Decimal;
      description: string;
      commitmentLineId?: string;
      vendorContactId?: string;
    }> = [];
  let unresolved = false;
  try {
    ensure(!bill.unsupported, bill.unsupported ?? 'Unsupported Bill.');
    ensure(
      /^\d{4}-\d{2}-\d{2}$/.test(bill.date) && !Number.isNaN(Date.parse(bill.date)),
      'Bill transaction date is invalid.',
    );
    const ids = new Set<string>();
    const consumption = new Map<string, Prisma.Decimal>();
    const vendor = await tx.accountingSyncMapping.findFirst({
      where: {
        connectionId: connection.id,
        entityType: { in: ['VENDOR_CONTACT', 'VENDOR_COMPANY'] },
        quickBooksListId: bill.vendor,
        enabled: true,
        status: 'SYNCED',
      },
    });
    const pilot = connection.mode === 'PILOT' ? pilotConfig(connection) : null;
    if (pilot) {
      const contact = await tx.contact.findUniqueOrThrow({ where: { id: pilot.vendorContactId } });
      ensure(
        vendor &&
          (vendor.entityType === 'VENDOR_CONTACT'
            ? vendor.entityId === contact.id
            : vendor.entityId === contact.companyId),
        'Bill Vendor is not the mapped pilot Vendor.',
      );
      ensure(
        previous.every(
          (a) => a.projectId === pilot.projectId && pilot.costCodeIds.includes(a.costCodeId),
        ),
        'Prior Bill costs are outside the current pilot allowlist.',
      );
    }
    for (const line of bill.lines) {
      ensure(!ids.has(line.id), 'Duplicate Bill line identifier.');
      ids.add(line.id);
      const decision = lineDecisionSchema.parse(object(object(mirror.lineDecisions)[line.id]));
      if (decision.ignore) continue;
      ensure(
        line.project || decision.projectId,
        'Bill line has no Customer:Job. Allocate it explicitly or ignore it as non-project cost.',
      );
      const pm = await tx.accountingSyncMapping.findFirst({
        where: {
          connectionId: mirror.connectionId,
          entityType: 'PROJECT',
          quickBooksListId: line.project,
          enabled: true,
          status: 'SYNCED',
        },
      });
      const projectId = decision.projectId ?? pm?.entityId;
      ensure(projectId, 'Bill Customer:Job is unmapped. Confirm its Project before importing.');
      await requireProjectAccess(actor, projectId, tx);
      const cm = await tx.accountingSyncMapping.findFirst({
        where: {
          connectionId: mirror.connectionId,
          entityType: line.kind,
          quickBooksListId: line.item,
          enabled: true,
          status: 'SYNCED',
        },
      });
      const codeId = decision.costCodeId ?? cm?.entityId;
      ensure(codeId, 'Bill Item/Account is unmapped. Confirm its Cost Code before importing.');
      const code = await tx.costCode.findUniqueOrThrow({ where: { id: codeId } });
      ensure(code.active, 'Bill Cost Code is inactive.');
      if (pilot)
        ensure(
          projectId === pilot.projectId && pilot.costCodeIds.includes(code.id),
          'Bill line is outside the pilot Project/Cost Code allowlist. No costs were applied.',
        );
      const amount = money(line.amount);
      ensure(
        amount.isFinite() && amount.gte(0),
        'Negative Bill lines require Controller review; vendor credits are not automatically imported.',
      );
      let commitmentLineId = text(links[line.id]) || undefined;
      if (!commitmentLineId && links[line.id] !== '' && bill.linked.length) {
        const po = await tx.accountingSyncMapping.findMany({
          where: {
            connectionId: mirror.connectionId,
            entityType: 'PURCHASE_ORDER',
            quickBooksTxnId: { in: bill.linked },
          },
        });
        const candidates = await tx.commitmentLine.findMany({
          where: {
            commitment: {
              purchasingDocumentId: { in: po.map((x) => x.entityId) },
              projectId,
            },
            costCodeId: code.id,
          },
        });
        if (candidates.length === 1) commitmentLineId = candidates[0].id;
        else unresolved = true;
      }
      let costType = decision.costType ?? code.type;
      ensure(code.type === costType, 'Bill Cost Type must match its Cost Code.');
      let vendorContactId: string | undefined =
        vendor?.entityType === 'VENDOR_CONTACT' ? vendor.entityId : pilot?.vendorContactId;
      if (commitmentLineId) {
        const cl = await tx.commitmentLine.findUniqueOrThrow({
          where: { id: commitmentLineId },
          include: { commitment: true },
        });
        ensure(
          cl.commitment.projectId === projectId && cl.costCodeId === code.id,
          'Bill commitment link does not match Project and Cost Code.',
        );
        ensure(cl.commitment.status !== 'CANCELLED', 'Bill links a cancelled commitment.');
        costType = cl.costType;
        vendorContactId = cl.commitment.vendorContactId ?? undefined;
        const used = (consumption.get(cl.id) ?? money(0)).add(amount);
        consumption.set(cl.id, used);
        ensure(
          cl.consumedAmount
            .sub(oldConsumption.get(cl.id) ?? 0)
            .add(used)
            .lte(cl.committedAmount),
          'Bill exceeds remaining commitment. Revise the purchasing document before importing.',
        );
        if (amount.isZero()) commitmentLineId = undefined;
      } else if (!amount.isZero()) unresolved = true;
      planned.push({
        id: line.id,
        projectId,
        costCodeId: code.id,
        costType,
        amount,
        description: line.description || 'QuickBooks Bill ' + bill.reference,
        commitmentLineId,
        vendorContactId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bill requires reconciliation.';
    if (options.preview)
      return {
        ready: false,
        blocker: message,
        reviewedHash: applicationHash,
        previous: previous.map((a) => ({
          id: a.id,
          amount: a.amount.toString(),
          commitmentLineId: a.commitmentLineId,
        })),
        planned: [],
      };
    await tx.quickBooksBillMirror.update({
      where: { id },
      data: {
        status: mirror.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'REVIEW',
        lastError: message,
      },
    });
    await issue(tx, mirror.connectionId, 'bill:' + id, 'BILL_RECONCILIATION', message);
    return;
  }
  if (options.preview)
    return {
      ready: true,
      blocker: null,
      reviewedHash: applicationHash,
      previous: previous.map((a) => ({
        id: a.id,
        amount: a.amount.toString(),
        commitmentLineId: a.commitmentLineId,
      })),
      planned: planned.map((l) => ({ ...l, amount: l.amount.toString() })),
    };
  const touched = new Set<string>();
  const generation = await tx.actualCost.count({
    where: { externalSystem, quickBooksTxnId: bill.txnId },
  });
  for (const a of previous) {
    if (a.commitmentLineId) {
      const cl = await tx.commitmentLine.findUniqueOrThrow({ where: { id: a.commitmentLineId } });
      ensure(cl.consumedAmount.gte(a.amount), 'Reversal would make consumption negative.');
      await tx.commitmentLine.update({
        where: { id: cl.id },
        data: { consumedAmount: { decrement: a.amount } },
      });
      touched.add(cl.commitmentId);
    }
    await tx.actualCost.update({
      where: { id: a.id },
      data: {
        reversedAt: new Date(),
        reversedById: actor.id,
        reversalReason: 'QuickBooks Bill revision ' + bill.editSequence,
      },
    });
  }
  for (const line of planned) {
    if (line.commitmentLineId) {
      const cl = await consumeCommitment(tx, actor, {
        ...line,
        commitmentLineId: line.commitmentLineId,
      });
      touched.add(cl.commitmentId);
    }
    const { id: lineId, ...data } = line;
    await tx.actualCost.create({
      data: {
        ...data,
        transactionDate: new Date(bill.date),
        sourceType: 'QUICKBOOKS_BILL',
        externalSystem,
        sourceExternalId: `${bill.txnId}:${lineId}:${applicationHash}:${generation}`,
        quickBooksTxnId: bill.txnId,
        quickBooksEditSequence: bill.editSequence,
        createdById: actor.id,
      },
    });
  }
  for (const commitmentId of touched) await refreshCommitment(tx, commitmentId, actor);
  await tx.quickBooksBillMirror.update({
    where: { id },
    data: {
      appliedHash: applicationHash,
      appliedAt: new Date(),
      status: unresolved ? 'UNRECONCILED' : 'APPLIED',
      lastError: null,
    },
  });
  await qbAudit(
    tx,
    actor.id,
    previous.some((a) => a.quickBooksEditSequence !== bill.editSequence)
      ? 'QUICKBOOKS_BILL_MODIFIED'
      : previous.length
        ? 'QUICKBOOKS_BILL_REALLOCATED'
        : 'QUICKBOOKS_BILL_IMPORTED',
    id,
    {
      txnId: bill.txnId,
      lines: planned.length,
      reversed: previous.length,
      previousAmount: previous.reduce((s, a) => s.add(a.amount), money(0)).toString(),
      updatedAmount: planned.reduce((s, a) => s.add(a.amount), money(0)).toString(),
      editSequence: bill.editSequence,
      reason: options.reason,
    },
  );
  for (const projectId of new Set([
    ...planned.map((x) => x.projectId),
    ...previous.map((x) => x.projectId),
  ]))
    await publishProjectEvent(tx, {
      projectId,
      actorId: actor.id,
      action: 'QUICKBOOKS_ACTUAL_COST_UPDATED',
      entity: 'ActualCost',
      entityId: id,
      description: 'Updated project actual costs from a QuickBooks Bill.',
      metadata: { txnId: bill.txnId },
    });
  if (unresolved)
    await issue(
      tx,
      mirror.connectionId,
      'bill-link:' + id,
      'COMMITMENT_MATCH',
      'Imported Bill has actual costs requiring commitment review. Use the existing Actual Cost reconciliation workspace.',
    );
  else
    await tx.quickBooksSyncIssue.updateMany({
      where: { key: { in: ['bill:' + id, 'bill-link:' + id] }, resolvedAt: null },
      data: { resolvedAt: new Date(), resolution: 'Bill reconciled successfully.' },
    });
}

// Manual deletion/void fallback: preserve every row and hold the source against automatic re-import.
export async function holdBill(tx: Tx, actor: Actor, id: string, reason: string) {
  await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
  const b = await tx.quickBooksBillMirror.findUniqueOrThrow({ where: { id } });
  await lockConnection(tx, b.connectionId);
  const c = await tx.quickBooksConnection.findUniqueOrThrow({ where: { id: b.connectionId } });
  financialMode(c);
  const previous = await tx.actualCost.findMany({
    where: { externalSystem: 'QB:' + b.connectionId, quickBooksTxnId: b.txnId, reversedAt: null },
  });
  const pilot = c.mode === 'PILOT' ? pilotConfig(c) : null;
  for (const a of previous) {
    await requireProjectAccess(actor, a.projectId, tx);
    if (pilot)
      ensure(
        a.projectId === pilot.projectId && pilot.costCodeIds.includes(a.costCodeId),
        'Bill is outside the pilot scope.',
      );
    if (a.commitmentLineId) {
      const cl = await tx.commitmentLine.findUniqueOrThrow({ where: { id: a.commitmentLineId } });
      ensure(cl.consumedAmount.gte(a.amount), 'Reversal would make consumption negative.');
      await tx.commitmentLine.update({
        where: { id: cl.id },
        data: { consumedAmount: { decrement: a.amount } },
      });
      await refreshCommitment(tx, cl.commitmentId, actor);
    }
    await tx.actualCost.update({
      where: { id: a.id },
      data: { reversedAt: new Date(), reversedById: actor.id, reversalReason: reason },
    });
    await publishProjectEvent(tx, {
      projectId: a.projectId,
      actorId: actor.id,
      action: 'QUICKBOOKS_ACTUAL_REVERSED',
      entity: 'ActualCost',
      entityId: a.id,
      description: 'Reversed an imported actual cost after accounting review.',
      reason,
    });
  }
  await tx.quickBooksBillMirror.update({
    where: { id },
    data: {
      suppressedAt: new Date(),
      status: 'HELD',
      lastError: 'Operator hold: ' + reason,
      appliedHash: null,
    },
  });
  await qbAudit(tx, actor.id, 'QUICKBOOKS_BILL_HELD', id, {
    reason,
    reversed: previous.map((a) => a.id),
    previousAmount: previous.reduce((s, a) => s.add(a.amount), money(0)).toString(),
  });
  await issue(
    tx,
    b.connectionId,
    'bill-hold:' + id,
    'BILL_HELD',
    'An imported Bill was reversed or ignored by an operator. Verify the source in QuickBooks before restoring imports.',
  );
}
