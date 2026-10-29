import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** E2E_LIVE=1: the build reads the API (NEXT_PUBLIC_LIVE_DATA=1); only live.spec.ts applies. */
const LIVE = process.env.E2E_LIVE === '1';

/** E2E against a production build: `pnpm build && pnpm e2e`. */
export default defineConfig({
  testDir: './e2e',
  ...(LIVE ? { testMatch: /live\.spec\.ts/ } : { testIgnore: /live\.spec\.ts/ }),
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: LIVE ? /live\.spec\.ts/ : /smoke\.spec\.ts/ },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // XX is a user-assigned ISO code, so no real visitor is blocked; legal.spec.ts sends it to test the region notice.
    env: { NEXT_TELEMETRY_DISABLED: '1', GEO_BLOCKED_COUNTRIES: 'XX' },
  },
});
