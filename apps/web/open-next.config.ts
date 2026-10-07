// OpenNext for Cloudflare. No incremental cache: every page renders per request (CSP nonce in proxy.ts),
// so there is nothing for ISR to store. Add an R2 bucket and r2IncrementalCache only if static/ISR pages appear.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
