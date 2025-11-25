import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
} from './helpers.js';

test.describe('chatPanel coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl }) => {
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await seedSampleRecordsInApp(page);
  });

  test('sends messages via mock API and persists history', async ({ page }) => {
    await expect(
      page.getByText(/Neotoma remembers your data/i).first(),
    ).toBeVisible();

    const composer = page.getByPlaceholder('Ask about records...');
    await composer.fill('Summarize my seeded records.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect.poll(async () => {
      return page.evaluate(() =>
        window.__CHAT_MESSAGES__?.some((msg) =>
          /Mock response referencing record/i.test(msg.content),
        ) ?? false,
      );
    }).toBe(true);

    await page.reload();
    await expect.poll(async () => {
      return page.evaluate(() =>
        window.__CHAT_MESSAGES__?.some((msg) =>
          /Mock response referencing record/i.test(msg.content),
        ) ?? false,
      );
    }).toBe(true);
  });

  test('surfaces visualization CTA and opens graph sheet', async ({ page }) => {
    await expect(
      page.getByText(/Neotoma remembers your data/i).first(),
    ).toBeVisible();

    const composer = page.getByPlaceholder('Ask about records...');
    await composer.fill('Show me invoice totals');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(
      page.getByText(/Visualization ready/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Show graph' }).click();

    await expect(
      page.getByRole('button', { name: 'Export CSV' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/Mock invoice totals by vendor/i).first(),
    ).toBeVisible();
  });
});


