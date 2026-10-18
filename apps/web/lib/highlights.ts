import type { DeliveryOption, Money, PlanSummary } from '@bambino/api-client';
import { CASH_ON_DELIVERY_POLICY } from '@bambino/config';
import { formatMoney, isCurrencyCode, money } from '@bambino/utils';

/**
 * The three facts in the band under the home page hero. Each one is built from what the system really offers, and
 * says its condition, so the page never promises more than checkout will deliver:
 * - delivery comes from the delivery options in the database (fee and days), not from a fixed sentence;
 * - payment names mobile money only when an operator has switched it on (PAYMENT_METHODS), and always mentions the
 *   cash-on-delivery limit;
 * - the swap line comes from the plans' own swap allowance.
 */
export interface Highlight {
  id: 'delivery' | 'payment' | 'swap';
  title: string;
  body: string;
  /** The condition, in smaller type. */
  note: string;
}

export interface HighlightInput {
  /** Null when the delivery options could not be loaded. */
  delivery: DeliveryOption[] | null;
  plans: PlanSummary[] | null;
  /** Mobile-money names that are live, such as ["MTN MoMo", "Airtel Money"]. Empty until a provider is integrated. */
  paymentMethods: string[];
  /** The API's test wallets are on (preview only). */
  mockPayments: boolean;
}

export function plainPrice(value: Money): string {
  if (!isCurrencyCode(value.currency)) return `${value.currency} ${value.amount}`;
  try {
    return formatMoney(money(value.amount, value.currency), 'en-RW');
  } catch {
    return `${value.currency} ${value.amount}`;
  }
}

export function deliveryDays(option: Pick<DeliveryOption, 'estimatedDaysMin' | 'estimatedDaysMax'>): string {
  const { estimatedDaysMin: min, estimatedDaysMax: max } = option;
  if (max === 0) return 'same day';
  if (min === max) return max === 1 ? 'next day' : `${max} days`;
  return `${min} to ${max} days`;
}

/** "MTN MoMo,Airtel Money" from the environment, as a clean list. */
export function parsePaymentMethods(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** The plans FAQ answer to "How do I pay?", from what is really switched on. */
export function paymentAnswer(input: Pick<HighlightInput, 'paymentMethods' | 'mockPayments'>): string {
  const parts: string[] = [];
  if (input.paymentMethods.length > 0) {
    parts.push(
      `Plans are paid with mobile money (${input.paymentMethods.join(', ')}), approved on your phone.`,
    );
  } else if (!input.mockPayments) {
    parts.push('Plans are paid with mobile money, which is not switched on yet.');
  }
  if (CASH_ON_DELIVERY_POLICY.enabled) {
    parts.push(
      `Shop orders (not plans) up to ${plainPrice(money(CASH_ON_DELIVERY_POLICY.maxOrderAmount, 'RWF'))} can be paid in cash on delivery.`,
    );
  }
  if (input.mockPayments) parts.push('This preview uses test wallets.');
  return parts.join(' ');
}

export function buildHighlights(input: HighlightInput): Highlight[] {
  const options = (input.delivery ?? []).slice().sort((a, b) => a.fee.amount - b.fee.amount);
  const delivery: Highlight = {
    id: 'delivery',
    title: 'Delivered in Kigali',
    body:
      options.length > 0
        ? options.map((o) => `${o.name}: ${plainPrice(o.fee)}, ${deliveryDays(o)}`).join(' · ')
        : 'Delivery options and fees are shown at checkout.',
    note: 'Kigali only for now. The fee and day for your address are confirmed at checkout.',
  };

  const paymentParts: string[] = [];
  if (input.mockPayments) paymentParts.push('Test wallets (preview only)');
  if (input.paymentMethods.length > 0) paymentParts.push(input.paymentMethods.join(', '));
  if (CASH_ON_DELIVERY_POLICY.enabled) {
    paymentParts.push(
      `Cash on delivery up to ${plainPrice(money(CASH_ON_DELIVERY_POLICY.maxOrderAmount, 'RWF'))}`,
    );
  }
  const payment: Highlight = {
    id: 'payment',
    title: 'Pay your way',
    body: paymentParts.length > 0 ? paymentParts.join(' · ') : 'Payment options are shown at checkout.',
    note:
      input.paymentMethods.length > 0
        ? 'Mobile money is approved on your phone with your PIN.'
        : 'More payment options are coming.',
  };

  const allowances = (input.plans ?? []).map((plan) => plan.exchangesPerCycle);
  const known = allowances.filter((n): n is number => n !== null);
  let swapNote = 'The number of swaps depends on your plan.';
  if (allowances.length > 0 && known.length === allowances.length) {
    const lowest = Math.min(...known);
    const highest = Math.max(...known);
    const range = lowest === highest ? `${lowest}` : `${lowest} to ${highest}`;
    swapNote = `Each plan includes ${range} ${highest === 1 ? 'swap' : 'swaps'} per cycle.`;
  }
  const swap: Highlight = {
    id: 'swap',
    title: 'Swap as they grow',
    body: 'Move up a size when your baby does.',
    note: swapNote,
  };

  return [delivery, payment, swap];
}
