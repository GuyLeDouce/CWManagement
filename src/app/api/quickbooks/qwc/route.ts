import { requireUser } from '@/lib/auth';
import { downloadQwc } from '@/lib/quickbooks/admin';
import { AppError } from '@/lib/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    return new Response(
      await downloadQwc(actor, new URL(request.url).searchParams.get('id') ?? ''),
      {
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': 'attachment; filename="CWManagement.qwc"',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : 'Unable to download configuration.' },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
