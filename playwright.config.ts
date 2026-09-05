import { defineConfig, devices } from '@playwright/test';

/**
 * Port is overridable because `reuseExistingServer` silently attaches to
 * whatever is already listening. A different project on 5173 meant a local run
 * tested that app instead, and reported failures that had nothing to do with
 * this codebase.
 */
const PORT = Number(process.env.E2E_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'dot' : 'html',
  use: {
    baseURL: BASE_URL,
    // Belt and braces alongside the PROD guard in registerServiceWorker.ts: a
    // worker that controls the page bypasses page.route(), so the mock backend
    // silently stops working and every test fails for a reason that looks
    // nothing like the cause.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort --mode ${process.env.E2E_MODE ?? 'development'}`,
    // Matches MOCK_USER.email so the admin panel is reachable in tests.
    env: { ...process.env, VITE_ADMIN_EMAIL: 'test@example.com' },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
