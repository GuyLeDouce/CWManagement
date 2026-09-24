import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, ensure } from '@/lib/errors';
import { requireCapability, requireProjectAccess } from '@/lib/permissions';
import { storage } from '@/lib/storage';
import { clientFile } from '@/lib/client-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const id = (await context.params).id;
    const client = actor.roles.includes('CLIENT');
    if (!client) await requireCapability(actor, 'FILE_VIEW_INTERNAL');
    const record = client
      ? await clientFile(actor, id)
      : await db.storedFile.findFirst({ where: { id, archivedAt: null } });
    ensure(record, 'File not found.', 404);
    if (!client) await requireProjectAccess(actor, record.projectId);
    const bytes = await storage().get(record.storageKey);
    const inline = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(record.mimeType);
    return new NextResponse(new Uint8Array(bytes).buffer, {
      headers: {
        'Content-Type': record.mimeType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(record.originalFilename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof AppError ? error.message : 'File unavailable.' },
      { status },
    );
  }
}
