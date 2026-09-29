import { NextRequest, NextResponse } from 'next/server';
import { requireUser, rateLimit } from '@/lib/auth';
import { appUrl } from '@/lib/email';
import { AppError, ensure } from '@/lib/errors';
import { maximumUploadBytes } from '@/lib/storage';
import { uploadWarrantyFile } from '@/lib/warranty-files';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    ensure(request.headers.get('origin') === appUrl(), 'Request origin is not allowed.', 403);
    const actor = await requireUser();
    await rateLimit(`warranty-upload:${actor.id}`, 30, 60);
    ensure(
      Number(request.headers.get('content-length') || 0) <= maximumUploadBytes() + 65536,
      'Upload is too large.',
      413,
    );
    const form = await request.formData(),
      file = form.get('file');
    ensure(file instanceof File, 'Choose a file.');
    ensure(file.size <= maximumUploadBytes(), 'Upload is too large.', 413);
    return NextResponse.json(
      await uploadWarrantyFile(
        actor,
        Object.fromEntries([...form.entries()].filter(([k]) => k !== 'file')),
        { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AppError ? e.message : 'Upload failed. Check the file and try again.' },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
