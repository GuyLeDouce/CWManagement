import { z } from 'zod';
import { Actor } from './permissions';
import { transaction } from './db';
import { identifier, optionalId } from './financial-documents';
import { requireTradeProjectAccess } from './trade-access';
import { tradeContext } from './trade-messages';
import { tradeEvent } from './trade-workflows';
import { ensure } from './errors';
import { maximumUploadBytes, storage } from './storage';
export const tradeUploadSchema = z
  .object({
    projectId: identifier,
    purchasingRevisionId: optionalId,
    siteInstructionId: optionalId,
    deficiencyId: optionalId,
    caption: z.string().trim().max(1000).default(''),
  })
  .strict();
export function validateTradeUpload(name: string, type: string, bytes: Uint8Array) {
  ensure(
    name.length > 0 &&
      name.length <= 200 &&
      !/[\\/\x00-\x1f\x7f]/.test(name) &&
      !name.startsWith('.'),
    'Use a plain filename without paths.',
  );
  ensure(
    bytes.length > 0 && bytes.length <= maximumUploadBytes(),
    'File exceeds the upload limit.',
    413,
  );
  const hex = Buffer.from(bytes.subarray(0, 12)).toString('hex');
  const text = Buffer.from(bytes.subarray(0, 12)).toString('ascii');
  const detected = hex.startsWith('89504e470d0a1a0a')
    ? 'image/png'
    : hex.startsWith('ffd8ff')
      ? 'image/jpeg'
      : text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP'
        ? 'image/webp'
        : text.startsWith('%PDF-')
          ? 'application/pdf'
          : null;
  ensure(
    detected && detected === type,
    'Only verified JPEG, PNG, WebP images and PDF documents are accepted.',
  );
  ensure(
    (detected === 'application/pdf'
      ? /\.pdf$/i
      : detected === 'image/png'
        ? /\.png$/i
        : detected === 'image/webp'
          ? /\.webp$/i
          : /\.jpe?g$/i
    ).test(name),
    'Filename extension must match the file content.',
  );
  return detected;
}
export async function uploadTradeFile(
  actor: Actor,
  input: z.infer<typeof tradeUploadSchema>,
  file: { name: string; type: string; bytes: Uint8Array },
) {
  await transaction(async (tx) => {
    const g = await requireTradeProjectAccess(actor, input.projectId, tx);
    await tradeContext(tx, input.projectId, g.contactId, input);
  });
  const mimeType = validateTradeUpload(file.name, file.type, file.bytes);
  const key = `${input.projectId}/${crypto.randomUUID()}`;
  await storage().put({ key, bytes: file.bytes, contentType: mimeType });
  try {
    return await transaction(async (tx) => {
      const g = await requireTradeProjectAccess(actor, input.projectId, tx);
      await tradeContext(tx, input.projectId, g.contactId, input);
      const record = await tx.storedFile.create({
        data: {
          projectId: input.projectId,
          uploaderId: actor.id,
          origin: 'TRADE_UPLOAD',
          tradeUploaderContactId: g.contactId,
          tradePurchasingRevisionId: input.purchasingRevisionId,
          siteInstructionId: input.siteInstructionId,
          deficiencyId: input.deficiencyId,
          visibility: 'TRADE',
          kind: mimeType.startsWith('image/') ? 'PHOTO' : 'DOCUMENT',
          category: 'OTHER',
          filename: file.name,
          originalFilename: file.name,
          mimeType,
          size: BigInt(file.bytes.length),
          storageKey: key,
          caption: input.caption,
        },
      });
      await tx.tradeFileShare.create({
        data: {
          fileId: record.id,
          contactId: g.contactId,
          lockedAt:
            input.deficiencyId || input.siteInstructionId || input.purchasingRevisionId
              ? new Date()
              : null,
        },
      });
      await tradeEvent(
        tx,
        actor,
        input.projectId,
        'StoredFile',
        record.id,
        'TRADE_FILE_UPLOADED',
        'Trade uploaded a project file.',
      );
      return { id: record.id };
    });
  } catch (error) {
    await storage()
      .remove(key)
      .catch(() => undefined);
    throw error;
  }
}
