import type { Env } from '../config/env';
import { MtnMomoProvider } from './mtn-momo';
import { MockPaymentProvider, type PaymentProvider, type PaymentProviderRegistry } from './payments';

/** The providers switched on by `PAYMENT_PROVIDERS_ENABLED`, built from the validated environment. */
export function createPaymentProviders(env: Env): PaymentProviderRegistry {
  const providers = new Map<PaymentProvider['code'], PaymentProvider>();
  if (env.PAYMENT_PROVIDERS_ENABLED.includes('mock')) {
    providers.set(
      'MOCK',
      new MockPaymentProvider(env.MOCK_PAYMENT_WEBHOOK_SECRET, env.PAYMENT_EXPIRY_MINUTES, () => new Date()),
    );
  }
  if (env.PAYMENT_PROVIDERS_ENABLED.includes('mtn_momo')) {
    // The environment schema has already checked that these are present when MTN MoMo is enabled.
    const collection = {
      subscriptionKey: env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY ?? '',
      apiUser: env.MTN_MOMO_COLLECTION_API_USER ?? '',
      apiKey: env.MTN_MOMO_COLLECTION_API_KEY ?? '',
    };
    const disbursement =
      env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY &&
      env.MTN_MOMO_DISBURSEMENT_API_USER &&
      env.MTN_MOMO_DISBURSEMENT_API_KEY
        ? {
            subscriptionKey: env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY,
            apiUser: env.MTN_MOMO_DISBURSEMENT_API_USER,
            apiKey: env.MTN_MOMO_DISBURSEMENT_API_KEY,
          }
        : undefined;
    providers.set(
      'MTN_MOMO',
      new MtnMomoProvider({
        config: {
          baseUrl: env.MTN_MOMO_BASE_URL,
          targetEnvironment: env.MTN_MOMO_TARGET_ENVIRONMENT,
          currency: env.MTN_MOMO_CURRENCY,
          collection,
          ...(disbursement ? { disbursement } : {}),
          expiryMinutes: env.PAYMENT_EXPIRY_MINUTES,
        },
      }),
    );
  }
  return providers;
}
