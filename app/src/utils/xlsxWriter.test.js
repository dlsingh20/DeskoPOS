/**
 * @jest-environment node
 */
import { buildXlsx, columnName, crc32 } from './xlsxWriter';

const decoder = new TextDecoder();

/** Reads the entries of a stored (uncompressed) ZIP */
const readZip = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = {};
  let pos = 0;
  while (view.getUint32(pos, true) === 0x04034b50) {
    const crc = view.getUint32(pos + 14, true);
    const size = view.getUint32(pos + 18, true);
    const nameLength = view.getUint16(pos + 26, true);
    const name = decoder.decode(bytes.slice(pos + 30, pos + 30 + nameLength));
    const data = bytes.slice(pos + 30 + nameLength, pos + 30 + nameLength + size);
    entries[name] = { data, crc };
    pos += 30 + nameLength + size;
  }
  return entries;
};

describe('xlsxWriter', () => {
  test('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  test('column names', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  test('builds a workbook with every sheet, escaped text and numeric cells', () => {
    const bytes = buildXlsx([
      { name: 'Bill Summary', rows: [{ cells: ['Bill No', 'Total'], style: 'header' }, ['A&B <1>', 3661.5], ['x', null]], moneyColumns: [1], freezeRow: 1 },
      { name: 'Bad/Name:[x]', rows: [['₹ rupee']] },
    ]);
    const zip = readZip(bytes);
    expect(Object.keys(zip)).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]);
    Object.values(zip).forEach(({ data, crc }) => expect(crc32(data)).toBe(crc));

    const sheet1 = decoder.decode(zip['xl/worksheets/sheet1.xml'].data);
    expect(sheet1).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Bill No</t></is></c>');
    expect(sheet1).toContain('A&amp;B &lt;1&gt;');
    expect(sheet1).toContain('<c r="B2" s="2"><v>3661.5</v></c>');
    expect(sheet1).toContain('state="frozen"');
    expect(sheet1).not.toContain('r="B3"');

    const workbook = decoder.decode(zip['xl/workbook.xml'].data);
    expect(workbook).toContain('name="Bill Summary"');
    expect(workbook).toContain('name="Bad Name  x "');
    expect(decoder.decode(zip['xl/worksheets/sheet2.xml'].data)).toContain('₹ rupee');
  });
});
