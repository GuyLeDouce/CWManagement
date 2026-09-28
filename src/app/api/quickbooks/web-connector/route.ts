import { parseSoap, soapResponse, soapFault } from '@/lib/quickbooks/soap';
import { connectorCallback } from '@/lib/quickbooks/engine';
import { MAX_XML_BYTES } from '@/lib/quickbooks/xml';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('text/xml'))
    return new Response(soapFault(), {
      status: 415,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Empty request');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_XML_BYTES) {
        await reader.cancel();
        throw new Error('Too large');
      }
      chunks.push(value);
    }
    const soap = parseSoap(
      Buffer.concat(chunks).toString('utf8'),
      request.headers.get('soapaction'),
    );
    const result = await connectorCallback(soap.method, soap.args);
    return new Response(soapResponse(soap.method, result), {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response(soapFault(), {
      status: 500,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
