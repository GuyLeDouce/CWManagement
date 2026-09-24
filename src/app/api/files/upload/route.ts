import { FileCategory, FileKind, FileVisibility } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { publishProjectEvent } from '@/lib/activity';
import { requireUser } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { AppError, ensure } from '@/lib/errors';
import { appUrl } from '@/lib/email';
import { requireCapability, requireProjectAccess } from '@/lib/permissions';
import { maximumUploadBytes, storage } from '@/lib/storage';
import { clientNotice, deliverClientNotices } from '@/lib/client-notices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fields = z.object({
  projectId: z.string().min(1),
  kind: z.enum(FileKind),
  category: z.enum(FileCategory),
  visibility: z.enum(FileVisibility),
  description: z.string().trim().max(2000).optional(),
  caption: z.string().trim().max(1000).optional(),
  dailyLogId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  let storedKey: string | null = null;
  const noticeIds: string[] = [];
  try {
    ensure(request.headers.get('origin') === appUrl(), 'Request origin is not allowed.', 403);
    const actor = await requireUser();
    await requireCapability(actor, 'FILE_UPLOAD');
    const max = maximumUploadBytes();
    ensure(
      Number(request.headers.get('content-length') || 0) <= max + 65536,
      'Upload is too large.',
      413,
    );
    const form = await request.formData();
    const input = fields.parse(
      Object.fromEntries(
        [...form.entries()]
          .filter(([key]) => key !== 'file')
          .map(([key, value]) => [key, String(value)]),
      ),
    );
    await requireProjectAccess(actor, input.projectId);
    if (input.visibility === 'CLIENT') await requireCapability(actor, 'CLIENT_CONTENT_PUBLISH');
    const file = form.get('file');
    ensure(file instanceof File, 'Choose a file to upload.');
    ensure(
      file.size > 0 && file.size <= max,
      'File must be within the configured upload limit.',
      413,
    );
    ensure(file.name.length <= 255 && file.type.length <= 150, 'File metadata is invalid.');
    const key = `${input.projectId}/${crypto.randomUUID()}`;
    storedKey = key;
    await storage().put({
      key,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || 'application/octet-stream',
    });
    const saved = await transaction(async (tx) => {
      noticeIds.length = 0;
      if (input.dailyLogId)
        ensure(
          await tx.dailyLog.findFirst({
            where: { id: input.dailyLogId, projectId: input.projectId },
          }),
          'Daily log not found.',
          404,
        );
      const record = await tx.storedFile.create({
        data: {
          ...input,
          uploaderId: actor.id,
          filename: file.name,
          originalFilename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: BigInt(file.size),
          storageKey: key,
        },
      });
      await publishProjectEvent(tx, {
        projectId: input.projectId,
        actorId: actor.id,
        action: input.kind === 'PHOTO' ? 'PHOTO_UPLOADED' : 'FILE_UPLOADED',
        entity: 'StoredFile',
        entityId: record.id,
        description: `${input.kind === 'PHOTO' ? 'uploaded photo' : 'uploaded file'} “${file.name}”`,
        after: { ...record, size: record.size.toString() },
      });
      if (record.visibility === 'CLIENT')
        noticeIds.push(
          ...(await clientNotice(tx, input.projectId, 'A new project file is available')),
        );
      return { ...record, size: record.size.toString() };
    });
    await deliverClientNotices(noticeIds).catch(() => undefined);
    return NextResponse.json(saved, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (storedKey)
      await storage()
        .remove(storedKey)
        .catch(() => undefined);
    const status =
      error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500;
    if (status === 500)
      console.error('File upload failed', {
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
    return NextResponse.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues.map((item) => item.message).join('; ')
              : 'Upload failed.',
      },
      { status },
    );
  }
}
