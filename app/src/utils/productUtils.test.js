/**
 * @jest-environment node
 */
import zlib from 'zlib';
import { DecompressionStream } from 'stream/web';
import {
  duplicateForm,
  filterProducts,
  formToPayload,
  normalizeAllergens,
  normalizeAmount,
  parseCsv,
  planImport,
  productToForm,
  productsToRows,
  sortProducts,
  toCsv,
  validateCategory,
  validateProduct,
  categoryFormToPayload,
} from './productUtils';
import { readXlsxRows } from './xlsxReader';
import { buildXlsx, crc32 } from './xlsxWriter';

if (typeof global.DecompressionStream === 'undefined') global.DecompressionStream = DecompressionStream;

const categories = [{ id: 1, name: 'Starters', tax_rate: '5.00' }, { id: 2, name: 'Hot Beverages', tax_rate: '12.00' }];
const products = [
  { id: 10, name: 'Paneer Tikka', category: 1, price: '280.00', is_available: true, is_vegetarian: true, allergens: ['dairy'], updated_at: '2026-10-10T10:00:00Z' },
  { id: 11, name: 'Chicken Wings', category: 1, price: '320.00', is_available: false, is_spicy: true, allergens: '["celery"]', updated_at: '2026-10-12T10:00:00Z' },
  { id: 12, name: 'Masala Chai', category: 2, price: '60.00', is_available: true, is_vegetarian: true, is_vegan: false, updated_at: '2026-10-11T10:00:00Z' },
];
const catName = (id) => categories.find((c) => c.id === id)?.name || '';

describe('product form', () => {
  test('round trip and payload types', () => {
    const form = productToForm(products[0]);
    expect(form).toMatchObject({ name: 'Paneer Tikka', category: '1', price: '280.00', allergens: ['dairy'], is_available: true });
    const payload = formToPayload({ ...form, calories: '450', preparation_time_minutes: '', sort_order: '3' });
    expect(payload).toMatchObject({ name: 'Paneer Tikka', category: 1, price: '280.00', calories: 450, sort_order: 3, allergens: ['dairy'] });
    expect(payload).not.toHaveProperty('preparation_time_minutes');
    expect(formToPayload({ ...form, price: '99' }, 0).price).toBe('99');
  });

  test('validation', () => {
    const base = productToForm({ name: 'New', category: 1, price: '10' });
    expect(validateProduct(base, { products })).toEqual({});
    expect(validateProduct({ ...base, name: ' ' })).toHaveProperty('name');
    expect(validateProduct({ ...base, category: '' })).toHaveProperty('category');
    expect(validateProduct({ ...base, price: '10.555' }, { decimals: 2 }).price).toMatch(/2 decimal/);
    expect(validateProduct({ ...base, price: '10.5' }, { decimals: 0 }).price).toMatch(/whole number/);
    expect(validateProduct({ ...base, price: '-1' })).toHaveProperty('price');
    expect(validateProduct({ ...base, calories: 'abc' })).toHaveProperty('calories');
    expect(validateProduct({ ...base, is_vegan: true, is_vegetarian: false })).toHaveProperty('is_vegetarian');
    expect(validateProduct({ ...base, name: 'paneer tikka' }, { products }).name).toMatch(/already exists/);
    expect(validateProduct({ ...base, name: 'Paneer Tikka' }, { products, editingId: 10 })).toEqual({});
  });

  test('duplicate gets a free name', () => {
    expect(duplicateForm(products[0], products).name).toBe('Paneer Tikka (copy)');
    expect(duplicateForm(products[0], [...products, { id: 20, name: 'Paneer Tikka (copy)', category: 1 }]).name).toBe('Paneer Tikka (copy 2)');
  });

  test('allergens from list, JSON or text', () => {
    expect(normalizeAllergens(['Nuts', 'dairy', 'nuts'])).toEqual(['nuts', 'dairy']);
    expect(normalizeAllergens('["Eggs"]')).toEqual(['eggs']);
    expect(normalizeAllergens('nuts; Soy , gluten')).toEqual(['nuts', 'soy', 'gluten']);
    expect(normalizeAllergens(null)).toEqual([]);
  });
});

