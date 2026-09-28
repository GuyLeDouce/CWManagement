import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, rateLimit } from '@/lib/auth';
import { appUrl } from '@/lib/email';
import { ensure, AppError } from '@/lib/errors';
import { isTrade } from '@/lib/external-identity';
import { maximumUploadBytes } from '@/lib/storage';
import { tradeUploadSchema, uploadTradeFile } from '@/lib/trade-uploads';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    ensure(request.headers.get('origin') === appUrl(), 'Request origin is not allowed.', 403);
    const actor = await requireUser();
    ensure(isTrade(actor), 'Trade access required.', 403);
    await rateLimit(`trade-upload:${actor.id}`, 30, 60);
    ensure(
      Number(request.headers.get('content-length') || 0) <= maximumUploadBytes() + 65536,
      'Upload is too large.',
      413,
    );
    const form = await request.formData();
    const input = tradeUploadSchema.parse(
      Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file')),
    );
    const file = form.get('file');
    ensure(file instanceof File, 'Choose a file.');
    ensure(file.size <= maximumUploadBytes(), 'Upload is too large.', 413);
    const result = await uploadTradeFile(actor, input, {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : error instanceof z.ZodError
              ? 'Invalid upload fields.'
              : 'Upload failed. Please try again.',
      },
      {
        status: error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500,
      },
    );
  }
}
