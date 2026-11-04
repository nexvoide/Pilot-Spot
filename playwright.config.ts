import { defineConfig } from '@playwright/test';

const chromeExecutable =
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);

export default defineConfig({
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  reporter: [['list']],
  testDir: './e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    browserName: 'chromium',
    launchOptions: chromeExecutable ? { executablePath: chromeExecutable } : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm start',
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:8787',
  },
});
