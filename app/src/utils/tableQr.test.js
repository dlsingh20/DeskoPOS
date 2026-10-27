import {
  buildTableOrderingUrl,
  getTableQrCode,
  isQrOrder,
  pendingQrItems,
  planBulkTables,
  renderQrCardsHtml as toCardsHtml,
  tableCardLabel,
} from './tableQr';

const base = 'https://guest.example.com';

describe('ordering link', () => {
  test('uses the server ordering URL when it is a link (not an image)', () => {
    expect(buildTableOrderingUrl({ id: 5, qr_code_url: 'https://guest.example.com/t/abc123' }, { restaurantId: 3, baseUrl: base }))
      .toBe('https://guest.example.com/t/abc123');
  });

  test('builds the guest app link with the table secret code', () => {
    const url = buildTableOrderingUrl({ id: 5, qr_code: 'k7Fq9x', qr_code_url: 'https://cdn.example.com/qr/5.png' }, { restaurantId: 3, hotelId: '7', baseUrl: base });
    expect(url).toBe('https://guest.example.com/ordering/table?hotel=7&restaurant=3&table=5&code=k7Fq9x&source=qr');
  });

  test('image paths in qr_code are not treated as codes', () => {
    expect(getTableQrCode({ qr_code: 'qr_codes/table_5.png' })).toBe('');
    expect(getTableQrCode({ qr_code: 'https://x/y' })).toBe('');
    expect(buildTableOrderingUrl({ id: 5, qr_code: 'qr_codes/table_5.png' }, { restaurantId: 3, baseUrl: base })).not.toContain('code=');
  });

  test('labels', () => {
    expect(tableCardLabel({ table_number: '5' })).toBe('Table 5');
    expect(tableCardLabel({ table_number: 'P-2' })).toBe('P-2');
    expect(tableCardLabel({ id: 9, name: 'Window' })).toBe('Window');
  });
});

describe('printable cards', () => {
  const cards = Array.from({ length: 7 }, (_, i) => ({ label: `Table ${i + 1}`, qrDataUrl: 'data:image/png;base64,AAA', url: 'x' }));
  test('pages per format and escaping', () => {
    const html = toCardsHtml(cards, { format: 'grid', restaurantName: 'Spice <Garden>' });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).toContain('size: A4');
    expect(html).toContain('Spice &lt;Garden&gt;');
    expect(toCardsHtml(cards, { format: 'tent' }).match(/class="sheet"/g)).toHaveLength(7);
    expect(toCardsHtml(cards, { format: 'sticker' }).match(/class="sheet"/g)).toHaveLength(1);
  });
});

describe('bulk tables', () => {
  test('range with prefix, skipping existing numbers', () => {
    expect(planBulkTables({ prefix: 'P-', from: '1', to: '4' }, [{ table_number: 'p-2' }])).toEqual({ numbers: ['P-1', 'P-3', 'P-4'], skipped: ['P-2'], error: null });
    expect(planBulkTables({ from: '5', to: '2' }).error).toMatch(/valid range/);
    expect(planBulkTables({ from: '1', to: '500' }).error).toMatch(/200/);
  });
});

describe('QR orders at the POS', () => {
  const order = (o) => ({ id: 1, status: 'pending', items: [], ...o });
  test('detects QR orders and unsent QR items', () => {
    const qrOrder = order({ source: 'qr', items: [{ id: 1, quantity: 2 }, { id: 2, status: 'cancelled' }] });
    expect(isQrOrder(qrOrder)).toBe(true);
    expect(pendingQrItems(qrOrder).map((i) => i.id)).toEqual([1]);
  });

  test('waiter order with QR items added later: only the QR items, not yet sent or handled', () => {
    const mixed = order({
      source: 'pos',
      items: [
        { id: 10, source: 'pos' },
        { id: 11, source: 'qr' },
        { id: 12, source: 'qr', kot_sent_at: '2026-10-13T10:00:00Z' },
        { id: 13, source: 'qr' },
      ],
    });
    expect(pendingQrItems(mixed, new Set(['13'])).map((i) => i.id)).toEqual([11]);
  });

  test('orders without any source are not QR orders', () => {
    expect(pendingQrItems(order({ items: [{ id: 1 }] }))).toEqual([]);
  });
});
