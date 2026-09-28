import { describe, it, expect } from 'vitest';
import {
  relativeSchedule,
  standardContent,
  assemblyQuantity,
  catalogSchema,
} from '../src/lib/standards-schema';
describe('Company standards calculations', () => {
  it('resolves relative dependency dates regardless of row order', () => {
    const c = standardContent.parse({
      tasks: [
        { key: 'b', name: 'Framing', predecessor: 'a', lagDays: 2, durationDays: 5 },
        { key: 'a', name: 'Foundation', offsetDays: 10, durationDays: 4 },
      ],
    });
    const tasks = relativeSchedule(c.tasks, '2026-10-01');
    expect(tasks[0].startDate.toISOString().slice(0, 10)).toBe('2026-10-17');
    expect(tasks[0].endDate.toISOString().slice(0, 10)).toBe('2026-10-22');
  });
  it('rejects cycles, missing dependencies and duplicate keys', () => {
    for (const tasks of [
      [
        { key: 'a', name: 'A', predecessor: 'b' },
        { key: 'b', name: 'B', predecessor: 'a' },
      ],
      [{ key: 'a', name: 'A', predecessor: 'missing' }],
      [
        { key: 'a', name: 'A' },
        { key: 'a', name: 'B' },
      ],
    ])
      expect(() =>
        relativeSchedule(standardContent.parse({ tasks }).tasks, '2026-01-01'),
      ).toThrow();
  });
  it('uses Decimal multiplication with four-place quantity rounding and rejects overflow', () => {
    expect(assemblyQuantity('2400', '0.125')).toBe('300');
    expect(assemblyQuantity('1.2345', '1.2345')).toBe('1.524');
    expect(() => assemblyQuantity('-1', '1')).toThrow();
    expect(() => assemblyQuantity('9999999999', '9999999999')).toThrow();
  });
  it('does not accept financial ledgers or publishing state in reusable structures', () => {
    expect(() => standardContent.parse({ actualCosts: [] })).toThrow();
    expect(() =>
      standardContent.parse({ selections: [{ title: 'Tile', status: 'APPROVED' }] }),
    ).toThrow();
    expect(() =>
      catalogSchema.parse({
        name: 'X',
        costCodeId: 'code',
        costType: 'MATERIAL',
        unit: 'ea',
        unitCost: 'NaN',
      }),
    ).toThrow();
  });
});
