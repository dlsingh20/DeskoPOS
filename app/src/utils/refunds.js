/** Refunds of settled bills (DeskoPOS) */
import { money } from './historyUtils';

export const REFUND_REASONS = [
  { key: 'food_quality', label: 'Food quality' },
  { key: 'wrong_order', label: 'Wrong order' },
  { key: 'service', label: 'Service' },
  { key: 'overcharged', label: 'Overcharged' },
  { key: 'duplicate_payment', label: 'Duplicate payment' },
  { key: 'other', label: 'Other' },
];

// Credit Pay and Guest Visit are not paid back here: the credit is written off, the room folio is the hotel's
const NOT_REFUNDABLE = ['pay_later', 'room_charge'];

export const round2 = (n) => Math.round(n * 100) / 100;

/** Payments on a bill that still have money to give back, with what is left on each */
export const refundablePayments = (payments = []) => payments
  .filter((p) => ['completed', 'partially_refunded'].includes(p.status) && !NOT_REFUNDABLE.includes(p.method))
  .map((p) => ({ payment: p, left: round2(money(p.amount) - money(p.refunded_amount)) }))
  .filter((p) => p.left > 0.004);
