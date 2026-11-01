import { exampleBill } from './billingExample';

describe('exampleBill', () => {
  it('Method 1: price without tax, service charge added and taxed', () => {
    expect(exampleBill({ price: 100, taxRate: 7, serviceRate: 10, pricesIncludeTax: false }))
      .toEqual({ base: 100, service: 10, tax: 7.7, total: 117.7 });
  });

  it('Method 2: price including tax, service charge on the price before tax', () => {
    expect(exampleBill({ price: 107, taxRate: 7, serviceRate: 10, pricesIncludeTax: true }))
      .toEqual({ base: 100, service: 10, tax: 7.7, total: 117.7 });
  });

  it('Method 3: price including tax, no service charge', () => {
    expect(exampleBill({ price: 107, taxRate: 7, serviceRate: 0, pricesIncludeTax: true }))
      .toEqual({ base: 100, service: 0, tax: 7, total: 107 });
  });
});
