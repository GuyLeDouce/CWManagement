import { QuickBooksSyncJob, QuickBooksConnection } from '@prisma/client';
import { DateTime } from 'luxon';
import { Tx } from '../db';
import { ensure } from '../errors';
import { mapping, localEntity } from './mapping';
import { object, text, XmlNode } from './xml';
import { permitOutbound } from './pilot';
export async function buildRequest(
  tx: Tx,
  c: QuickBooksConnection,
  job: QuickBooksSyncJob,
  preview = false,
): Promise<{ operation: string; data: XmlNode; isWrite: boolean }> {
  const payload = object(job.payload);
  const read = (operation: string, data: XmlNode = {}) => ({ operation, data, isWrite: false });
  if (job.operation === 'Company') return read('CompanyQueryRq');
  if (job.operation === 'VERIFY_WRITE') {
    const original = await tx.quickBooksRequest.findUniqueOrThrow({
      where: { id: text(payload.requestId) },
    });
    ensure(original.jobId === text(payload.sourceJobId), 'Invalid reconciliation source.');
    return read(
      original.operation.startsWith('TimeTracking')
        ? 'TimeTrackingQueryRq'
        : 'PurchaseOrderQueryRq',
      {
        TxnID: payload.txnId,
        ...(!original.operation.startsWith('TimeTracking') ? { IncludeLineItems: true } : {}),
      },
    );
  }
  if (['Customer', 'Vendor', 'Employee', 'Item', 'Account'].includes(job.operation))
    return read(job.operation + 'QueryRq', { ActiveStatus: 'All' });
  if (job.operation === 'BILLS') {
    ensure(c.importStartDate, 'Choose an import start date.');
    return read('BillQueryRq', {
      '@_iterator': payload.iteratorId ? 'Continue' : 'Start',
      ...(payload.iteratorId ? { '@_iteratorID': payload.iteratorId } : {}),
      MaxReturned: 200,
      ...(!payload.iteratorId
        ? {
            ...(payload.from
              ? { ModifiedDateRangeFilter: { FromModifiedDate: payload.from } }
              : {
                  TxnDateRangeFilter: { FromTxnDate: c.importStartDate.toISOString().slice(0, 10) },
                }),
          }
        : {}),
      IncludeLineItems: true,
      IncludeLinkedTxns: true,
    });
  }
  await permitOutbound(tx, c, job.operation, job.entityId);
  if (job.operation === 'PURCHASE_ORDER') {
    const r = await tx.purchasingRevision.findUnique({
      where: { id: job.entityId ?? '' },
      include: { document: true, lines: { orderBy: { sortOrder: 'asc' } }, vendorContact: true },
    });
    ensure(
      r &&
        r.document.type === 'PURCHASE_ORDER' &&
        !r.document.cancelledAt &&
        ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'].includes(r.status),
      'Only current issued Purchase Orders are eligible; Work Orders remain CWManagement commitments.',
    );
    ensure(
      r.taxAmount.isZero() && !r.lines.some((l) => l.taxable),
      'This Purchase Order includes tax behavior that has not yet been live validated with QuickBooks Desktop. It was not sent.',
    );
    const project = await mapping(tx, c.id, 'PROJECT', r.document.projectId);
    const direct = await tx.accountingSyncMapping.findUnique({
      where: {
        connectionId_entityType_entityId: {
          connectionId: c.id,
          entityType: 'VENDOR_CONTACT',
          entityId: r.vendorContactId,
        },
      },
    });
    if (!direct) {
      const company = await tx.company.findUnique({
        where: { id: r.vendorContact.companyId ?? '' },
      });
      ensure(
        company &&
          text(object(object(r.snapshot).vendor).name) === (company.legalName || company.name),
        'Vendor Company differs from the issued snapshot. Review and map the issued Contact explicitly before export.',
      );
    }
    const vendor = await mapping(
      tx,
      c.id,
      direct ? 'VENDOR_CONTACT' : 'VENDOR_COMPANY',
      direct ? r.vendorContactId : (r.vendorContact.companyId ?? ''),
    );
    const existing = await tx.accountingSyncMapping.findUnique({
      where: {
        connectionId_entityType_entityId: {
          connectionId: c.id,
          entityType: 'PURCHASE_ORDER',
          entityId: r.documentId,
        },
      },
    });
    // Never overwrite a QuickBooks transaction whose current EditSequence has not been checked.
    ensure(
      !existing?.quickBooksTxnId || object(existing.metadata).revisionId !== r.id,
      'This PO revision is already synchronized. Locate its TxnID in QuickBooks; do not export it again.',
    );
    if (existing?.quickBooksTxnId && job.phase !== 'MOD_READY') {
      ensure(existing.status === 'SYNCED', 'Purchase Order requires reconciliation.');
      return read('PurchaseOrderQueryRq', {
        TxnID: existing.quickBooksTxnId,
        IncludeLineItems: true,
      });
    }
    const lines = [];
    for (const line of r.lines) {
      const item = await mapping(tx, c.id, 'COST_CODE', line.costCodeId);
      lines.push({
        ItemRef: { ListID: item.quickBooksListId },
        Desc: line.description.slice(0, 4095),
        Quantity: line.quantity.toString(),
        Rate: line.unitCost.toString(),
        CustomerRef: { ListID: project.quickBooksListId },
      });
    }
    ensure(lines.length > 0, 'Purchase Order has no lines.');
    if (existing?.quickBooksTxnId) {
      const saved = object(existing.metadata);
      const previous = Array.isArray(saved.lines) ? saved.lines.map(object) : [];
      ensure(text(payload.reviewedEditSequence), 'Review the latest QuickBooks transaction first.');
      return {
        operation: 'PurchaseOrderModRq',
        isWrite: true,
        data: {
          PurchaseOrderMod: {
            TxnID: existing.quickBooksTxnId,
            EditSequence: payload.reviewedEditSequence,
            VendorRef: { ListID: vendor.quickBooksListId },
            TxnDate: r.issuedAt!.toISOString().slice(0, 10),
            RefNumber: r.document.number.slice(0, 11),
            Memo: `CWManagement ${r.document.number} Rev ${r.revision}`,
            PurchaseOrderLineMod: lines.map((line, i) => ({
              TxnLineID:
                text(previous.find((x) => x.lineKey === r.lines[i].lineKey)?.txnLineId) || '-1',
              ...line,
            })),
          },
        },
      };
    }
    return {
      operation: 'PurchaseOrderAddRq',
      isWrite: true,
      data: {
        PurchaseOrderAdd: {
          VendorRef: { ListID: vendor.quickBooksListId },
          TxnDate: r.issuedAt!.toISOString().slice(0, 10),
          RefNumber: r.document.number.slice(0, 11),
          Memo: `CWManagement ${r.document.number} Rev ${r.revision}`,
          PurchaseOrderLineAdd: lines,
        },
      },
    };
  }
  if (job.operation === 'TIME') {
    const s = await tx.timeSegment.findUnique({
      where: { id: job.entityId ?? '' },
      include: { approvals: true, task: true, workDay: true },
    });
    ensure(
      s?.end &&
        ['PM_APPROVED', 'EXPORTED'].includes(s.status) &&
        s.approvals.some((a) => a.segmentVersion === s.version),
      'Only closed time with current approval can be exported.',
    );
    const existing = await tx.accountingSyncMapping.findUnique({
      where: {
        connectionId_entityType_entityId: {
          connectionId: c.id,
          entityType: 'TIME',
          entityId: s.id,
        },
      },
    });
    ensure(
      !existing?.quickBooksTxnId,
      'Time already synchronized; corrections require Controller reconciliation.',
    );
    const employee = await mapping(tx, c.id, 'EMPLOYEE', s.userId),
      project = await mapping(tx, c.id, 'PROJECT', s.jobsiteId),
      item = await mapping(tx, c.id, 'COST_CODE', s.costCodeId ?? s.task?.defaultCostCodeId ?? '');
    ensure(item.quickBooksType === 'ItemServiceRet', 'Time requires a QuickBooks Service Item.');
    const minutes = Math.round((s.end.getTime() - s.effectiveStart.getTime()) / 60000);
    ensure(
      minutes > 0 && minutes <= 1440,
      'Time duration must be between one minute and 24 hours.',
    );
    if (!preview)
      await tx.quickBooksSyncJob.update({
        where: { id: job.id },
        data: { payload: { sourceVersion: s.version } },
      });
    return {
      operation: 'TimeTrackingAddRq',
      isWrite: true,
      data: {
        TimeTrackingAdd: {
          TxnDate: DateTime.fromJSDate(s.effectiveStart).setZone(s.workDay.timezone).toISODate(),
          EntityRef: { ListID: employee.quickBooksListId },
          CustomerRef: { ListID: project.quickBooksListId },
          ItemServiceRef: { ListID: item.quickBooksListId },
          Duration: `PT${Math.floor(minutes / 60)}H${minutes % 60}M`,
          Notes: `CWManagement time ${s.id}`,
          BillableStatus: 'NotBillable',
        },
      },
    };
  }
  if (job.operation === 'CREATE_PROJECT' || job.operation === 'CREATE_VENDOR') {
    const type = job.operation === 'CREATE_PROJECT' ? 'PROJECT' : 'VENDOR_CONTACT';
    await localEntity(tx, type, job.entityId!);
    const name = text(payload.name);
    ensure(name.length > 0 && name.length <= 41, 'Explicit QuickBooks name required.');
    const existing = await tx.accountingSyncMapping.findUnique({
      where: {
        connectionId_entityType_entityId: {
          connectionId: c.id,
          entityType: type,
          entityId: job.entityId!,
        },
      },
    });
    ensure(!existing?.quickBooksListId, 'This source is already mapped.');
    const kind = type === 'PROJECT' ? 'Customer' : 'Vendor';
    return {
      operation: kind + 'AddRq',
      isWrite: true,
      data: {
        [kind + 'Add']: {
          Name: name,
          ...(type === 'PROJECT' && payload.parentListId
            ? { ParentRef: { ListID: payload.parentListId } }
            : {}),
        },
      },
    };
  }
  ensure(false, 'Unsupported queue operation.');
}
