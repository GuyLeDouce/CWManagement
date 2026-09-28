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
type Bill = ReturnType<typeof billData>;
export async function stageBill(tx: Tx, connectionId: string, node: XmlNode) {
  const bill = billData(node),
    contentHash = digest(JSON.stringify(bill));
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
    },
  });
}
// Preflight the complete transaction before reversing any previously imported costs.
export async function applyBill(tx: Tx, actor: Actor, id: string) {
  await requireCapability(actor, 'ACTUAL_COST_RECONCILE', tx);
  const mirror = await tx.quickBooksBillMirror.findUniqueOrThrow({ where: { id } });
  const connection=await tx.quickBooksConnection.findUniqueOrThrow({where:{id:mirror.connectionId}});
  ensure(connection.boundCompanyHash&&!connection.companyMismatch,'Verify the company before applying imported costs.');
  if (mirror.appliedHash === mirror.contentHash) return;
  const bill = mirror.payload as unknown as Bill,
    externalSystem = 'QB:' + mirror.connectionId;
  const previous = await tx.actualCost.findMany({
    where: { externalSystem, quickBooksTxnId: bill.txnId, reversedAt: null },
  });
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
    for (const line of bill.lines) {
      ensure(!ids.has(line.id), 'Duplicate Bill line identifier.');
      ids.add(line.id);
      if (!line.project) continue;
      const pm = await tx.accountingSyncMapping.findFirst({
        where: {
          connectionId: mirror.connectionId,
          entityType: 'PROJECT',
          quickBooksListId: line.project,
          enabled: true,
          status: 'SYNCED',
        },
      });
      ensure(pm, 'Bill Customer:Job is unmapped. Confirm its Project before importing.');
      await requireProjectAccess(actor, pm.entityId, tx);
      const cm = await tx.accountingSyncMapping.findFirst({
        where: {
          connectionId: mirror.connectionId,
          entityType: line.kind,
          quickBooksListId: line.item,
          enabled: true,
          status: 'SYNCED',
        },
      });
      ensure(cm, 'Bill Item/Account is unmapped. Confirm its Cost Code before importing.');
      const code = await tx.costCode.findUniqueOrThrow({ where: { id: cm.entityId } });
      const amount = money(line.amount);
      ensure(
        amount.isFinite() && amount.gte(0),
        'Negative Bill lines require Controller review; vendor credits are not automatically imported.',
      );
      let commitmentLineId = text(links[line.id]) || undefined;
      if (!commitmentLineId && bill.linked.length) {
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
              projectId: pm.entityId,
            },
            costCodeId: code.id,
          },
        });
        if (candidates.length === 1) commitmentLineId = candidates[0].id;
        else unresolved = true;
      }
      let costType = code.type;
      let vendorContactId: string | undefined;
      if (commitmentLineId) {
        const cl = await tx.commitmentLine.findUniqueOrThrow({
          where: { id: commitmentLineId },
          include: { commitment: true },
        });
        ensure(
          cl.commitment.projectId === pm.entityId && cl.costCodeId === code.id,
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
        projectId: pm.entityId,
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
    await tx.quickBooksBillMirror.update({
      where: { id },
      data: { status: 'REVIEW', lastError: message },
    });
    await issue(tx, mirror.connectionId, 'bill:' + id, 'BILL_RECONCILIATION', message);
    return;
  }
  const touched = new Set<string>();
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
        sourceExternalId: `${bill.txnId}:${lineId}:${mirror.contentHash}`,
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
      appliedHash: mirror.contentHash,
      appliedAt: new Date(),
      status: unresolved ? 'UNRECONCILED' : 'APPLIED',
      lastError: null,
    },
  });
  await qbAudit(tx, actor.id, 'QUICKBOOKS_BILL_IMPORTED', id, {
    txnId: bill.txnId,
    lines: planned.length,
    reversed: previous.length,
  });
  for(const projectId of new Set([...planned.map(x=>x.projectId),...previous.map(x=>x.projectId)]))await publishProjectEvent(tx,{projectId,actorId:actor.id,action:'QUICKBOOKS_ACTUAL_COST_UPDATED',entity:'ActualCost',entityId:id,description:'Updated project actual costs from a QuickBooks Bill.',metadata:{txnId:bill.txnId}});
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
