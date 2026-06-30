import { defineConfig, devices } from '@playwright/test';

// Use the Chromium that ships with this environment (or a normal local install).
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3100',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx next start -p 3100',
    url: 'http://localhost:3100',
    timeout: 120_000,
    // Reuse a running dev server locally, but always start fresh in CI so a
    // stale server can never serve mismatched chunk hashes.
    reuseExistingServer: !process.env.CI,
  },
});
