import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.ops.ts',
  workers: 1,
  timeout: 150000,
  expect: { timeout: 10000 },
  outputDir: 'test-results/operations',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/operations', open: 'never' }]],
  use: {
    baseURL: process.env.OPS_BASE_URL,
    viewport: { width: 1440, height: 1000 },
    httpCredentials: {
      username: process.env.OPS_ACCESS_USER!,
      password: process.env.OPS_ACCESS_PASSWORD!,
      send: 'always',
    },
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${process.env.OPS_TLS_SPKI}`],
    },
    screenshot: 'only-on-failure',
    // Traces contain form values and cookies. Keep private account flows out of trace archives.
    trace: 'off',
  },
});
