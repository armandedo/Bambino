import type { PaymentProviderCode } from '@bambino/types';
import type { CurrencyCode } from '@bambino/utils';

/**
 * Everything that differs between countries lives here. Business logic reads a
 * MarketConfig and never branches on a country code, so a new market is a new
 * entry in MARKETS rather than a code change.
 */

export const LOCALES = ['en', 'rw', 'fr', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];

export type AddressFieldKey = 'region' | 'district' | 'sector' | 'street' | 'directions';

export interface AddressField {
  readonly key: AddressFieldKey;
  /** Translation key for the field label. */
  readonly labelKey: string;
  readonly required: boolean;
}

export interface TaxRule {
  /** Translation key for the label shown on order summaries. */
  readonly labelKey: string;
  /** Rate in basis points (18% = 1800). */
  readonly rateBasisPoints: number;
  /** True when catalogue prices already include this tax. */
  readonly includedInPrices: boolean;
}

export interface MarketConfig {
  readonly code: string;
  readonly name: string;
  readonly primaryCity: string;
  readonly currency: CurrencyCode;
  readonly defaultLocale: Locale;
  readonly supportedLocales: readonly Locale[];
  readonly timezone: string;
  readonly phoneCountryCode: string;
  readonly paymentProviders: readonly PaymentProviderCode[];
  readonly deliveryProviders: readonly string[];
  /**
   * null means no tax line is calculated. Whether and how Bambino charges VAT is a
   * registration and accounting decision that has not been made yet, so nothing is assumed.
   */
  readonly tax: TaxRule | null;
  readonly addressFormat: readonly AddressField[];
}

export const MARKETS = {
  RW: {
    code: 'RW',
    name: 'Rwanda',
    primaryCity: 'Kigali',
    currency: 'RWF',
    defaultLocale: 'en',
    // Only English is shipped in the MVP; the others are wired into the i18n layer
    // but have no translations yet.
    supportedLocales: ['en'],
    timezone: 'Africa/Kigali',
    phoneCountryCode: '250',
    paymentProviders: ['MTN_MOMO', 'AIRTEL_MONEY'],
    deliveryProviders: ['IN_HOUSE'],
    tax: null,
    addressFormat: [
      { key: 'region', labelKey: 'address.rw.province', required: true },
      { key: 'district', labelKey: 'address.rw.district', required: true },
      { key: 'sector', labelKey: 'address.rw.sector', required: true },
      { key: 'street', labelKey: 'address.rw.street', required: false },
      { key: 'directions', labelKey: 'address.directions', required: false },
    ],
  },
} as const satisfies Record<string, MarketConfig>;

export type MarketCode = keyof typeof MARKETS;

export const DEFAULT_MARKET: MarketCode = 'RW';

export function isMarketCode(value: string): value is MarketCode {
  return Object.hasOwn(MARKETS, value);
}

export function getMarket(code: string): MarketConfig {
  if (!isMarketCode(code)) {
    throw new Error(`Unknown market "${code}". Configured markets: ${Object.keys(MARKETS).join(', ')}`);
  }
  return MARKETS[code];
}
