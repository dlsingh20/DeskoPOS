/**
 * Print settings (bill / KOT format, bill header, tax labels, options).
 *
 * Saved per device and per restaurant in localStorage: each terminal has its
 * own printer, and each restaurant has its own name, tax registration and footer.
 * Tax labels start from a country profile (utils/taxProfiles) and stay editable.
 *
 * DeskoPOS: the restaurant's settings live on the server and are shared by every device
 * (GET/PUT restaurants/{id}/print-settings/); the local copy keeps reads synchronous.
 * QR ordering options stay per device.
 */
import ApiClient from './ApiClient';
import { IS_DESKOPOS } from './backend';
import { getTaxProfile, profileKeyForCountry, taxSettingsFromProfile } from '../utils/taxProfiles';

const STORAGE_PREFIX = 'pos_print_settings_v1';
const LAST_RESTAURANT_KEY = 'pos_print_settings_last_restaurant';

export const BILL_FORMATS = [
  { key: 'thermal80', label: 'Thermal 80 mm (3")', description: 'Most counter receipt printers. Item, Qty, Rate and Amount columns.' },
  { key: 'thermal58', label: 'Thermal 58 mm (2")', description: 'Small and Bluetooth printers. Compact two-line items.' },
  { key: 'sheet', label: 'A4 / Letter invoice', description: 'Laser or inkjet printers. Full invoice with item table.' },
];

export const KOT_FORMATS = [
  { key: 'thermal80', label: 'Thermal 80 mm (3")', description: 'Large table number and item names.' },
  { key: 'thermal58', label: 'Thermal 58 mm (2")', description: 'Same content in a narrower layout.' },
  { key: 'sheet', label: 'Half sheet (A5 / Half Letter)', description: 'For kitchens with a normal printer. Big, easy-to-read text.' },
];

export const SHEET_SIZES = [
  { key: 'A4', label: 'A4 (210 × 297 mm)', kotLabel: 'A5' },
  { key: 'Letter', label: 'US Letter (8.5 × 11 in)', kotLabel: 'Half Letter' },
];

const FORMAT_KEYS = ['thermal80', 'thermal58', 'sheet'];

/**
 * Defaults for a country (ISO code or name from hotel settings).
 * Used the first time a restaurant's print settings are opened.
 */
export const defaultPrintSettings = (country) => {
  const profileKey = profileKeyForCountry(country);
  const profile = getTaxProfile(profileKey);
  return {
    billFormat: 'thermal80',
    kotFormat: 'thermal80',
    sheetSize: profile.sheetSize,
    header: {
      name: '',
      address: '',
      phone: '',
      taxIdLabel: profile.taxIdLabel,
      taxId: '',
      licenceLabel: profile.licenceLabel,
      licence: '',
      footer: 'Thank you! Visit again.',
    },
    tax: taxSettingsFromProfile(profileKey),
    kotCopies: 1,
    autoPrintBill: false,
    // Orders guests place by scanning a table QR code
    qrOrders: { mode: 'auto', handleOnThisDevice: false, sound: true },
  };
};

export const DEFAULT_PRINT_SETTINGS = defaultPrintSettings();

const str = (value, fallback) => (typeof value === 'string' ? value : fallback);

const safeGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Fills gaps and drops invalid values, so older or hand-edited data is safe to use.
 * Settings saved before tax profiles existed (gstin / fssai / splitTax) are migrated as India.
 */
export const normalizePrintSettings = (raw = {}, country) => {
  const s = raw && typeof raw === 'object' ? raw : {};
  const legacy = s.header && ('gstin' in s.header || 'fssai' in s.header) && !s.tax;
  const base = defaultPrintSettings(legacy ? 'IN' : (s.tax?.profile || country));

  const header = { ...base.header };
  Object.keys(header).forEach((key) => { header[key] = str(s.header?.[key], header[key]); });
  if (legacy) {
    header.taxId = str(s.header.gstin, '');
    header.licence = str(s.header.fssai, '');
  }

  const tax = { ...base.tax };
  if (s.tax && typeof s.tax === 'object') {
    tax.profile = getTaxProfile(s.tax.profile).key;
    ['invoiceTitle', 'receiptTitle', 'singleLabel'].forEach((key) => { tax[key] = str(s.tax[key], tax[key]); });
    tax.mode = s.tax.mode === 'split' ? 'split' : 'single';
    if (Array.isArray(s.tax.components)) {
      tax.components = s.tax.components.slice(0, 4).map((c) => ({ label: str(c?.label, ''), share: Number(c?.share) || 0 }));
    }
  } else if (legacy && typeof s.splitTax === 'boolean') {
    tax.mode = s.splitTax ? 'split' : 'single';
  }

  const copies = parseInt(s.kotCopies, 10);
  return {
    billFormat: FORMAT_KEYS.includes(s.billFormat) ? s.billFormat : base.billFormat,
    kotFormat: FORMAT_KEYS.includes(s.kotFormat) ? s.kotFormat : base.kotFormat,
    sheetSize: ['A4', 'Letter'].includes(s.sheetSize) ? s.sheetSize : base.sheetSize,
    header,
    tax,
    kotCopies: Number.isFinite(copies) ? Math.min(3, Math.max(1, copies)) : base.kotCopies,
    autoPrintBill: typeof s.autoPrintBill === 'boolean' ? s.autoPrintBill : base.autoPrintBill,
    qrOrders: {
      mode: s.qrOrders?.mode === 'accept' ? 'accept' : 'auto',
      handleOnThisDevice: s.qrOrders?.handleOnThisDevice === true,
      sound: s.qrOrders?.sound !== false,
    },
  };
};

