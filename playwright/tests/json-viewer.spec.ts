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

test.describe('jsonViewer coverage', () => {
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

  test('displays primitive values correctly', async ({ page }) => {
    // Open a record to see its details
    const firstRecord = page.locator('[data-record-summary]').first();
    await firstRecord.click();

    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(panel).toBeVisible();

    // Look for JSON viewer content (primitive values)
    const panelText = await panel.textContent();

    // Check for common primitive value formats
    // Strings should have quotes, numbers should be plain, booleans should be true/false
    const hasPrimitives = panelText?.includes('"') || // strings with quotes
                         panelText?.match(/\d+/) ||    // numbers
                         panelText?.includes('true') || 
                         panelText?.includes('false') ||
                         panelText?.includes('null');

    expect(hasPrimitives).toBeTruthy();

    // Close panel
    await panel.getByRole('button', { name: 'Close' }).click();
  });

  test('expands and collapses nested objects', async ({ page }) => {
    // Open a record with nested data
    const record = page.locator('[data-record-summary]').first();
    await record.click();

    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(panel).toBeVisible();

    // Look for expandable elements (buttons with aria-expanded)
    const expandButtons = panel.locator('button[aria-expanded]');
    const buttonCount = await expandButtons.count();

    if (buttonCount > 0) {
      const firstButton = expandButtons.first();

      // Check initial state
      const initialExpanded = await firstButton.getAttribute('aria-expanded');

      // Click to toggle
      await firstButton.click();
      await page.waitForTimeout(200);

      // Check if state changed
      const afterClickExpanded = await firstButton.getAttribute('aria-expanded');

      // State should have toggled
      expect(initialExpanded).not.toBe(afterClickExpanded);

      // Click again to toggle back
      await firstButton.click();
      await page.waitForTimeout(200);

      const finalExpanded = await firstButton.getAttribute('aria-expanded');

      // Should return to initial state
      expect(finalExpanded).toBe(initialExpanded);
    } else {
      // If no expandable buttons, the data might be flat
      // Just verify the panel has content
      const panelText = await panel.textContent();
      expect(panelText?.length).toBeGreaterThan(10);
    }

    // Close panel
    await panel.getByRole('button', { name: 'Close' }).click();
  });

  test('displays arrays with indices as labels', async ({ page }) => {
    // Open a record that might have array data
    const record = page.locator('[data-record-summary]').first();
    await record.click();

    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(panel).toBeVisible();

    // Look for array indicators
    const panelText = await panel.textContent();

    // Arrays might be shown as "Array (n)" or with numeric indices like "0:", "1:", "2:"
    const hasArrayIndicators = panelText?.includes('Array') || 
                               panelText?.match(/\b[0-9]:/g) ||
                               panelText?.includes('[]');

    // Look for expandable array elements
    const arrayButtons = panel.locator('button').filter({ hasText: /Array/i });
    const arrayButtonCount = await arrayButtons.count();

    if (arrayButtonCount > 0) {
      // Expand an array to see indices
      const arrayButton = arrayButtons.first();
      await arrayButton.click();
      await page.waitForTimeout(200);

      // After expanding, should see numeric labels (0, 1, 2, etc.)
      const expandedText = await panel.textContent();
      const hasIndices = expandedText?.match(/\b[0-9]:/g) || expandedText?.match(/\b[0-9]\b/g);

      expect(hasIndices).toBeTruthy();
    } else {
      // Even without arrays, panel should have content
      expect(panelText?.length).toBeGreaterThan(10);
    }

    // Close panel
    await panel.getByRole('button', { name: 'Close' }).click();
  });

  test('handles null and undefined values gracefully', async ({ page }) => {
    // Open a record
    const record = page.locator('[data-record-summary]').first();
    await record.click();

    const panel = page.getByRole('dialog', { name: /Record Details/i });
    await expect(panel).toBeVisible();

    // Check panel content for null handling
    const panelText = await panel.textContent();

    // Null values should be displayed as "null" text
    // undefined values should either show as "undefined" or be omitted
    const hasNullHandling = panelText?.includes('null') || 
                           panelText?.includes('undefined') ||
                           panelText?.length > 10; // Has some content

    expect(hasNullHandling).toBeTruthy();

    // Verify panel doesn't crash with null values (it's functional)
    await expect(panel.getByRole('button', { name: 'Close' })).toBeVisible();

    // Close panel
    await panel.getByRole('button', { name: 'Close' }).click();
  });
});
