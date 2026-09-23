import { describe, expect, it } from 'vitest';
import {
  actualCostSchema,
  estimateLineSchema,
  financialTotals,
  lineAmounts,
  money,
} from '../src/lib/financial';

describe('financial calculations', () => {
  it('rejects malformed, nonfinite, oversized, and overprecise financial inputs without throwing', () => {
    for (const value of ['invalid', 'NaN', 'Infinity', '-Infinity', '100000000000000', '0.00001']) {
      expect(estimateLineSchema.shape.quantity.safeParse(value).success).toBe(false);
      expect(estimateLineSchema.shape.unitCost.safeParse(value).success).toBe(false);
      expect(estimateLineSchema.shape.markupValue.safeParse(value).success).toBe(false);
    }
    expect(estimateLineSchema.shape.quantity.safeParse('-1').success).toBe(false);
    expect(estimateLineSchema.shape.unitCost.safeParse('12.3456').success).toBe(true);
    for (const value of ['invalid', 'NaN', 'Infinity', '0', '0.001', '10000000000000000'])
      expect(actualCostSchema.shape.amount.safeParse(value).success).toBe(false);
    expect(actualCostSchema.shape.amount.safeParse('-12.34').success).toBe(true);
  });
  it('calculates quantity, percentage markup on cost, and client price', () => {
    const result = lineAmounts({
      quantity: '10',
      unitCost: '1000',
      markupMethod: 'PERCENT_ON_COST',
      markupValue: '20',
    });
    expect(result.cost.toFixed(2)).toBe('10000.00');
    expect(result.markup.toFixed(2)).toBe('2000.00');
    expect(result.price.toFixed(2)).toBe('12000.00');
  });

  it('calculates taxable subtotal, HST, profit, and margin separately', () => {
    const totals = financialTotals(
      [
        {
          quantity: '3',
          unitCost: '33.335',
          markupMethod: 'FIXED',
          markupValue: '10',
          taxable: true,
          included: true,
        },
        {
          quantity: '1',
          unitCost: '50',
          markupMethod: 'NONE',
          markupValue: '0',
          taxable: false,
          included: true,
        },
        {
          quantity: '1',
          unitCost: '999',
          markupMethod: 'NONE',
          markupValue: '0',
          taxable: true,
          included: false,
        },
      ],
      '0.13',
    );
    expect(totals.cost.toFixed(2)).toBe('150.01');
    expect(totals.price.toFixed(2)).toBe('160.01');
    expect(totals.tax.toFixed(2)).toBe('14.30');
    expect(totals.total.toFixed(2)).toBe('174.31');
    expect(totals.profit.toFixed(2)).toBe('10.00');
    expect(totals.marginPercent.toFixed(2)).toBe('6.25');
  });

  it('rounds money half-up at the calculation boundary', () => {
    expect(money('1.005').toFixed(2)).toBe('1.01');
    expect(money('1.004').toFixed(2)).toBe('1.00');
  });
});
