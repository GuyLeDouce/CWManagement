import { z } from 'zod';
import { object, parseXml, text, buildXml } from './xml';
import { ensure } from '../errors';
export const QBWC_NAMESPACE = 'http://developer.intuit.com';
const value = z.string().max(8 * 1024 * 1024);
const ticket = z.string().min(20).max(200);
export const callbacks = {
  serverVersion: z.object({}).strict(),
  clientVersion: z.object({ strVersion: value }).strict(),
  authenticate: z
    .object({ strUserName: z.string().min(1).max(100), strPassword: z.string().max(256) })
    .strict(),
  sendRequestXML: z
    .object({
      ticket,
      strHCPResponse: value,
      strCompanyFileName: z.string().max(2048),
      qbXMLCountry: z.string().max(20),
      qbXMLMajorVers: z.coerce.number().int(),
      qbXMLMinorVers: z.coerce.number().int(),
    })
    .strict(),
  receiveResponseXML: z
    .object({ ticket, response: value, hresult: z.string().max(100), message: value })
    .strict(),
  getLastError: z.object({ ticket }).strict(),
  closeConnection: z.object({ ticket }).strict(),
  connectionError: z.object({ ticket, hresult: z.string().max(100), message: value }).strict(),
};
export type Callback = keyof typeof callbacks;
export function parseSoap(xml: string, action: string | null) {
  const raw = parseXml(xml);
  const envelopeKey = Object.keys(raw).find((k) => k === 'Envelope' || k.endsWith(':Envelope'));
  ensure(envelopeKey, 'SOAP Envelope required.');
  const env = object(raw[envelopeKey]);
  const prefix = envelopeKey.includes(':') ? envelopeKey.split(':')[0] : '';
  ensure(
    text(env[prefix ? '@_xmlns:' + prefix : '@_xmlns']) ===
      'http://schemas.xmlsoap.org/soap/envelope/',
    'SOAP 1.1 required.',
  );
  const bodyKey = prefix ? prefix + ':Body' : 'Body';
  const body = object(env[bodyKey]);
  const keys = Object.keys(body).filter((k) => !k.startsWith('@_'));
  ensure(keys.length === 1, 'Exactly one SOAP method required.');
  const key = keys[0];
  const name = key.split(':').at(-1)!;
  ensure(Object.hasOwn(callbacks, name), 'Unsupported Web Connector method.');
  const node = object(body[key]);
  const methodPrefix = key.includes(':') ? key.split(':')[0] : '';
  ensure(
    text(
      node[methodPrefix ? '@_xmlns:' + methodPrefix : '@_xmlns'] ??
        env[methodPrefix ? '@_xmlns:' + methodPrefix : '@_xmlns'],
    ) === QBWC_NAMESPACE,
    'Unexpected Web Connector namespace.',
  );
  if (action)
    ensure(
      action.replaceAll('"', '') === `${QBWC_NAMESPACE}/${name}`,
      'SOAPAction does not match the method.',
    );
  const args = Object.fromEntries(
    Object.entries(node)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([k, v]) => [k.split(':').at(-1), typeof v === 'string' ? v : v === null ? '' : v]),
  );
  return { method: name as Callback, args: callbacks[name as Callback].parse(args) };
}
export function soapResponse(method: Callback, result: string | number | string[]) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    buildXml({
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        'soap:Body': {
          [method + 'Response']: {
            '@_xmlns': QBWC_NAMESPACE,
            [method + 'Result']: Array.isArray(result) ? { string: result } : result,
          },
        },
      },
    })
  );
}
export function soapFault() {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    buildXml({
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        'soap:Body': {
          'soap:Fault': {
            faultcode: 'soap:Client',
            faultstring:
              'Request rejected. Verify Web Connector configuration and review CWManagement diagnostics.',
          },
        },
      },
    })
  );
}
