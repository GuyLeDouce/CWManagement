import { describe, it, expect } from 'vitest';
import { parseSoap, soapResponse } from '../src/lib/quickbooks/soap';
import { parseXml, object, qbRequest, qbResponse, qbVersion } from '../src/lib/quickbooks/xml';
import { qwc } from '../src/lib/quickbooks/qwc';
import { billData } from '../src/lib/quickbooks/bills';
describe('QuickBooks protocol boundaries', () => {
  it('parses exact SOAP callback parameters and escapes responses', () => {
    const xml =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><authenticate xmlns="http://developer.intuit.com"><strUserName>cedar</strUserName><strPassword>a&amp;b</strPassword></authenticate></soap:Body></soap:Envelope>';
    expect(parseSoap(xml, '"http://developer.intuit.com/authenticate"').args).toEqual({
      strUserName: 'cedar',
      strPassword: 'a&b',
    });
    expect(soapResponse('authenticate', ['ticket', 'C:\\a&b.qbw'])).toContain('a&amp;b');
    expect(() => parseSoap(xml, 'http://developer.intuit.com/other')).toThrow();
  });
  it('rejects DTD, custom entities, malformed XML and SOAP namespaces', () => {
    for (const xml of [
      '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secrets">]><a>&x;</a>',
      '<a><b></a>',
      '<Envelope><Body/></Envelope>',
    ])
      expect(() => parseSoap(xml, null)).toThrow();
  });
  it('builds qbXML with deterministic request ID and safely escaped references', () => {
    const xml = qbRequest(
      'PurchaseOrderAddRq',
      {
        PurchaseOrderAdd: {
          VendorRef: { ListID: 'v&1' },
          PurchaseOrderLineAdd: { Quantity: '2', Rate: '125.25', CustomerRef: { ListID: 'job' } },
        },
      },
      'request',
    );
    const msgs = object(object(parseXml(xml).QBXML).QBXMLMsgsRq);
    expect(object(msgs.PurchaseOrderAddRq)['@_requestID']).toBe('request');
    expect(xml).toContain('v&amp;1');
    expect(qbVersion(16, 0)).toBe('13.0');
    expect(() => qbVersion(12, 0)).toThrow();
  });
  it('requires matching structured status metadata', () => {
    expect(
      qbResponse(
        '<QBXML><QBXMLMsgsRs><BillQueryRs requestID="r" statusCode="3200" statusSeverity="Error"/></QBXMLMsgsRs></QBXML>',
      ).code,
    ).toBe('3200');
    expect(() => qbResponse('<QBXML><QBXMLMsgsRs><BillQueryRs/></QBXMLMsgsRs></QBXML>')).toThrow();
  });
  it('QWC uses configured URL, stable identifiers, interval and no password', () => {
    process.env.APP_URL = 'https://cw.example.test';
    const xml = qwc({ username: 'cw', ownerGuid: 'a', fileGuid: 'b', intervalMinutes: 30 });
    expect(xml).toContain('https://cw.example.test/api/quickbooks/web-connector');
    expect(xml).toContain('<RunEveryNMinutes>30</RunEveryNMinutes>');
    expect(xml.toLowerCase()).not.toContain('password');
    expect(xml).toContain('<QBType>QBFS</QBType>');
    for (const url of [
      'ftp://localhost:3000',
      'http://example.test',
      'https://user:secret@example.test',
    ]) {
      process.env.APP_URL = url;
      expect(() =>
        qwc({ username: 'cw', ownerGuid: 'a', fileGuid: 'b', intervalMinutes: 30 }),
      ).toThrow();
    }
    process.env.APP_URL = 'https://cw.example.test';
  });
  it('normalizes Bill lines independently and rejects unsupported groups', () => {
    const b = billData({
      TxnID: 'b',
      EditSequence: '1',
      TxnDate: '2026-09-24',
      ItemLineRet: [
        {
          TxnLineID: '1',
          Amount: '5000',
          CustomerRef: { ListID: 'jobA' },
          ItemRef: { ListID: 'i1' },
        },
        {
          TxnLineID: '2',
          Amount: '3000',
          CustomerRef: { ListID: 'jobB' },
          ItemRef: { ListID: 'i2' },
        },
      ],
    });
    expect(b.lines.map((l) => l.project)).toEqual(['jobA', 'jobB']);
    expect(() => billData({ ItemGroupLineRet: {} })).toThrow();
  });
});
