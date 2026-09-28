import { z } from 'zod';
import { Actor, requireCapability } from '../permissions';
import { transaction, Tx, json } from '../db';
import { ensure } from '../errors';
import { isExternal } from '../external-identity';
import { qbAudit, lockConnection } from './state';
export const mappingTypes = [
  'PROJECT',
  'VENDOR_CONTACT',
  'VENDOR_COMPANY',
  'EMPLOYEE',
  'COST_CODE',
  'ACCOUNT_COST_CODE',
] as const;
export type MappingType = (typeof mappingTypes)[number];
export const candidateType = (type: string) =>
  (
    ({
      PROJECT: 'Customer',
      VENDOR_CONTACT: 'Vendor',
      VENDOR_COMPANY: 'Vendor',
      EMPLOYEE: 'Employee',
      COST_CODE: 'Item',
      ACCOUNT_COST_CODE: 'Account',
    }) as Record<string, string>
  )[type];
export async function localEntity(tx: Tx, type: MappingType, id: string) {
  if (type === 'PROJECT') {
    const p = await tx.project.findFirst({ where: { id, active: true, archivedAt: null } });
    ensure(p, 'Active project required.');
    return { name: p.name, projectId: p.id };
  }
  if (type === 'VENDOR_CONTACT') {
    const p = await tx.contact.findFirst({
      where: { id, active: true, types: { hasSome: ['VENDOR', 'SUBTRADE'] } },
    });
    ensure(p, 'Active vendor/subtrade Contact required.');
    return { name: p.firstName + ' ' + p.lastName, projectId: null };
  }
  if (type === 'VENDOR_COMPANY') {
    const p = await tx.company.findFirst({ where: { id, active: true } });
    ensure(p, 'Active Company required.');
    return { name: p.name, projectId: null };
  }
  if (type === 'EMPLOYEE') {
    const p = await tx.user.findUnique({ where: { id } });
    ensure(p?.active && !isExternal(p), 'Active internal employee user required.');
    return { name: p.firstName + ' ' + p.lastName, projectId: null };
  }
  const p = await tx.costCode.findFirst({ where: { id, active: true } });
  ensure(p, 'Active Cost Code required.');
  return { name: p.code + ' ' + p.name, projectId: null };
}
export async function mapping(tx: Tx, connectionId: string, type: string, entityId: string) {
  const m = await tx.accountingSyncMapping.findUnique({
    where: { connectionId_entityType_entityId: { connectionId, entityType: type, entityId } },
  });
  ensure(
    m?.enabled && m.status === 'SYNCED' && m.quickBooksListId,
    `${type.replaceAll('_', ' ')} mapping missing or disabled for ${entityId}. Refresh lists and confirm the mapping.`,
  );
  const c = await tx.quickBooksCandidate.findUnique({
    where: {
      connectionId_type_listId: {
        connectionId,
        type: candidateType(type),
        listId: m.quickBooksListId,
      },
    },
  });
  ensure(
    c?.active,
    `${type} is inactive or missing in QuickBooks. Refresh and review its mapping.`,
  );
  ensure(
    Date.now() - c.lastSeenAt.getTime() < 7 * 86400000,
    `${type} discovery is stale. Refresh QuickBooks lists before sending transactions.`,
  );
  return m;
}
export const mappingSchema = z
  .object({
    connectionId: z.string().min(1),
    type: z.enum(mappingTypes),
    entityId: z.string().min(1),
    candidateId: z.string().min(1).optional(),
    enabled: z.boolean().default(true),
    unlink: z.boolean().default(false),
  })
  .strict();
