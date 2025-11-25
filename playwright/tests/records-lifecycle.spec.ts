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
  attachBrowserLogging,
  routeChatThroughMock,
} from './helpers.js';

const uploadFixturePath = path.join(
  repoRoot,
  'playwright/tests/fixtures/sample-upload.txt',
);

test.describe('recordsLifecycle coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
    await seedSampleRecordsInApp(page);
    await waitForRecordsToRender(page);
  });

  test('filters, uploads, and deletes records', async ({ page }) => {
    const searchInput = page.getByTestId('records-table-search-input');
    await searchInput.fill('northwind');
    await page
      .locator('[data-record-summary]')
      .filter({ hasText: /Northwind retro highlights and follow-ups/i })
      .first()
      .waitFor({ timeout: 30_000, state: 'attached' });

    await searchInput.fill('');
    const typeFilter = page.getByTestId('records-type-filter');
    await typeFilter.click();
    await page.getByRole('menuitemradio', { name: /invoice/i }).click();
    await expect(
      page.getByRole('row', { name: /Design retainer invoice/i }),
    ).toBeVisible();

    const rows = page.locator('tbody tr');
    const startingCount = await rows.count();
    const firstRowId = await rows.first().getAttribute('data-record-id');
    expect(firstRowId).toBeTruthy();
    const hasSelectHook = await page.evaluate(() => typeof window.__NEOTOMA_SELECT_RECORD === 'function');
    expect(hasSelectHook).toBeTruthy();
    await page.evaluate((recordId) => {
      window.__NEOTOMA_SELECT_RECORD?.(recordId as string);
    }, firstRowId);
    const deleteButton = page.getByTestId('records-delete-selected-button');
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();
    await expect(rows).toHaveCount(startingCount - 1);

    await typeFilter.click();
    await page.getByRole('menuitemradio', { name: /All Types/i }).click();

    await uploadFileFromRecordsTable(page, uploadFixturePath);

    const toasts = await getToastMessages(page);
    expect(toasts.some((text) => text.includes('sample-upload.txt'))).toBe(
      true,
    );
  });
});
