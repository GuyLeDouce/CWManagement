import { Tx } from '../db';
import { ensure } from '../errors';
import { object, list, text, required, XmlNode } from './xml';
import { recordTransactionMapping } from './mapping';
import { Prisma } from '@prisma/client';
import { qbAudit } from './state';
export async function adoptVerifiedWrite(
  tx: Tx,
  connectionId: string,
  requestId: string,
  ret: XmlNode,
) {
  const original = await tx.quickBooksRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { job: true },
  });
  ensure(
    original.job.connectionId === connectionId && !original.completedAt && original.isWrite,
    'Original uncertain request is unavailable.',
  );
  const data = object(original.data);
  if (original.operation === 'TimeTrackingAddRq') {
    const source = object(data.TimeTrackingAdd);
    for (const key of ['EntityRef', 'CustomerRef', 'ItemServiceRef'])
      ensure(
        text(object(source[key]).ListID) === text(object(ret[key]).ListID),
        'QuickBooks time references do not match the original request.',
      );
    for (const key of ['TxnDate', 'Duration', 'Notes', 'BillableStatus'])
      ensure(
        text(source[key]) === text(ret[key]),
        'QuickBooks time does not match the exact original request.',
      );
    const version = Number(object(original.job.payload).sourceVersion);
    const current = await tx.timeSegment.findUniqueOrThrow({
      where: { id: original.job.entityId! },
    });
    ensure(
      current.version === version,
      'Time changed after the uncertain write. Correct it in QuickBooks and reconcile the source version first.',
    );
    await recordTransactionMapping(
      tx,
      connectionId,
      'TIME',
      current.id,
      required(ret, 'TxnID'),
      required(ret, 'EditSequence'),
      {},
      version,
    );
  } else {
    ensure(
      ['PurchaseOrderAddRq', 'PurchaseOrderModRq'].includes(original.operation),
      'Only purchasing/time transaction adoption is supported.',
    );
    const source = object(data.PurchaseOrderAdd ?? data.PurchaseOrderMod);
    ensure(
      text(object(source.VendorRef).ListID) === text(object(ret.VendorRef).ListID) &&
        text(source.Memo) === text(ret.Memo) &&
        text(source.TxnDate) === text(ret.TxnDate) &&
        text(source.RefNumber) === text(ret.RefNumber),
      'QuickBooks Purchase Order identity does not match the original request.',
    );
    const expected = list(source.PurchaseOrderLineAdd ?? source.PurchaseOrderLineMod),
      actual = list(ret.PurchaseOrderLineRet);
    ensure(expected.length === actual.length, 'QuickBooks PO line count differs from the request.');
    for (let i = 0; i < expected.length; i++) {
      ensure(
        text(expected[i].Desc) === text(actual[i].Desc),
        'QuickBooks PO scope differs from the original request.',
      );
      for (const key of ['ItemRef', 'CustomerRef'])
        ensure(
          text(object(expected[i][key]).ListID) === text(object(actual[i][key]).ListID),
          'QuickBooks PO line references differ.',
        );
      ensure(
        new Prisma.Decimal(text(expected[i].Quantity)).eq(
          new Prisma.Decimal(text(actual[i].Quantity)),
        ) &&
          new Prisma.Decimal(text(expected[i].Rate)).eq(new Prisma.Decimal(text(actual[i].Rate))),
        'QuickBooks PO pricing differs.',
      );
    }
    const revision = await tx.purchasingRevision.findUniqueOrThrow({
      where: { id: original.job.entityId! },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    await recordTransactionMapping(
      tx,
      connectionId,
      'PURCHASE_ORDER',
      revision.documentId,
      required(ret, 'TxnID'),
      required(ret, 'EditSequence'),
      {
        revisionId: revision.id,
        lines: actual.map((l, i) => ({
          lineKey: revision.lines[i].lineKey,
          txnLineId: required(l, 'TxnLineID'),
        })),
      },
    );
  }
  await tx.quickBooksSyncJob.update({
    where: { id: original.jobId },
    data: { status: 'SUCCEEDED', completedAt: new Date(), lastError: null, phase: 'ADOPTED' },
  });
  await tx.quickBooksRequest.update({
    where: { id: original.id },
    data: { completedAt: new Date(), responseHash: 'verified-by-read', percent: 100 },
  });
  await tx.quickBooksSyncIssue.updateMany({
    where: { jobId: original.jobId, resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolution:
        'Verified exact original request against an explicit QuickBooks transaction query.',
    },
  });
  await qbAudit(tx, null, 'QUICKBOOKS_UNCERTAIN_WRITE_ADOPTED', original.jobId, {
    txnId: text(ret.TxnID),
  });
}
