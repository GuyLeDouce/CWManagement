import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, ensure } from '@/lib/errors';
import { requireCapability, requireProjectAccess } from '@/lib/permissions';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(); await requireCapability(actor, 'FILE_VIEW_INTERNAL');
    const record = await db.storedFile.findFirst({ where: { id: (await context.params).id, archivedAt: null } }); ensure(record, 'File not found.', 404); await requireProjectAccess(actor, record.projectId);
    const bytes = await storage().get(record.storageKey);
    return new NextResponse(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': record.mimeType, 'Content-Length': String(bytes.byteLength), 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(record.originalFilename)}`, 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: error instanceof AppError ? error.message : 'File unavailable.' }, { status });
  }
}