/** Food / trade licence: letters, digits and separators */
export const validateLicence = (value) => (!value || /^[A-Za-z0-9][A-Za-z0-9 ./-]{2,29}$/.test(value.trim())
  ? null
  : 'Use 3 to 30 letters, digits, spaces, dots, dashes or slashes.');

/** App settings → the server's print-settings body */
export const toServerPrintSettings = (s) => ({
  bill_format: s.billFormat,
  kot_format: s.kotFormat,
  sheet_size: s.sheetSize,
  header: {
    name: s.header.name,
    address: s.header.address,
    phone: s.header.phone,
    tax_id_label: s.header.taxIdLabel,
    tax_id: s.header.taxId,
    licence_label: s.header.licenceLabel,
    licence: s.header.licence,
    footer: s.header.footer,
  },
  tax: {
    profile: s.tax.profile,
    invoice_title: s.tax.invoiceTitle,
    receipt_title: s.tax.receiptTitle,
    mode: s.tax.mode,
    single_label: s.tax.singleLabel,
    components: s.tax.components,
  },
  kot_copies: s.kotCopies,
  auto_print_bill: s.autoPrintBill,
});

/** The server's print settings → app settings, keeping this device's QR ordering options */
export const fromServerPrintSettings = (d, local) => normalizePrintSettings({
  billFormat: d.bill_format,
  kotFormat: d.kot_format,
  sheetSize: d.sheet_size,
  header: {
    name: d.header?.name,
    address: d.header?.address,
    phone: d.header?.phone,
    taxIdLabel: d.header?.tax_id_label,
    taxId: d.header?.tax_id,
    licenceLabel: d.header?.licence_label,
    licence: d.header?.licence,
    footer: d.header?.footer,
  },
  tax: d.tax ? {
    profile: d.tax.profile,
    invoiceTitle: d.tax.invoice_title,
    receiptTitle: d.tax.receipt_title,
    mode: d.tax.mode,
    singleLabel: d.tax.single_label,
    components: d.tax.components,
  } : local.tax,
  kotCopies: d.kot_copies,
  autoPrintBill: d.auto_print_bill,
  qrOrders: local.qrOrders,
});

class PrintSettingsService {
  constructor() {
    this.listeners = new Set();
  }

  /**
   * @param {number|string} [restaurantId] - falls back to the restaurant last used on this device
   * @param {string} [country] - hotel country, used for defaults when nothing is saved yet
   */
  get(restaurantId, country) {
    const id = restaurantId ?? safeGet(LAST_RESTAURANT_KEY);
    const stored = safeGet(storageKey(id));
    try {
      return { ...normalizePrintSettings(stored ? JSON.parse(stored) : {}, country), saved: !!stored };
    } catch (error) {
      return { ...normalizePrintSettings({}, country), saved: false };
    }
  }

  /** @returns {boolean} false if the browser refused to store it */
  save(restaurantId, settings) {
    const normalized = normalizePrintSettings(settings);
    const ok = safeSet(storageKey(restaurantId), JSON.stringify(normalized));
    if (ok) this.setActiveRestaurant(restaurantId);
    this.listeners.forEach((listener) => listener(restaurantId, normalized));
    return ok;
  }

  /** Remembers which restaurant this device prints for (used when a print job has no restaurant id) */
  setActiveRestaurant(restaurantId) {
    if (restaurantId !== undefined && restaurantId !== null) safeSet(LAST_RESTAURANT_KEY, String(restaurantId));
  }

  /**
   * DeskoPOS: copy the restaurant's shared settings from the server into this device.
   * Does nothing on other backends or while the restaurant has none saved yet.
   * @returns {Promise<boolean>} true when the local copy was updated
   */
  async loadShared(restaurantId) {
    if (!IS_DESKOPOS || restaurantId === undefined || restaurantId === null) return false;
    const response = await ApiClient.get(`/api/pos/api/restaurants/${restaurantId}/print-settings/`);
    if (!response.data?.saved) return false;
    const next = fromServerPrintSettings(response.data, this.get(restaurantId));
    if (!safeSet(storageKey(restaurantId), JSON.stringify(next))) return false;
    this.listeners.forEach((listener) => listener(restaurantId, next));
    return true;
  }

  /** DeskoPOS: save the restaurant's settings for every device (needs settings.manage) */
  async saveShared(restaurantId, settings) {
    if (!IS_DESKOPOS) return;
    await ApiClient.put(`/api/pos/api/restaurants/${restaurantId}/print-settings/`,
      toServerPrintSettings(normalizePrintSettings(settings)));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function storageKey(restaurantId) {
  return `${STORAGE_PREFIX}:${restaurantId ?? 'default'}`;
}

const printSettingsService = new PrintSettingsService();
export default printSettingsService;
