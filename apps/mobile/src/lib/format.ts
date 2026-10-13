import type { Money } from '@bambino/api-client';
import { formatMoney, isCurrencyCode, money } from '@bambino/utils';
import { LOCALE } from '@/config';

export function price(value: Money): string {
  // A currency the app does not know, or a runtime without Intl support, still shows the plain figure.
  if (!isCurrencyCode(value.currency)) return `${value.currency} ${value.amount}`;
  try {
    return formatMoney(money(value.amount, value.currency), LOCALE);
  } catch {
    return `${value.currency} ${value.amount}`;
  }
}

export function when(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  CONFIRMED: 'Confirmed, pay on delivery',
  PAID: 'Paid',
  PROCESSING: 'Being prepared',
  PACKED: 'Packed',
  READY_FOR_DISPATCH: 'Ready to ship',
  OUT_FOR_DELIVERY: 'On its way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
};

export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
