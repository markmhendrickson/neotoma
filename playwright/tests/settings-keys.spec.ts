import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
  readLocalStorageValue,
  attachBrowserLogging,
  routeChatThroughMock,
} from './helpers.js';

test.describe('settingsAndKeys coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
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

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const stored = await readLocalStorageValue(page, 'cloudStorageEnabled');
    expect(stored).toBe('true');
  });
});
