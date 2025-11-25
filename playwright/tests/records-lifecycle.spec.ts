import path from 'node:path';
import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import { repoRoot } from '../utils/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
  waitForRecordsToRender,
  uploadFileFromRecordsTable,
  getToastMessages,
} from './helpers.js';

const uploadFixturePath = path.join(
  repoRoot,
  'playwright/tests/fixtures/sample-upload.txt',
);

const isRecordsMobileWebkit = process.env.PLAYWRIGHT_PROJECT === 'mobile-webkit';
const describeRecordsLifecycle = isRecordsMobileWebkit ? test.describe.skip : test.describe;

describeRecordsLifecycle('recordsLifecycle coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl }) => {
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await seedSampleRecordsInApp(page);
    await waitForRecordsToRender(page);
  });

  test('filters and uploads records', async ({ page }) => {
    if (process.env.PLAYWRIGHT_PROJECT === 'mobile-webkit') {
      test.skip(true, 'Record table interactions are not fully supported on WebKit mobile layout.');
    }
    const searchInput = page.getByPlaceholder('Search records...');
    await searchInput.fill('northwind');
    const noteRow = page.getByRole('row', { name: /Northwind retro highlights/i });
    await noteRow.waitFor({ state: 'attached', timeout: 30_000 });

    await searchInput.fill('');
    const typeFilter = page.getByRole('button', { name: /All Types|Type:/i });
    await typeFilter.click();
    await page.getByRole('menuitemradio', { name: /invoice/i }).click();
    await expect(
      page.getByRole('row', { name: /Design retainer invoice/i }),
    ).toBeVisible();

    await uploadFileFromRecordsTable(page, uploadFixturePath);

    const toasts = await getToastMessages(page);
    expect(toasts.some((text) => text.includes('sample-upload.txt'))).toBe(
      true,
    );
  });
});