export async function saveMapping(actor: Actor, i: z.infer<typeof mappingSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'QUICKBOOKS_MAP', tx);
    await lockConnection(tx, i.connectionId);
    const local = await localEntity(tx, i.type, i.entityId);
    const c = await tx.quickBooksConnection.findUniqueOrThrow({ where: { id: i.connectionId } });
    ensure(c.boundCompanyHash && !c.companyMismatch, 'Verify the company file before mapping.');
    const existing = await tx.accountingSyncMapping.findUnique({
      where: {
        connectionId_entityType_entityId: {
          connectionId: i.connectionId,
          entityType: i.type,
          entityId: i.entityId,
        },
      },
    });
    // Remapping a source that already participates in transactions requires a new reviewed integration setup.
    const used =
      (await tx.quickBooksSyncJob.findFirst({
        where: {
          connectionId: i.connectionId,
          direction: 'EXPORT',
          status: { in: ['IN_PROGRESS', 'SUCCEEDED', 'RECONCILIATION_REQUIRED'] },
        },
      })) ||
      (await tx.quickBooksBillMirror.findFirst({
        where: { connectionId: i.connectionId, appliedAt: { not: null } },
      }));
    if (i.unlink) {
      ensure(
        !used,
        'Mappings used by accounting transactions cannot be unlinked. Disable and reconcile them.',
      );
      if (existing) await tx.accountingSyncMapping.delete({ where: { id: existing.id } });
      await qbAudit(tx, actor.id, 'QUICKBOOKS_MAPPING_UNLINKED', i.entityId, { type: i.type });
      return { ok: true };
    }
    if (!i.enabled && existing) {
      await tx.accountingSyncMapping.update({
        where: { id: existing.id },
        data: { enabled: false },
      });
      await qbAudit(tx, actor.id, 'QUICKBOOKS_MAPPING_DISABLED', existing.id);
      return { ok: true };
    }
    const candidate = await tx.quickBooksCandidate.findFirst({
      where: {
        id: i.candidateId ?? '',
        connectionId: i.connectionId,
        type: candidateType(i.type),
        active: true,
      },
    });
    ensure(candidate, 'Choose an active discovered QuickBooks record.');
    ensure(
      !used || !existing || existing.quickBooksListId === candidate.listId,
      'Changing a used mapping requires reconciliation; it cannot silently redirect accounting history.',
    );
    const data = {
      quickBooksListId: candidate.listId,
      quickBooksFullName: candidate.fullName,
      quickBooksEditSequence: candidate.editSequence,
      quickBooksType: candidate.subtype,
      lastSeenInQuickBooksAt: candidate.lastSeenAt,
      status: 'SYNCED' as const,
      enabled: true,
      lastError: null,
      direction: i.type === 'ACCOUNT_COST_CODE' ? ('IMPORT' as const) : ('BIDIRECTIONAL' as const),
      projectId: local.projectId,
    };
    const saved = await tx.accountingSyncMapping.upsert({
      where: {
        connectionId_entityType_entityId: {
          connectionId: i.connectionId,
          entityType: i.type,
          entityId: i.entityId,
        },
      },
      create: { connectionId: i.connectionId, entityType: i.type, entityId: i.entityId, ...data },
      update: data,
    });
    await qbAudit(tx, actor.id, 'QUICKBOOKS_MAPPING_LINKED', saved.id, {
      type: i.type,
      entityId: i.entityId,
      listId: candidate.listId,
    });
    return { ok: true };
  });
}
export async function recordTransactionMapping(
  tx: Tx,
  connectionId: string,
  type: string,
  entityId: string,
  txnId: string,
  editSequence: string,
  metadata: unknown,
  sourceVersion?: number,
) {
  return tx.accountingSyncMapping.upsert({
    where: { connectionId_entityType_entityId: { connectionId, entityType: type, entityId } },
    create: {
      connectionId,
      entityType: type,
      entityId,
      quickBooksTxnId: txnId,
      quickBooksEditSequence: editSequence,
      status: 'SYNCED',
      direction: 'EXPORT',
      metadata: json(metadata),
      sourceVersion,
      lastSyncedAt: new Date(),
    },
    update: {
      quickBooksTxnId: txnId,
      quickBooksEditSequence: editSequence,
      status: 'SYNCED',
      metadata: json(metadata),
      sourceVersion,
      lastSyncedAt: new Date(),
      lastError: null,
    },
  });
}
