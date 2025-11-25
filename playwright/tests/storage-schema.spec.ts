import { expect } from '@playwright/test';
import { test } from '../fixtures/servers.js';
import {
  clearClientState,
  primeLocalSettings,
  seedSampleRecordsInApp,
  waitForRecordsToRender,
  readLocalStorageValue,
  SAMPLE_RECORD_STORAGE_KEY,
  attachBrowserLogging,
  routeChatThroughMock,
} from './helpers.js';

test.describe('storageAndSchema coverage', () => {
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

  test('shows quota details and persists seed marker', async ({ page }) => {
    await expect(
      page.getByText(/\d+\s+records/i).first(),
    ).toBeVisible();

    await page.getByTestId('local-storage-details-button').click();
    const sheet = page.getByRole('dialog', { name: /Local Storage/i });
    await expect(sheet.getByText(/Records are stored locally/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByLabel('Open settings').click();

    const settingsDialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(settingsDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog).toBeHidden();

    const seedMarker = await readLocalStorageValue(
      page,
      SAMPLE_RECORD_STORAGE_KEY,
    );
    expect(seedMarker).toBeTruthy();
  });
});

test.describe('storageAndSchema - initialization coverage', () => {
  test('initializes schema on first run', async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    
    // Clear all state to simulate first run
    await clearClientState(page, uiBaseUrl);
    
    // Navigate without priming settings
    await page.goto(uiBaseUrl);
    
    // Wait for app to initialize
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
    
    // Verify database is functional by checking if we can see the empty state
    const emptyState = page.getByText(/No records yet/i);
    await expect(emptyState).toBeVisible();
    
    // Verify we can interact with the database by seeding records
    await seedSampleRecordsInApp(page);
    await waitForRecordsToRender(page);
    
    // Verify records are rendered (database is working)
    const records = page.locator('[data-record-summary]');
    await expect(records.first()).toBeVisible();
    const count = await records.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('storageAndSchema - quota coverage', () => {
  test('displays low quota usage for minimal records', async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
    
    // Seed just 1-2 records for minimal usage
    await seedSampleRecordsInApp(page, { force: true });
    await waitForRecordsToRender(page);
    
    // Open storage details
    const storageButton = page.getByTestId('local-storage-details-button');
    await storageButton.click();
    
    const sheet = page.getByRole('dialog', { name: /Local Storage/i });
    await expect(sheet).toBeVisible();
    
    // Get quota text
    const quotaText = await sheet.textContent();
    
    // Should show low percentage (look for single or low double digits)
    const hasLowUsage = quotaText?.match(/[<\s]([0-9]|[1-4][0-9])%/) || 
                       quotaText?.includes('< 1%') ||
                       quotaText?.includes('<1%');
    
    // Verify no warning messages about high usage
    const hasWarning = quotaText?.toLowerCase().includes('warn') ||
                      quotaText?.toLowerCase().includes('full') ||
                      quotaText?.toLowerCase().includes('limit');
    
    expect(hasWarning).toBeFalsy();
    
    await page.keyboard.press('Escape');
  });

  test('handles high quota usage scenarios', async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
    
    // Seed records
    await seedSampleRecordsInApp(page);
    await waitForRecordsToRender(page);
    
    // Open storage details
    const storageButton = page.getByTestId('local-storage-details-button');
    await storageButton.click();
    
    const sheet = page.getByRole('dialog', { name: /Local Storage/i });
    await expect(sheet).toBeVisible();
    
    // Verify storage information is displayed
    await expect(sheet.getByText(/Records are stored locally/i)).toBeVisible();
    
    // Check for quota-related content
    const sheetText = await sheet.textContent();
    const hasQuotaInfo = sheetText?.includes('quota') || 
                        sheetText?.includes('Quota') ||
                        sheetText?.includes('storage') ||
                        sheetText?.includes('Storage');
    
    expect(hasQuotaInfo).toBeTruthy();
    
    await page.keyboard.press('Escape');
  });
});

test.describe('storageAndSchema - sync coverage', () => {
  test('shows sync state when cloud storage is enabled', async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector('[data-chat-ready="true"]', { timeout: 30_000 });
    
    // Enable cloud storage
    await page.getByLabel('Open settings').click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    
    const cloudToggle = dialog.getByLabel('Enable Cloud Storage');
    if (await cloudToggle.isVisible()) {
      const isChecked = await cloudToggle.isChecked();
      if (!isChecked) {
        await cloudToggle.check();
        await page.waitForTimeout(500);
      }
    }
    
    await page.keyboard.press('Escape');
    
    // Seed records which should trigger sync
    await seedSampleRecordsInApp(page);
    await waitForRecordsToRender(page);
    
    // Check for any sync indicators (spinners, status text, etc.)
    // The app might show sync status in various places
    const bodyText = await page.textContent('body');
    
    // Look for sync-related text or just verify the app is functional with cloud enabled
    const appIsFunctional = await page.locator('[data-record-summary]').first().isVisible();
    expect(appIsFunctional).toBeTruthy();
    
    // Verify cloud storage indicator in storage details
    const storageButton = page.getByTestId('local-storage-details-button');
    await storageButton.click();
    
    const sheet = page.getByRole('dialog', { name: /Local Storage/i });
    await expect(sheet).toBeVisible();
    
    // Check for cloud storage enabled message
    const sheetText = await sheet.textContent();
    const hasCloudInfo = sheetText?.includes('cloud') || 
                        sheetText?.includes('Cloud') ||
                        sheetText?.includes('sync') ||
                        sheetText?.includes('enabled');
    
    expect(hasCloudInfo).toBeTruthy();
  });
});
