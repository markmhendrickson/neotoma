import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? 1);
const outputDir = path.join('playwright', 'test-results');
const reportDir = path.join('playwright', 'report');
const defaultBaseUrl =
  process.env.PLAYWRIGHT_UI_BASE_URL ?? 'http://127.0.0.1:5173';
const traceMode = process.env.CI ? 'retain-on-failure' : 'on-first-retry';

export default defineConfig({
  globalSetup: path.join(__dirname, 'playwright', 'global_setup.ts'),
  testDir: path.join(__dirname, 'playwright', 'tests'),
  timeout: 120 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  retries: process.env.CI ? 1 : 0,
  workers: Number.isFinite(workers) && workers > 0 ? workers : 1,
  reporter: process.env.CI
    ? [
        ['line'],
        ['html', { open: 'never', outputFolder: reportDir }],
      ]
    : [['list']],
  use: {
    baseURL: defaultBaseUrl,
    trace: traceMode,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  outputDir,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['Mobile Safari'],
        viewport: {
          width: 430,
          height: 932,
        },
      },
    },
  ],
});
