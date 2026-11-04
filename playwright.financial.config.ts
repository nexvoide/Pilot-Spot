import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['financial-integration.spec.ts', 'production-flow.spec.ts'],
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_FINANCIAL_BASE_URL ?? 'http://127.0.0.1:18787',
    browserName: 'chromium',
    launchOptions:
      process.platform === 'darwin'
        ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
        : undefined,
    trace: 'retain-on-failure',
  },
});
