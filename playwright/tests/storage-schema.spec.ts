import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
  waitForRecordsToRender,
  readLocalStorageValue,
  SAMPLE_RECORD_STORAGE_KEY,
} from './helpers.js';

test.describe('storageAndSchema coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl }) => {
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await seedSampleRecordsInApp(page);
    await waitForRecordsToRender(page);
  });

  test('shows quota details and persists seed marker', async ({ page }) => {
    await expect(
      page.getByText(/\d+\s+records/i).first(),
    ).toBeVisible();

    await page.getByLabel('Local storage details').click();
    const sheet = page.getByRole('dialog', { name: /Local Storage/i });
    await expect(sheet.getByText(/Records are stored locally/i)).toBeVisible();
    await sheet.getByRole('button', { name: 'Open Settings' }).click();

    const settingsDialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(settingsDialog).toBeVisible();
    await settingsDialog.press('Escape');
    await expect(settingsDialog).toBeHidden();

    const seedMarker = await readLocalStorageValue(
      page,
      SAMPLE_RECORD_STORAGE_KEY,
    );
    expect(seedMarker).toBeTruthy();
  });
});

