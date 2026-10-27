/**
 * Minimal .xlsx reader (no dependencies): returns the first worksheet as rows of text.
 *
 * Reads the ZIP central directory, inflates entries with the platform's DecompressionStream
 * ('deflate-raw'), then resolves shared strings, inline strings, numbers and booleans.
 * Formulas return their cached value. Dates come back as Excel serial numbers.
 */

const decoder = new TextDecoder();

const inflateRaw = async (bytes) => {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read Excel files. Save the sheet as CSV and import that instead.');
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
  return out;
};

/** ZIP entries by name -> () => Promise<Uint8Array> */
const readZip = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file.');
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('The Excel file is damaged.');
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    entries.set(name, async () => {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('The Excel file uses an unsupported compression.');
    });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const xmlText = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

/** Joins all <t> runs inside a string item (handles rich text) */
const textOf = (xml) => {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out += m[1] ? xmlText(m[1]) : '';
  return out;
};

const columnIndex = (ref) => {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] || 'A';
  return letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
};

/**
 * @param {ArrayBuffer} buffer - .xlsx file contents
 * @returns {Promise<string[][]>} rows of the first worksheet
 */
export const readXlsxRows = async (buffer) => {
  const zip = readZip(buffer);
  const read = async (name) => (zip.has(name) ? decoder.decode(await zip.get(name)()) : null);

  // First sheet in workbook order
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const firstSheet = workbook && /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook);
  if (firstSheet && rels) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${firstSheet[1]}"[^>]*Target="([^"]+)"`).exec(rels)
      || new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheet[1]}"`).exec(rels);
    if (rel) sheetPath = rel[1].startsWith('/') ? rel[1].slice(1) : `xl/${rel[1].replace(/^\.\//, '')}`;
  }
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('The Excel file has no worksheet.');

  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = [];
  if (sharedXml) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(sharedXml)) !== null) shared.push(textOf(m[1]));
  }

  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(sheet)) !== null) {
    const cells = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cellRe.exec(rowMatch[1] || '')) !== null) {
      const attrs = c[1];
      const body = c[2] || '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) value = xmlText(v);
      const index = ref ? columnIndex(ref) : cells.length;
      while (cells.length < index) cells.push('');
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
};
