import { describe, it, expect } from 'vitest';
import {
  purchasingProjection,
  evidenceHash,
  instructionSnapshot,
} from '../src/lib/trade-projections';
import { validateTradeUpload } from '../src/lib/trade-uploads';
import { isTrade, portalPath } from '../src/lib/external-identity';
import type { User } from '@prisma/client';
describe('trade-safe projections and upload validation', () => {
  it('strips nested financial and identity internals while retaining own agreed price', () => {
    const dto = purchasingProjection({
      number: 'WO-1',
      revision: 0,
      type: 'WORK_ORDER',
      title: 'Electrical',
      issuedAt: '2026-09-24',
      project: { name: 'House', number: 'P1', contractAmount: '900000', internalNotes: 'PRIVATE' },
      company: { name: 'Cedar Winds' },
      vendor: { name: 'ABC', contactName: 'Joe', quickBooksId: 'PRIVATE' },
      lines: [
        {
          description: 'Rough in',
          quantity: '1',
          unitCost: '10000',
          amount: '10000',
          taxable: true,
          markup: '50',
          clientPrice: '15000',
        },
      ],
      subtotal: '10000',
      tax: '1300',
      total: '11300',
      budget: 'PRIVATE',
      changeOrder: { total: '15000' },
    });
    expect(dto.lines[0].unitPrice).toBe('10000');
    for (const key of [
      'unitCost',
      'markup',
      'clientPrice',
      'budget',
      'quickBooks',
      'internalNotes',
      'contractAmount',
      'changeOrder',
      'PRIVATE',
    ])
      expect(JSON.stringify(dto)).not.toContain(key);
    expect(evidenceHash(dto)).toBe(evidenceHash(dto));
    expect(evidenceHash({ ...dto, title: 'Changed' })).not.toBe(evidenceHash(dto));
  });
  it('instruction projection strips internal notes and attachment storage locations', () => {
    expect(
      instructionSnapshot.parse({
        number: 'SI-1',
        title: 'Work',
        description: 'Install',
        issuedAt: 'today',
        acknowledgementRequired: true,
        internalNotes: 'PRIVATE',
        attachments: [{ id: 'file', name: 'drawing', storageKey: 'PRIVATE' }],
      }),
    ).toEqual({
      number: 'SI-1',
      title: 'Work',
      description: 'Install',
      issuedAt: 'today',
      acknowledgementRequired: true,
      attachments: [{ id: 'file', name: 'drawing' }],
    });
  });
  it('rejects forged MIME, executable names and traversal; accepts recognized content', () => {
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    expect(validateTradeUpload('repair.png', 'image/png', png)).toBe('image/png');
    expect(() => validateTradeUpload('../repair.png', 'image/png', png)).toThrow();
    expect(() => validateTradeUpload('repair.exe', 'image/png', png)).toThrow();
    expect(() => validateTradeUpload('repair.jpg', 'image/jpeg', Buffer.from('malware'))).toThrow();
    expect(() => validateTradeUpload('repair.pdf', 'application/pdf', png)).toThrow();
  });
  it('requires exactly one external identity role', () => {
    for (const roles of [['SUBTRADE'], ['VENDOR']] as User['roles'][])
      expect(isTrade({ roles } as User)).toBe(true);
    for (const roles of [
      ['CLIENT'],
      ['SUBTRADE', 'OWNER'],
      ['SUBTRADE', 'VENDOR'],
    ] as User['roles'][])
      expect(isTrade({ roles } as User)).toBe(false);
    expect(portalPath({ roles: ['SUBTRADE'] } as User)).toBe('/trade');
  });
});
