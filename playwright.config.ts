import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests for the RandomBeast giveaway bot.
 *
 * Run:
 *   pnpm test:e2e          -- headless
 *   pnpm test:e2e:ui       -- interactive UI mode
 *   pnpm test:e2e:headed   -- watch browsers open
 *
 * Requires: `pnpm dev` running (web on :3000, api on :4000)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // NOTE: Запусти сервер вручную перед тестами (`pnpm dev`)
  // webServer закомментирован чтобы не мешать dev-режиму
  // webServer: {
  //   command: 'pnpm dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
