import { billNote, cartSummary, setQuantity, validateGuest } from './guestOrder';

const categories = [
  { id: 1, name: 'Starters', items: [{ id: 10, name: 'Paneer Tikka', price: '250.00' }, { id: 11, name: 'Soup', price: '99.50' }] },
  { id: 2, name: 'Breads', items: [{ id: 20, name: 'Butter Naan', price: '60.00' }] },
];

describe('guest details', () => {
  test('name and a valid mobile number are required', () => {
    expect(validateGuest({ name: '', phone: '' })).toEqual({ name: 'Enter your name.', phone: 'Enter your mobile number.' });
    expect(validateGuest({ name: 'Priya', phone: '12345' }).phone).toBe('Enter a valid mobile number.');
    expect(validateGuest({ name: 'Priya', phone: '+91 98765-43210' })).toEqual({});
  });
});

describe('cart', () => {
  test('counts, totals and keeps menu order', () => {
    let cart = setQuantity({}, 20, 2);
    cart = setQuantity(cart, 11, 1);
    const s = cartSummary(cart, categories);
    expect(s.lines.map((l) => l.item.name)).toEqual(['Soup', 'Butter Naan']);
    expect([s.count, s.total]).toEqual([3, 219.5]);
  });

  test('quantity stays between 0 and 20; 0 removes the line', () => {
    expect(setQuantity({}, 10, 25)).toEqual({ 10: 20 });
    expect(setQuantity({ 10: 1 }, 10, 0)).toEqual({});
  });
});

test('says what the bill adds to the menu prices', () => {
  expect(billNote({ prices_include_tax: true, service_charge_rate: null })).toBe('Prices include taxes.');
  expect(billNote({ prices_include_tax: false, service_charge_rate: '10.00' })).toBe('10% service charge and taxes are added on the bill.');
  expect(billNote({ prices_include_tax: true, service_charge_rate: '10.00' })).toBe('10% service charge is added on the bill.');
  expect(billNote({ prices_include_tax: false, service_charge_rate: null })).toBe('Taxes are added on the bill.');
});
