import { z } from 'zod';
import { Actor, requireCapability } from './permissions';
import { transaction } from './db';
import { warrantyAccess } from './warranty';
import { isExternal, isTrade } from './external-identity';
import { ensure } from './errors';
import { validateTradeUpload } from './trade-uploads';
import { storage, storageDriver } from './storage';
import { publishProjectEvent } from './activity';
export const warrantyUploadSchema = z
  .object({
    requestId: z.string(),
    visibility: z.enum(['INTERNAL', 'CLIENT', 'TRADE']).default('INTERNAL'),
    caption: z.string().max(1000).default(''),
  })
  .strict();
export async function uploadWarrantyFile(
  actor: Actor,
  raw: unknown,
  file: { name: string; type: string; bytes: Uint8Array },
) {
  const i = warrantyUploadSchema.parse(raw);
  const initial = await transaction((tx) => warrantyAccess(tx, actor, i.requestId));
  const type = validateTradeUpload(file.name, file.type, file.bytes);
  const provider = storageDriver(),
    key = `${initial.projectId}/${crypto.randomUUID()}`;
  await storage(provider).put({ key, bytes: file.bytes, contentType: type });
  try {
    return await transaction(async (tx) => {
      const r = await warrantyAccess(tx, actor, i.requestId);
      if (!isExternal(actor)) await requireCapability(actor, 'WARRANTY_MANAGE', tx);
      const visibility = actor.roles.includes('CLIENT')
        ? 'CLIENT'
        : isTrade(actor)
          ? 'TRADE'
          : i.visibility;
      ensure(
        visibility !== 'CLIENT' || r.clientContactId,
        'Choose a reporting client before sharing a file.',
      );
      ensure(visibility !== 'TRADE' || r.assignedTradeId, 'Assign a trade before sharing a file.');
      const row = await tx.storedFile.create({
        data: {
          projectId: r.projectId,
          warrantyRequestId: r.id,
          uploaderId: actor.id,
          visibility,
          kind: type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT',
          filename: file.name,
          originalFilename: file.name,
          mimeType: type,
          size: BigInt(file.bytes.length),
          storageKey: key,
          storageProvider: provider,
          caption: i.caption,
          tradeUploaderContactId: isTrade(actor) ? r.assignedTradeId : null,
          origin: isTrade(actor)
            ? 'TRADE_UPLOAD'
            : actor.roles.includes('CLIENT')
              ? 'CLIENT_UPLOAD'
              : 'STAFF',
        },
      });
      if (visibility === 'TRADE')
        await tx.tradeFileShare.create({
          data: { fileId: row.id, contactId: r.assignedTradeId!, lockedAt: new Date() },
        });
      await publishProjectEvent(tx, {
        projectId: r.projectId,
        actorId: actor.id,
        entity: 'WarrantyRequest',
        entityId: r.id,
        action: 'WARRANTY_FILE_ADDED',
        description: `Evidence added to ${r.number}.`,
      });
      return { id: row.id };
    });
  } catch (error) {
    await storage(provider)
      .remove(key)
      .catch(() => undefined);
    throw error;
  }
}
