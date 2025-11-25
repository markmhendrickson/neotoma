import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
  waitForRecordsToRender,
} from './helpers.js';

const isMobileWebkit = process.env.PLAYWRIGHT_PROJECT === 'mobile-webkit';
const describeRecordDetails = isMobileWebkit ? test.describe.skip : test.describe;

describeRecordDetails('recordDetails coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl }) => {
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await seedSampleRecordsInApp(page);
    await waitForRecordsToRender(page);
  });

  test('opens panel for a note record', async ({ page }) => {
    if (process.env.PLAYWRIGHT_PROJECT === 'mobile-webkit') {
      test.skip(true, 'Record table interactions are not fully supported on WebKit mobile layout.');
    }
    const noteRow = page.getByRole('row', { name: /Northwind retro highlights/i });
    await noteRow.waitFor({ state: 'attached', timeout: 30_000 });
    await noteRow.click({ force: true });
    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Northwind retro highlights/i)).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
  });

  test('shows file actions and guidance for remote assets', async ({ page }) => {
    if (process.env.PLAYWRIGHT_PROJECT === 'mobile-webkit') {
      test.skip(true, 'Record table interactions are not fully supported on WebKit mobile layout.');
    }
    const fileRow = page.getByRole('row', { name: /whiteboard snapshot/i });
    await fileRow.waitFor({ state: 'attached', timeout: 30_000 });
    await fileRow.click({ force: true });
    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(panel.getByText('files/roadmap-draft.png')).toBeVisible();
    await expect(
      panel.getByText(/Enable "Cloud Storage" in Settings/i),
    ).toBeVisible();
  });
});


