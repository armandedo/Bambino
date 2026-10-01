import { PAYMENT_PROVIDERS } from '@bambino/types';
import { isCurrencyCode } from '@bambino/utils';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKET, LOCALES, MARKETS, getMarket, isMarketCode } from './markets';

describe('market configuration', () => {
  it('launches in Rwanda with RWF and Kigali', () => {
    const market = getMarket(DEFAULT_MARKET);
    expect(market.name).toBe('Rwanda');
    expect(market.currency).toBe('RWF');
    expect(market.primaryCity).toBe('Kigali');
    expect(market.timezone).toBe('Africa/Kigali');
  });

  it('rejects unknown markets instead of falling back silently', () => {
    expect(() => getMarket('KE')).toThrow(/Unknown market/);
    expect(isMarketCode('constructor')).toBe(false);
  });

  it.each(Object.values(MARKETS))('$code is internally consistent', (market) => {
    expect(isCurrencyCode(market.currency)).toBe(true);
    expect(market.supportedLocales).toContain(market.defaultLocale);
    for (const locale of market.supportedLocales) expect(LOCALES).toContain(locale);
    for (const provider of market.paymentProviders) expect(PAYMENT_PROVIDERS).toContain(provider);
    // The development mock must never be selectable as a market's payment method.
    expect(market.paymentProviders).not.toContain('MOCK');
    expect(() => new Intl.DateTimeFormat('en', { timeZone: market.timezone })).not.toThrow();
    const keys = market.addressFormat.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
