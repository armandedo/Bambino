/**
 * Money is always an integer count of the currency's minor unit plus an ISO 4217 code.
 * RWF has no minor unit, so RWF 10,500 is stored as 10500; KES 105.00 is stored as 10500.
 * No function here performs floating-point arithmetic on amounts.
 */

/** ISO 4217 minor-unit exponents for the currencies Bambino is configured for. */
export const CURRENCY_EXPONENTS = {
  RWF: 0,
  UGX: 0,
  BIF: 0,
  KES: 2,
  TZS: 2,
  USD: 2,
} as const;
export type CurrencyCode = keyof typeof CURRENCY_EXPONENTS;

export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

const BASIS_POINTS = 10_000n;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCY_EXPONENTS, value);
}

export function money(amount: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new MoneyError(`Amount must be a safe integer in minor units, received ${amount}`);
  }
  return { amount, currency };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce(add, zero(currency));
}

export function multiply(a: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity)) {
    throw new MoneyError(`Quantity must be an integer, received ${quantity}`);
  }
  return money(a.amount * quantity, a.currency);
}

/**
 * Takes a share of a non-negative amount expressed in basis points (1% = 100 bps),
 * rounding half up to the nearest minor unit. BigInt keeps the intermediate product exact.
 */
export function basisPointsOf(a: Money, basisPoints: number): Money {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError(`Basis points must be a non-negative integer, received ${basisPoints}`);
  }
  if (a.amount < 0) {
    throw new MoneyError('basisPointsOf requires a non-negative amount');
  }
  const rounded = (BigInt(a.amount) * BigInt(basisPoints) + BASIS_POINTS / 2n) / BASIS_POINTS;
  return money(Number(rounded), a.currency);
}

/** Never returns less than zero: used when discounts or credits could exceed a subtotal. */
export function subtractFloorZero(a: Money, b: Money): Money {
  const result = subtract(a, b);
  return result.amount < 0 ? zero(a.currency) : result;
}

export function min(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return a.amount <= b.amount ? a : b;
}

/** Display only. Converts through a decimal string so no float arithmetic touches the amount. */
export function formatMoney(value: Money, locale: string): string {
  const exponent = CURRENCY_EXPONENTS[value.currency];
  const negative = value.amount < 0;
  const digits = Math.abs(value.amount)
    .toString()
    .padStart(exponent + 1, '0');
  const major = exponent === 0 ? digits : `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
  const decimal = `${negative ? '-' : ''}${major}` as Intl.StringNumericLiteral;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(decimal);
}
