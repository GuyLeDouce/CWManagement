import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runAutomation } from '@/lib/automation';
import { z } from 'zod';
import { rateLimit } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const secret = process.env.AUTOMATION_SECRET,
    token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (
    !secret ||
    secret.length < 32 ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await rateLimit('scheduled-endpoint', 60, 3600);
    const text = await request.text();
    if (text.length > 2048)
      return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const diagnostic = text
      ? z
          .object({ userId: z.string().min(1), requestId: z.uuid() })
          .strict()
          .parse(JSON.parse(text))
      : undefined;
    return NextResponse.json(await runAutomation(new Date(), diagnostic));
  } catch {
    console.error('Automation failed', { category: 'SCHEDULED_RUN' });
    return NextResponse.json({ error: 'Scheduled run failed.' }, { status: 503 });
  }
}
