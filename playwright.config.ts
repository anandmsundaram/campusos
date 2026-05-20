import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

// Load test-specific env vars (not committed; see .env.test.local.example)
dotenv.config({ path: path.resolve(__dirname, '.env.test.local') })

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },

  // One failed test does not abort the whole run
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // Shared auth setup — runs once before all tests
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Main test project — depends on auth setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Each test chooses its own storageState via fixtures
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
