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

test.describe('chatPanel coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
    await seedSampleRecordsInApp(page);
  });

  test('sends messages via mock API and persists history', async ({ page }) => {
    await expect(
      page.getByText(/Neotoma remembers your data/i).first(),
    ).toBeVisible();

    const composer = page.getByPlaceholder('Ask about records...');
    await composer.fill('Summarize my seeded records.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await page.waitForFunction(
      () =>
        window.__NEOTOMA_LAST_ASSISTANT_MESSAGE?.match(/Mock response referencing record/i),
      { timeout: 20_000 },
    );

    await page.reload();
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
    const storedMessages = await readLocalStorageValue(page, 'chatPanelMessages');
    expect(storedMessages).toBeTruthy();
    expect(
      storedMessages?.includes('Mock response referencing record') ||
        storedMessages?.startsWith('encrypted:'),
    ).toBeTruthy();
  });
});
