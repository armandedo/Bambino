import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Seed credentials and URLs come from the repository's git-ignored .env.local in development, and from the
// CI environment in Phase 9. Nothing secret is written in this file.
const envFile = fileURLToPath(new URL('../../.env.local', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:3001/admin';

export default defineConfig({
  testDir: './journeys',
  // Journeys share one database and the API's in-memory rate limits; run them one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // E2E_CHANNEL=msedge (or chrome) uses an installed browser; otherwise run `pnpm exec playwright install chromium`.
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  // Starts the API, website and admin if they are not already running. Production builds (`build` then `start`)
  // make runs faster and steadier than dev servers, which compile each page on first visit.
  webServer: [
    {
      command: 'pnpm --filter @bambino/api start',
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @bambino/web dev',
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @bambino/admin dev',
      url: `${ADMIN_URL}/login`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
