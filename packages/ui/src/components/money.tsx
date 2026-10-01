import { formatMoney, isCurrencyCode } from '@bambino/utils';
import { cn } from './cn';

export interface MoneyValue {
  /** Integer minor units, exactly as the API returns them. */
  amount: number;
  currency: string;
}

export interface MoneyTextProps {
  value: MoneyValue;
  locale?: string;
  className?: string;
}

/**
 * Displays an amount from the API. Formatting only: no arithmetic happens in the UI, because totals are
 * always computed by the server.
 */
export function MoneyText({ value, locale = 'en-RW', className }: MoneyTextProps) {
  const { amount, currency } = value;
  // An unknown currency is shown raw rather than guessed at: a wrong decimal point would misstate the price.
  const text = isCurrencyCode(currency) ? formatMoney({ amount, currency }, locale) : `${currency} ${amount}`;
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}
