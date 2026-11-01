const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * A bill for one item of `price`, the same way the server works it out (orders/pricing.py):
 * the service charge is on the price before tax and is taxed too.
 */
export const exampleBill = ({ price, taxRate, serviceRate, pricesIncludeTax }) => {
  const base = pricesIncludeTax ? price * 100 / (100 + taxRate) : price;
  const service = round2(base * serviceRate / 100);
  const taxOnBase = round2(base * taxRate / 100);
  const taxOnService = round2((base * serviceRate / 100) * taxRate / 100);
  const tax = round2(taxOnBase + taxOnService);
  const total = round2((pricesIncludeTax ? price + taxOnService : price + taxOnBase + taxOnService) + service);
  return { base: round2(base), service, tax, total };
};
