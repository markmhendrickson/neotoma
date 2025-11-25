import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
  readLocalStorageValue,
} from './helpers.js';

test.describe('settingsAndKeys coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl }) => {
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await seedSampleRecordsInApp(page);
  });

  test('toggles cloud storage and handles key actions', async ({ page }) => {
    await page.getByLabel('Open settings').click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    const cloudToggle = dialog.getByLabel('Enable Cloud Storage');
    await cloudToggle.check();

    const regenPrompt = new Promise<void>((resolve) => {
      page.once('dialog', async (dlg) => {
        await dlg.dismiss();
        resolve();
      });
    });
    await dialog.getByRole('button', { name: 'Regenerate Keys' }).click();
    await regenPrompt;

    await dialog.press('Escape');
    await expect(dialog).toBeHidden();

    const stored = await readLocalStorageValue(page, 'cloudStorageEnabled');
    expect(stored).toBe('true');
  });
});


