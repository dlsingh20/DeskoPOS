import {
  EMPTY_TAX,
  categoryTaxIds,
  categoryTaxSummary,
  previewTaxes,
  taxFormToPayload,
  validateTax,
} from './taxUtils';

const cgst = { id: 1, name: 'CGST', type: 'percentage', rate: '2.500', channels: ['dine_in', 'takeaway', 'delivery'] };
const sgst = { id: 2, name: 'SGST', type: 'percentage', rate: '2.500', channels: ['dine_in', 'takeaway', 'delivery'] };
const deposit = { id: 3, name: 'Bottle deposit', type: 'fixed', amount: '10.00', fixed_basis: 'per_unit', channels: [] };
const packing = { id: 4, name: 'Packing', type: 'fixed', amount: '20.00', fixed_basis: 'per_bill', channels: ['takeaway'] };

describe('previewTaxes', () => {
  test('percentage taxes each on the line amount, fixed per unit × quantity', () => {
    const r = previewTaxes(100, 3, [cgst, sgst, deposit]);
    expect(r.lineAmount).toBe(300);
    expect(r.lines.map((l) => l.amount)).toEqual([7.5, 7.5, 30]);
    expect(r.taxTotal).toBe(45);
    expect(r.total).toBe(345);
  });

  test('percentages apply after the line discount; per-bill fixed once; channel filter', () => {
    const r = previewTaxes(100, 2, [cgst, packing], { channel: 'takeaway', discount: 50 });
    expect(r.lineAmount).toBe(150);
    expect(r.lines).toEqual([
      expect.objectContaining({ id: 1, amount: 3.75 }),
      expect.objectContaining({ id: 4, amount: 20, perBill: true }),
    ]);
    expect(previewTaxes(100, 2, [packing], { channel: 'dine_in' }).lines).toHaveLength(0);
  });

  test('labels use the given price format', () => {
    expect(previewTaxes(100, 1, [deposit], { formatPrice: (v) => `₹${Number(v).toFixed(2)}` }).lines[0].label).toBe('Bottle deposit ₹10.00 per item');
  });

  test('inactive taxes are skipped', () => {
    expect(previewTaxes(100, 1, [{ ...cgst, is_active: false }]).taxTotal).toBe(0);
  });
});

describe('tax form', () => {
  test('validation: name, duplicate, rate range, fixed amount decimals, channels', () => {
    expect(validateTax(EMPTY_TAX)).toMatchObject({ name: expect.any(String), rate: expect.any(String) });
    expect(validateTax({ ...EMPTY_TAX, name: 'cgst', rate: '5' }, { taxes: [cgst] }).name).toMatch(/already exists/);
    expect(validateTax({ ...EMPTY_TAX, name: 'CGST', rate: '5' }, { taxes: [cgst], editingId: 1 })).toEqual({});
    expect(validateTax({ ...EMPTY_TAX, name: 'X', rate: '101' }).rate).toBeTruthy();
    expect(validateTax({ ...EMPTY_TAX, name: 'X', type: 'fixed', amount: '1.234' }).amount).toBeTruthy();
    expect(validateTax({ ...EMPTY_TAX, name: 'X', type: 'fixed', amount: '10' }, { decimals: 0 })).toEqual({});
    expect(validateTax({ ...EMPTY_TAX, name: 'X', rate: '5', channels: [] }).channels).toBeTruthy();
  });

  test('payload clears the fields of the other type', () => {
    expect(taxFormToPayload({ ...EMPTY_TAX, name: ' VAT ', code: 'vat', rate: '5' })).toMatchObject({
      name: 'VAT', code: 'VAT', type: 'percentage', rate: '5.000', amount: null, fixed_basis: null,
    });
    expect(taxFormToPayload({ ...EMPTY_TAX, name: 'Packing', type: 'fixed', amount: '20', fixed_basis: 'per_bill' })).toMatchObject({
      type: 'fixed', rate: null, amount: '20.00', fixed_basis: 'per_bill',
    });
  });
});

describe('category taxes', () => {
  test('reads tax_ids or taxes[] and summarises; falls back to the single rate', () => {
    expect(categoryTaxIds({ tax_ids: ['1', 2] })).toEqual([1, 2]);
    expect(categoryTaxIds({ taxes: [{ id: 3 }, 4] })).toEqual([3, 4]);
    expect(categoryTaxSummary({ tax_ids: [1, 3] }, [cgst, sgst, deposit], (v) => Number(v).toFixed(2))).toBe('CGST 2.5% + Bottle deposit 10.00 per item');
    expect(categoryTaxSummary({ tax_rate: '5.00' }, [cgst])).toBe('5%');
  });
});
