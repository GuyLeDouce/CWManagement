import { MarkupMethod, Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal;
export const money = (value: Prisma.Decimal.Value) =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export function lineAmounts(input: {
  quantity: Prisma.Decimal.Value;
  unitCost: Prisma.Decimal.Value;
  markupMethod: MarkupMethod;
  markupValue: Prisma.Decimal.Value;
}) {
  const cost = money(new Decimal(input.quantity).mul(input.unitCost));
  const markup =
    input.markupMethod === 'PERCENT_ON_COST'
      ? money(cost.mul(input.markupValue).div(100))
      : input.markupMethod === 'FIXED'
        ? money(input.markupValue)
        : money(0);
  return { cost, markup, price: money(cost.add(markup)) };
}
export function financialTotals(
  lines: Array<Parameters<typeof lineAmounts>[0] & { taxable: boolean; included: boolean }>,
  taxRate: Prisma.Decimal.Value,
) {
  let cost = new Decimal(0),
    price = new Decimal(0),
    taxable = new Decimal(0);
  for (const line of lines.filter((x) => x.included)) {
    const amounts = lineAmounts(line);
    cost = cost.add(amounts.cost);
    price = price.add(amounts.price);
    if (line.taxable) taxable = taxable.add(amounts.price);
  }
  cost = money(cost);
  price = money(price);
  const tax = money(taxable.mul(taxRate)),
    profit = money(price.sub(cost));
  return {
    cost,
    markup: profit,
    price,
    tax,
    total: money(price.add(tax)),
    profit,
    marginPercent: price.eq(0)
      ? new Decimal(0)
      : profit.div(price).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}
