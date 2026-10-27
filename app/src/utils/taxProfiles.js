/**
 * Country tax profiles for printed bills.
 *
 * These are starting points that fill in the print settings the first time
 * (from the hotel's country). Every field stays editable, and the full
 * tax design will replace this later. They control only how tax is
 * labelled on paper; the tax amount always comes from the server.
 *
 * mode "single": one tax line (e.g. "VAT").
 * mode "split":  the tax amount is shown as components by share (e.g. CGST 50% + SGST 50%).
 */

export const TAX_PROFILES = [
  {
    key: 'IN', label: 'India (GST)', taxIdLabel: 'GSTIN', licenceLabel: 'FSSAI Lic. No',
    invoiceTitle: 'TAX INVOICE', receiptTitle: 'BILL', mode: 'split', singleLabel: 'GST',
    components: [{ label: 'CGST', share: 50 }, { label: 'SGST', share: 50 }], sheetSize: 'A4',
  },
  { key: 'AE', label: 'United Arab Emirates (VAT)', taxIdLabel: 'TRN', licenceLabel: 'Trade Licence', invoiceTitle: 'TAX INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'VAT', sheetSize: 'A4' },
  { key: 'SA', label: 'Saudi Arabia (VAT)', taxIdLabel: 'VAT No.', licenceLabel: 'CR No.', invoiceTitle: 'SIMPLIFIED TAX INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'VAT', sheetSize: 'A4' },
  { key: 'GB', label: 'United Kingdom (VAT)', taxIdLabel: 'VAT Reg No.', licenceLabel: 'Licence', invoiceTitle: 'VAT RECEIPT', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'VAT', sheetSize: 'A4' },
  { key: 'EU', label: 'European Union (VAT)', taxIdLabel: 'VAT No.', licenceLabel: 'Licence', invoiceTitle: 'INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'VAT', sheetSize: 'A4' },
  { key: 'AU', label: 'Australia (GST)', taxIdLabel: 'ABN', licenceLabel: 'Licence', invoiceTitle: 'TAX INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'GST', sheetSize: 'A4' },
  { key: 'NZ', label: 'New Zealand (GST)', taxIdLabel: 'GST No.', licenceLabel: 'Licence', invoiceTitle: 'TAX INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'GST', sheetSize: 'A4' },
  { key: 'SG', label: 'Singapore (GST)', taxIdLabel: 'GST Reg No.', licenceLabel: 'Licence', invoiceTitle: 'TAX INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'GST', sheetSize: 'A4' },
  { key: 'MY', label: 'Malaysia (SST)', taxIdLabel: 'SST No.', licenceLabel: 'Licence', invoiceTitle: 'INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'SST', sheetSize: 'A4' },
  { key: 'CA', label: 'Canada (GST/HST)', taxIdLabel: 'GST/HST No.', licenceLabel: 'Licence', invoiceTitle: 'RECEIPT', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'Tax', sheetSize: 'Letter' },
  { key: 'US', label: 'United States (Sales tax)', taxIdLabel: 'Tax ID', licenceLabel: 'Licence', invoiceTitle: 'RECEIPT', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'Sales Tax', sheetSize: 'Letter' },
  { key: 'OTHER', label: 'Other / custom', taxIdLabel: 'Tax ID', licenceLabel: 'Licence', invoiceTitle: 'INVOICE', receiptTitle: 'RECEIPT', mode: 'single', singleLabel: 'Tax', sheetSize: 'A4' },
];

const EU_CODES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

const COUNTRY_NAMES = {
  india: 'IN',
  'united arab emirates': 'AE', uae: 'AE',
  'saudi arabia': 'SA', ksa: 'SA',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB',
  australia: 'AU',
  'new zealand': 'NZ',
  singapore: 'SG',
  malaysia: 'MY',
  canada: 'CA',
  'united states': 'US', 'united states of america': 'US', usa: 'US', us: 'US',
  austria: 'AT', belgium: 'BE', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY', 'czech republic': 'CZ', czechia: 'CZ',
  denmark: 'DK', estonia: 'EE', finland: 'FI', france: 'FR', germany: 'DE', greece: 'GR', hungary: 'HU', ireland: 'IE',
  italy: 'IT', latvia: 'LV', lithuania: 'LT', luxembourg: 'LU', malta: 'MT', netherlands: 'NL', poland: 'PL',
  portugal: 'PT', romania: 'RO', slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE',
};

export const getTaxProfile = (key) => TAX_PROFILES.find((p) => p.key === key) || TAX_PROFILES.find((p) => p.key === 'OTHER');

/** Profile key for a country name or ISO code from hotel settings; "OTHER" when unknown */
export const profileKeyForCountry = (country) => {
  const raw = String(country || '').trim();
  if (!raw) return 'OTHER';
  const upper = raw.toUpperCase();
  const code = upper.length === 2 ? upper : (COUNTRY_NAMES[raw.toLowerCase()] || '');
  if (EU_CODES.includes(code)) return 'EU';
  return TAX_PROFILES.some((p) => p.key === code) ? code : 'OTHER';
};

/** Print-settings tax block for a profile */
export const taxSettingsFromProfile = (key) => {
  const p = getTaxProfile(key);
  return {
    profile: p.key,
    invoiceTitle: p.invoiceTitle,
    receiptTitle: p.receiptTitle,
    mode: p.mode,
    singleLabel: p.singleLabel,
    components: (p.components || [{ label: `${p.singleLabel} 1`, share: 50 }, { label: `${p.singleLabel} 2`, share: 50 }]).map((c) => ({ ...c })),
  };
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Tax lines for the bill. Split components always add back exactly to the
 * tax amount: the last component takes the rounding remainder.
 */
export const buildTaxLines = (taxAmount, tax) => {
  const amount = round2(Number(taxAmount) || 0);
  if (amount <= 0) return [];
  const components = (tax?.components || []).filter((c) => c.label && Number(c.share) > 0);
  if (tax?.mode !== 'split' || components.length < 2) {
    return [{ label: tax?.singleLabel || 'Tax', amount }];
  }
  let allocated = 0;
  return components.map((c, i) => {
    const part = i === components.length - 1 ? round2(amount - allocated) : round2((amount * Number(c.share)) / 100);
    allocated = round2(allocated + part);
    return { label: c.label, amount: part };
  });
};

/** Component shares must add up to 100 */
export const validateTaxComponents = (tax) => {
  if (tax?.mode !== 'split') return null;
  const components = tax.components || [];
  if (components.length < 2) return 'Add at least two tax components, or show tax as one line.';
  if (components.some((c) => !String(c.label || '').trim())) return 'Give every tax component a name.';
  const total = components.reduce((sum, c) => sum + (Number(c.share) || 0), 0);
  if (Math.abs(total - 100) > 0.001) return `Shares must add up to 100% (now ${round2(total)}%).`;
  return null;
};

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Light format check of the tax registration number.
 * India's GSTIN has a fixed format; elsewhere only the characters and length are checked.
 */
export const validateTaxId = (profile, value) => {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return null;
  if (profile === 'IN') return GSTIN.test(v) ? null : 'GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.';
  return /^[A-Z0-9][A-Z0-9 ./-]{2,29}$/.test(v) ? null : 'Use 3 to 30 letters, digits, spaces, dots, dashes or slashes.';
};
