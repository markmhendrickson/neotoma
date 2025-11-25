import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
  waitForRecordsToRender,
  attachBrowserLogging,
  routeChatThroughMock,
} from './helpers.js';

test.describe('recordDetails coverage', () => {
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

  test('opens panel for a note record', async ({ page }) => {
    const northwindRow = page
      .locator('[data-record-summary]')
      .filter({ hasText: /Northwind retro highlights and follow-ups/i })
      .first();
    await northwindRow.waitFor({ timeout: 30_000 });
    await northwindRow.scrollIntoViewIfNeeded();
    await northwindRow.evaluate((el) => (el as HTMLElement).click());
    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Northwind retro highlights and follow-ups/i)).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
  });

  test('shows file actions and guidance for remote assets', async ({ page }) => {
    const snapshotRow = page
      .locator('[data-record-summary]')
      .filter({ hasText: /Product roadmap whiteboard snapshot/i })
      .first();
    await snapshotRow.waitFor({ timeout: 30_000 });
    await snapshotRow.scrollIntoViewIfNeeded();
    await snapshotRow.evaluate((el) => (el as HTMLElement).click());
    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(
      panel.getByText(/Enable "Cloud Storage" in Settings/i),
    ).toBeVisible();
  });
});
