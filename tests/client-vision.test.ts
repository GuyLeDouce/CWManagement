import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clientPrice } from '../src/lib/client-pricing';
import { ClientPrice } from '../src/components/client-portal';
describe('client fixed-price presentation', () => {
  it('renders only the final total by default, with no separate tax or subtotal line', () => {
    const html = renderToStaticMarkup(
      createElement(ClientPrice, {
        value: clientPrice('100000', '13000', '113000', 'FINAL_TOTAL_ONLY'),
      }),
    );
    expect(html).toContain('$113,000.00');
    expect(html).not.toContain('HST');
    expect(html).not.toContain('Subtotal');
    expect(html).not.toContain('$100,000.00');
  });
  it('breakdown shows the same authoritative total and recorded tax', () => {
    const html = renderToStaticMarkup(
      createElement(ClientPrice, {
        value: clientPrice('27000', '3510', '30510', 'SHOW_TAX_BREAKDOWN'),
      }),
    );
    for (const amount of ['$27,000.00', '$3,510.00', '$30,510.00']) expect(html).toContain(amount);
    expect(html).not.toContain('$20,000');
  });
  it('does not recalculate tax and preserves signed credits and Decimal rounding', () => {
    expect(clientPrice('-2000', '-260', '-2260', 'FINAL_TOTAL_ONLY')).toEqual({
      total: '-2260.00',
    });
    expect(clientPrice('1.005', '0', '1.005', 'SHOW_TAX_BREAKDOWN')).toEqual({
      subtotal: '1.01',
      tax: '0.00',
      total: '1.01',
    });
  });
});
