import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import { ensure } from '../errors';
export type XmlNode = { [key: string]: unknown };
export const object = (v: unknown): XmlNode =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as XmlNode) : {};
export const list = (v: unknown): XmlNode[] =>
  v == null ? [] : (Array.isArray(v) ? v : [v]).map(object);
export const text = (v: unknown) =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
export const required = (n: XmlNode, key: string) => {
  const v = text(n[key]);
  ensure(v.length > 0 && v.length <= 1000, `QuickBooks response is missing ${key}.`);
  return v;
};
export const MAX_XML_BYTES = 8 * 1024 * 1024;
export function parseXml(xml: string, removeNSPrefix = false): XmlNode {
  ensure(Buffer.byteLength(xml) <= MAX_XML_BYTES, 'XML exceeds the permitted size.', 413);
  // These are forbidden declarations, not a regex XML parser. No custom entities can enter the parser.
  ensure(!/<!\s*(DOCTYPE|ENTITY)/i.test(xml), 'DTD and entity declarations are not accepted.');
  ensure(XMLValidator.validate(xml) === true, 'Malformed XML.');
  try {
    return object(
      new XMLParser({
        ignoreAttributes: false,
        parseTagValue: false,
        parseAttributeValue: false,
        trimValues: false,
        removeNSPrefix,
        ignoreDeclaration: true,
        ignorePiTags: true,
        maxNestedTags: 40,
        processEntities: {
          enabled: true,
          maxEntitySize: 4096,
          maxExpansionDepth: 2,
          maxTotalExpansions: 100000,
          maxExpandedLength: MAX_XML_BYTES,
        },
      }).parse(xml),
    );
  } catch {
    ensure(false, 'Malformed or excessive XML.');
  }
}
export const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  suppressEmptyNode: false,
  format: false,
  processEntities: true,
});
export const buildXml = (value: unknown) => xmlBuilder.build(value);
export function qbVersion(major: number, minor: number) {
  ensure(
    Number.isInteger(major) && major >= 13 && Number.isInteger(minor) && minor >= 0,
    'qbXML 13.0 or later is required for this integration.',
  );
  return '13.0';
}
export function qbRequest(operation: string, data: XmlNode, id: string, version = '13.0') {
  ensure(/^[A-Za-z]+Rq$/.test(operation) && version === '13.0', 'Unsupported qbXML message.');
  return (
    `<?xml version="1.0" encoding="utf-8"?><?qbxml version="${version}"?>` +
    buildXml({
      QBXML: {
        QBXMLMsgsRq: { '@_onError': 'stopOnError', [operation]: { '@_requestID': id, ...data } },
      },
    })
  );
}
export function qbResponse(xml: string) {
  const envelope = object(parseXml(xml).QBXML);
  const messages = object(envelope.QBXMLMsgsRs);
  const keys = Object.keys(messages).filter((k) => k.endsWith('Rs'));
  ensure(keys.length === 1, 'Expected one qbXML response.');
  const node = object(messages[keys[0]]);
  ensure(!Array.isArray(messages[keys[0]]), 'Duplicate qbXML response.');
  return {
    operation: keys[0],
    node,
    requestId: required(node, '@_requestID'),
    code: required(node, '@_statusCode'),
    severity: required(node, '@_statusSeverity'),
  };
}
export function safeStatus(code: string) {
  return (
    (
      {
        '0': 'Completed.',
        '1': 'No matching records.',
        '3100': 'A matching name already exists. Refresh lists and map the existing record.',
        '3120': 'QuickBooks reference was not found. Refresh and review mappings.',
        '3140':
          'QuickBooks rejected a reference or account. Refresh Vendor, Job and Item mappings.',
        '3170': 'QuickBooks rejected a modification. Review the accounting record.',
        '3200': 'EditSequence changed in QuickBooks. Refresh and reconcile before modifying.',
        '3260': 'QuickBooks is busy. Retry this rejected request after the record is released.',
      } as Record<string, string>
    )[code] ||
    `QuickBooks rejected the request (status ${/^\d{1,8}$/.test(code) ? code : 'unknown'}). Review the record in QuickBooks.`
  );
}