describe('listing', () => {
  test('filters', () => {
    expect(filterProducts(products, { category: '1' }).map((p) => p.id)).toEqual([10, 11]);
    expect(filterProducts(products, { status: 'unavailable' }).map((p) => p.id)).toEqual([11]);
    expect(filterProducts(products, { dietary: 'is_vegetarian' }).map((p) => p.id)).toEqual([10, 12]);
    expect(filterProducts(products, { search: 'chai' }).map((p) => p.id)).toEqual([12]);
  });
  test('sorting', () => {
    expect(sortProducts(products, { key: 'price', dir: 'desc' }).map((p) => p.id)).toEqual([11, 10, 12]);
    expect(sortProducts(products, { key: 'updated', dir: 'desc' }).map((p) => p.id)).toEqual([11, 12, 10]);
    expect(sortProducts(products, { key: 'category' }, catName).map((p) => p.id)).toEqual([12, 10, 11]);
  });
});

describe('categories', () => {
  test('validation and payload', () => {
    expect(validateCategory({ name: 'starters', tax_rate: '', sort_order: '' }, { categories })).toHaveProperty('name');
    expect(validateCategory({ name: 'Desserts', tax_rate: '120', sort_order: '' })).toHaveProperty('tax_rate');
    expect(validateCategory({ name: 'Desserts', tax_rate: '5.5', sort_order: '2' })).toEqual({});
    expect(categoryFormToPayload({ name: ' Desserts ', description: '', tax_rate: '5.5', sort_order: '2', is_available: true, menu: '4' }))
      .toEqual({ name: 'Desserts', description: '', is_available: true, tax_rate: '5.50', sort_order: 2, menu: 4 });
    expect(categoryFormToPayload({ name: 'X', description: '', tax_rate: '', sort_order: '', is_available: false, menu: '' }).tax_rate).toBe('0.00');
  });
});

describe('CSV', () => {
  test('quotes, commas, line breaks and BOM', () => {
    const csv = toCsv([['Name', 'Notes'], ['Fish, chips', 'Say "hi"\nnext line'], ['=SUM(A1)', '-5']]);
    expect(csv.startsWith('﻿')).toBe(true);
    const rows = parseCsv(csv);
    expect(rows).toEqual([['Name', 'Notes'], ['Fish, chips', 'Say "hi"\nnext line'], ["'=SUM(A1)", '-5']]);
  });
  test('amounts with symbols, thousands separators and decimal commas', () => {
    expect(normalizeAmount('₹1,200.50')).toBe('1200.50');
    expect(normalizeAmount('2,50')).toBe('2.50');
    expect(normalizeAmount('USD 15')).toBe('15');
    expect(normalizeAmount('abc')).toBe('');
  });

  test('semicolon files from European Excel', () => {
    expect(parseCsv('Name;Price\r\nCafé;2,50\r\n')).toEqual([['Name', 'Price'], ['Café', '2,50']]);
  });
});

