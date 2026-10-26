export const formatDate = (value) => (value
  ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

export const LOGIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BUSINESS_TYPES = [
  ['restaurant', 'Restaurant'], ['cafe', 'Cafe'], ['bar', 'Bar'], ['qsr', 'Quick service (QSR)'],
  ['bakery', 'Bakery'], ['food_court', 'Food court'], ['cloud_kitchen', 'Cloud kitchen'],
  ['hotel_fnb', 'Hotel F&B'], ['other', 'Other'],
];

export const FEATURES = [
  ['inventory', 'Inventory & recipes'],
  ['qr_ordering', 'QR table ordering'],
  ['aggregators', 'Swiggy / Zomato'],
  ['multi_outlet', 'Several outlets'],
];

/** Readable temporary password: 12 characters with upper, lower and digits, no look-alikes */
export function generatePassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (n) => all[n % all.length]);
  chars[0] = upper[random[0] % upper.length];
  chars[1] = lower[random[1] % lower.length];
  chars[2] = digits[random[2] % digits.length];
  return chars.join('');
}
