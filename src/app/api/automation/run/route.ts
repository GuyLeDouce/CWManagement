import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runAutomation } from '@/lib/automation';
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
    return NextResponse.json(await runAutomation());
  } catch {
    console.error('Automation failed', { category: 'SCHEDULED_RUN' });
    return NextResponse.json({ error: 'Scheduled run failed.' }, { status: 503 });
  }
}
