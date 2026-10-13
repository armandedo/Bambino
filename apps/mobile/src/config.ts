/**
 * Runtime settings. `EXPO_PUBLIC_*` variables are inlined by Expo at bundle time.
 * The default points at the Cloudflare preview API so the app runs on a real phone without a local server.
 * For a local API from the Android emulator use http://10.0.2.2:4000/graphql.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://bambino-api-preview.rwanyindoarmand.workers.dev/graphql';

/** Offers the API's test wallets at payment time. Never true in a production build. */
export const MOCK_PAYMENTS = process.env.EXPO_PUBLIC_MOCK_PAYMENTS === 'true';

export const LOCALE = 'en-RW';
