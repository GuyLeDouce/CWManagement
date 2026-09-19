import { describe, it, expect } from 'vitest';
import {
  correctionTimestamp,
  hasCurrentApproval,
  paidStart,
  previousWeek,
  splitAtMidnights,
  nextType,
  overlaps,
  clippedMs,
  hours,
  dateRange,
} from '../src/lib/time';
import { hashPassword, verifyPassword } from '../src/lib/crypto';
import { csvCell } from '../src/lib/reports';
import { modes } from '../src/lib/permissions';
const d = (v: string) => new Date(v);
describe('paid time and Toronto calendar boundaries', () => {
  it('preserves a 06:43 scan while paying from 07:00', () => {
    const actual = d('2026-09-14T10:43:00Z');
    expect(paidStart(actual, '07:00', 'America/Toronto').toISOString()).toBe(
      '2026-09-14T11:00:00.000Z',
    );
    expect(actual.toISOString()).toBe('2026-09-14T10:43:00.000Z');
  });
  it('pays from an actual late arrival', () =>
    expect(paidStart(d('2026-09-14T11:18:00Z'), '07:00', 'America/Toronto').toISOString()).toBe(
      '2026-09-14T11:18:00.000Z',
    ));
  it('uses winter offset', () =>
    expect(paidStart(d('2026-01-12T11:43:00Z'), '07:00', 'America/Toronto').toISOString()).toBe(
      '2026-01-12T12:00:00.000Z',
    ));
  it('uses each employee start setting', () =>
    expect(paidStart(d('2026-09-14T11:00:00Z'), '09:00', 'America/Toronto').toISOString()).toBe(
      '2026-09-14T13:00:00.000Z',
    ));
  it('finds the previous completed Monday–Sunday week across DST', () => {
    const r = previousWeek(d('2026-03-09T14:00:00Z'), 'America/Toronto');
    expect(r.start.toISOString()).toBe('2026-03-02T05:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
  it('splits a spring-forward day into 23 paid hours', () => {
    const rows = splitAtMidnights(
      d('2026-03-08T05:00:00Z'),
      d('2026-03-10T04:00:00Z'),
      'America/Toronto',
    );
    expect(rows).toHaveLength(2);
    expect(+rows[0].end - +rows[0].start).toBe(23 * 3600000);
  });
  it('splits a fall-back day into 25 hours', () => {
    const rows = splitAtMidnights(
      d('2026-11-01T04:00:00Z'),
      d('2026-11-03T05:00:00Z'),
      'America/Toronto',
    );
    expect(+rows[0].end - +rows[0].start).toBe(25 * 3600000);
  });
  it('retains zero paid time for a pre-start clock-out', () =>
    expect(
      splitAtMidnights(d('2026-09-14T11:00Z'), d('2026-09-14T11:00Z'), 'America/Toronto'),
    ).toHaveLength(1));
  it('rejects invalid timezone or time', () => {
    expect(() => paidStart(new Date(), '25:00', 'America/Toronto')).toThrow();
    expect(() => paidStart(new Date(), '07:00', 'No/SuchZone')).toThrow();
  });
  it('limits reporting ranges and includes the final local day', () => {
    const range = dateRange('2026-03-08', '2026-03-08', 'America/Toronto');
    expect(+range.end - +range.start).toBe(23 * 3600000);
    expect(() => dateRange('2026-09-20', '2026-09-19', 'America/Toronto')).toThrow();
  });
});
describe('clock state machine', () => {
  it('task switches stay site labour', () => expect(nextType('SITE', true, 'SWITCH')).toBe('SITE'));
  it('site changes create travel', () => expect(nextType('SITE', false, 'SWITCH')).toBe('TRAVEL'));
  it('arrival closes travel and opens site labour', () =>
    expect(nextType('TRAVEL', true, 'ARRIVED')).toBe('SITE'));
  it('cannot arrive twice', () => expect(() => nextType('SITE', true, 'ARRIVED')).toThrow());
  it('cannot switch travel into productive work', () =>
    expect(() => nextType('TRAVEL', true, 'SWITCH')).toThrow());
  it('shop and office projects do not create site travel', () => {
    expect(nextType('SHOP', false, 'SWITCH')).toBe('SHOP');
    expect(nextType('OFFICE', false, 'SWITCH')).toBe('OFFICE');
  });
  it('multiple work modes are not mutually exclusive', () =>
    expect(modes({ roles: ['SHOP', 'SITE', 'OFFICE', 'PM'] })).toEqual(['SHOP', 'SITE', 'OFFICE']));
});
describe('payroll precision and protected output', () => {
  it('sums before rounding and clips at period boundaries', () => {
    const total = Array.from({ length: 3600 }, () => 1000).reduce((a, b) => a + b, 0);
    expect(hours(total)).toBe('1.0000');
    expect(
      clippedMs(
        d('2026-09-14T10:00Z'),
        d('2026-09-14T13:00Z'),
        d('2026-09-14T11:00Z'),
        d('2026-09-14T12:00Z'),
      ),
    ).toBe(3600000);
  });
  it('allows adjacent segments and rejects true overlaps', () => {
    const a = { start: d('2026-09-14T11:00Z'), end: d('2026-09-14T12:00Z') };
    expect(overlaps(a, { start: a.end, end: d('2026-09-14T13:00Z') })).toBe(false);
    expect(overlaps(a, { start: d('2026-09-14T11:30Z'), end: d('2026-09-14T13:00Z') })).toBe(true);
  });
  it('neutralizes formula injection and quotes CSV', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('  +SUM(1)')).toBe('"\'  +SUM(1)"');
    expect(csvCell('a,b')).toBe('"a,b"');
  });
  it('hashes passwords with unique salts and rejects wrong passwords', async () => {
    const a = await hashPassword('strong-example-password');
    const b = await hashPassword('strong-example-password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('strong-example-password', a)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
  });
});

describe('correction and approval evidence', () => {
  it('preserves milliseconds when a displayed time is unchanged', () =>
    expect(
      correctionTimestamp('2026-09-14T07:00:13', '2026-09-14T11:00:13.987Z', 'America/Toronto'),
    ).toBe('2026-09-14T11:00:13.987Z'));
  it('rejects a nonexistent spring-forward correction time', () =>
    expect(() =>
      correctionTimestamp('2026-03-08T02:30:00', '2026-03-08T06:00:00Z', 'America/Toronto'),
    ).toThrow('does not exist'));
  it('does not count an unapproved owner export as PM-approved hours', () => {
    expect(hasCurrentApproval({ status: 'EXPORTED', version: 1, approvals: [] })).toBe(false);
    expect(
      hasCurrentApproval({ status: 'EXPORTED', version: 2, approvals: [{ segmentVersion: 2 }] }),
    ).toBe(true);
  });
});
