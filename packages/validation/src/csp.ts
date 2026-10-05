import { z } from 'zod';

/**
 * Browsers run the website under a Content-Security-Policy without 'unsafe-eval'. Zod probes for `new Function`
 * support when an object schema is built; the probe is caught, but the browser still reports a CSP violation.
 * Jitless parsing skips the probe. This runs on import, before the schemas in this package are built (it is the
 * first export of index.ts); the API, with no `window`, keeps the faster path.
 */
if ('window' in globalThis) z.config({ jitless: true });
