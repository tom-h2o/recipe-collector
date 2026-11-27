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
    // The app follows the browser's language; the specs match English text.
    // tests/e2e/language.spec.ts sets German itself.
    locale: 'en-US',
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
    // Who is the admin is the server's answer (GET /api/account?tab=whoami),
    // which tests/e2e/support/mockBackend.ts gives for MOCK_USER.
    url: BASE_URL,
    // Sign-up is closed unless this is set (src/lib/signupOpen.ts). The auth
    // specs exercise sign-up, so the suite runs with it open; the closed
    // screen is held by src/components/AuthGate.test.tsx.
    env: { VITE_SIGNUP_OPEN: 'true' },
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