describe('import planning', () => {
  const header = ['ID', 'Name', 'Category', 'Price', 'Available', 'Vegetarian', 'Allergens'];

  test('create, update, unchanged and errors', () => {
    const rows = [
      header,
      ['', 'Veg Spring Roll', 'Starters', '180', 'yes', 'yes', 'gluten; soy'],
      ['10', 'Paneer Tikka', 'Starters', '300', 'yes', 'yes', 'dairy'],
      ['', 'Masala Chai', 'Hot Beverages', '60', 'yes', 'yes', ''],
      ['', 'Mojito', 'Mocktails', '150', 'yes', 'no', ''],
      ['', '', 'Starters', 'abc', 'maybe', '', ''],
      ['99', 'Ghost', 'Starters', '10', '', '', ''],
    ];
    const { entries, newCategories } = planImport(rows, { products, categories });
    expect(entries.map((e) => e.action)).toEqual(['create', 'update', 'unchanged', 'error', 'error', 'error']);
    expect(entries[0].payload).toMatchObject({ name: 'Veg Spring Roll', category: 1, price: '180.00', is_vegetarian: true, allergens: ['gluten', 'soy'] });
    expect(entries[1].existingId).toBe(10);
    expect(entries[3].errors[0]).toMatch(/Mocktails/);
    expect(entries[4].errors.join(' ')).toMatch(/Name is empty.*Price "abc".*Available/);
    expect(entries[5].errors[0]).toMatch(/No product with ID 99/);
    expect(newCategories).toEqual([]);
  });

  test('new categories when allowed; duplicate rows; missing columns', () => {
    const { entries, newCategories } = planImport([header, ['', 'Mojito', 'Mocktails', '150', '', '', ''], ['', 'mojito', 'mocktails', '160', '', '', '']], { products, categories, createCategories: true });
    expect(newCategories).toEqual(['Mocktails']);
    expect(entries.map((e) => e.action)).toEqual(['create', 'error']);
    expect(planImport([['Name', 'Price']], {}).headerErrors).toEqual(['Missing column: Category']);
  });

  test('own codes in the ID column are ignored with a warning; "No" allergens mean none', () => {
    const { entries } = planImport([
      ['ID', 'Name', 'Category', 'Price', 'Allergens'],
      ['W1', 'Water Bislery', 'Hot Beverages', '20', 'No'],
      ['W2', 'Water Himalaya', 'hot beverages', '50', 'none'],
    ], { products, categories });
    expect(entries.map((e) => e.action)).toEqual(['create', 'create']);
    expect(entries[0].warnings[0]).toMatch(/W1.*ignored/);
    expect(entries[0].payload.allergens).toEqual([]);
    expect(entries[1].payload.category).toBe(2);
  });

  test('a sales report file gets a clear message', () => {
    expect(planImport([['Item', 'Category', 'Qty', 'Bills', 'Amount', 'Avg price', 'Share'], ['Roll', 'Rolls', '2', '1', '200', '100', '5']], {}).headerErrors[0]).toMatch(/sales report/);
    expect(planImport([['Report', 'Item-wise sales'], ['Restaurant', 'Crave Cafe']], {}).headerErrors[0]).toMatch(/sales report/);
  });

  test('export rows re-import as unchanged', () => {
    const rows = parseCsv(toCsv(productsToRows(products, catName)));
    const { entries } = planImport(rows, { products, categories });
    expect(entries.map((e) => e.action)).toEqual(['unchanged', 'unchanged', 'unchanged']);
  });
});

describe('Excel reader', () => {
  test('reads a workbook written by our writer (stored)', async () => {
    const bytes = buildXlsx([{ name: 'Products', rows: [['Name', 'Price'], ['Café latte', 180.5], ['A & B <x>', null, 'gap']] }]);
    const rows = await readXlsxRows(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(rows).toEqual([['Name', 'Price'], ['Café latte', '180.5'], ['A & B <x>', '', 'gap']]);
  });

  test('reads compressed workbooks with shared strings, like files saved by Excel', async () => {
    const enc = new TextEncoder();
    const files = {
      '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
      'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Menu" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Price</t></si><si><r><t>Masala </t></r><r><t>Chai</t></r></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>60</v></c></row></sheetData></worksheet>',
    };
    const parts = [];
    const central = [];
    let offset = 0;
    Object.entries(files).forEach(([name, text]) => {
      const raw = enc.encode(text);
      const data = zlib.deflateRawSync(raw);
      const nameBytes = enc.encode(name);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
      local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
      parts.push(local, Buffer.from(nameBytes), data);
      const entry = Buffer.alloc(46);
      entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10);
      entry.writeUInt32LE(crc32(raw), 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24);
      entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
      central.push(entry, Buffer.from(nameBytes));
      offset += 30 + nameBytes.length + data.length;
    });
    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
    const zip = Buffer.concat([...parts, centralBuf, end]);
    const rows = await readXlsxRows(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
    expect(rows).toEqual([['Name', 'Price'], ['Masala Chai', '', '60']]);
  });

  test('rejects files that are not xlsx', async () => {
    await expect(readXlsxRows(new TextEncoder().encode('name,price').buffer)).rejects.toThrow(/not an Excel/);
  });
});
