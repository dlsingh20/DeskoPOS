import CurrencyService from '../services/CurrencyService';

const isValidTimeZone = (timeZone) => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
};

const isValidLocale = (locale) => {
  if (!locale) return false;
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
  } catch (error) {
    return false;
  }
};

/** Decimal places used for a currency (e.g. 2 for USD, 0 for JPY, 3 for KWD) */
export const currencyDecimals = (currency) => {
  const configured = CurrencyService.currencyConfig?.[currency]?.decimals;
  if (Number.isInteger(configured)) return configured;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch (error) {
    return 2;
  }
};

/**
 * Regional settings for printed bills, from the hotel settings:
 * time zone, number/date locale, currency code and its decimals, and country.
 * Anything missing falls back to the device's own settings.
 */
export const resolveRegionalFormat = (hotel, deviceLocale = (typeof navigator !== 'undefined' ? navigator.language : 'en')) => {
  const currency = String(hotel?.currency || '').toUpperCase();
  const candidates = [hotel?.locale, hotel?.language, CurrencyService.currencyConfig?.[currency]?.locale, deviceLocale, 'en'];
  return {
    timeZone: isValidTimeZone(hotel?.timezone) ? hotel.timezone : undefined,
    locale: candidates.find(isValidLocale),
    currency,
    decimals: currency ? currencyDecimals(currency) : 2,
    country: hotel?.country || '',
  };
};
