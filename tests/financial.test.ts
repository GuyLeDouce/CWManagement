import { describe, expect, it } from 'vitest';
import { fulfillmentState } from '../src/lib/commitments';
import { purchasingSchema } from '../src/lib/purchasing';
import { changeOrderSchema } from '../src/lib/change-orders';
import {
  actualCostSchema,
  estimateLineSchema,
  financialTotals,
  lineAmounts,
  money,
} from '../src/lib/financial';

describe('financial calculations', () => {
  it('distinguishes committed, partially fulfilled, and fulfilled without counting consumed amounts twice', () => {
    expect(fulfillmentState([{ committedAmount: '10000', consumedAmount: '0' }])).toBe('COMMITTED');
    expect(fulfillmentState([{ committedAmount: '10000', consumedAmount: '4000' }])).toBe(
      'PARTIALLY_FULFILLED',
    );
    expect(fulfillmentState([{ committedAmount: '10000', consumedAmount: '10000' }])).toBe(
      'FULFILLED',
    );
    expect(
      fulfillmentState([
        { committedAmount: '10000', consumedAmount: '10000' },
        { committedAmount: '2000', consumedAmount: '0' },
      ]),
    ).toBe('PARTIALLY_FULFILLED');
  });
  it('rejects negative purchasing quantities, client-supplied totals, and fractional schedule days', () => {
    const line = {
      costCodeId: 'code',
      costType: 'MATERIAL',
      description: 'Material',
      quantity: '-1',
      unit: 'EA',
      unitCost: '10',
      taxable: true,
      sortOrder: 0,
    };
    const po = {
      projectId: 'project',
      type: 'PURCHASE_ORDER',
      vendorContactId: 'vendor',
      title: 'PO',
      lines: [line],
    };
    expect(purchasingSchema.safeParse(po).success).toBe(false);
    expect(purchasingSchema.safeParse({ ...po, lines: [], total: 1 }).success).toBe(false);
    expect(
      changeOrderSchema.safeParse({
        projectId: 'project',
        title: 'CO',
        lines: [],
        scheduleDays: 1.5,
      }).success,
    ).toBe(false);
  });
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
