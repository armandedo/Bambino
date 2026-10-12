// OpenNext for Cloudflare. No incremental cache: the dashboard is a signed-in, per-request client app, so there is
// nothing for ISR to store.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
