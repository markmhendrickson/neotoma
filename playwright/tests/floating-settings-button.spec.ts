import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  attachBrowserLogging,
  routeChatThroughMock,
} from './helpers.js';

test.describe('Inspector settings page coverage', () => {
  test.beforeEach(async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(`${uiBaseUrl}/inspector/settings`);
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays settings overview content', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Inspector, Settings/i })).toBeVisible();
    await expect(page.getByText(/connection to the Neotoma API/i)).toBeVisible();
  });

  test('links to settings detail pages', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Connection/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Attribution policy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Retention/i })).toBeVisible();
  });

  test('renders the Inspector preview navigation', async ({ page }) => {
    await expect(page.getByText('/settings', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Per-instance configuration/i)).toBeVisible();
  });
});
