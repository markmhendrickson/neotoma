import type { Page } from '@playwright/test';

export type TestSettings = {
  apiBase: string;
  bearerToken: string;
  cloudStorageEnabled: boolean;
  csvRowRecordsEnabled: boolean;
};

export const SAMPLE_RECORD_STORAGE_KEY = 'neotoma.sampleSeeded';

type WindowWithSeeds = Window & {
  seedNeotomaSamples?: (options?: { force?: boolean }) => Promise<void>;
};

const DEFAULT_SETTINGS: TestSettings = {
  apiBase: '',
  bearerToken: '',
  cloudStorageEnabled: false,
  csvRowRecordsEnabled: true,
};

const NAV_RETRY_ATTEMPTS = 10;
const NAV_RETRY_DELAY_MS = 1_000;

export async function clearClientState(page: Page, origin: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < NAV_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(NAV_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  await page.evaluate(async () => {
    localStorage?.clear();
    sessionStorage?.clear();
    if ('databases' in indexedDB && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs
          .map((db) => db?.name)
          .filter(Boolean)
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const request = indexedDB.deleteDatabase(name as string);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
              }),
          ),
      );
    } else {
      indexedDB.deleteDatabase('neotoma.db');
    }
  });

  await page.goto('about:blank');
}

export async function primeLocalSettings(
  page: Page,
  overrides: Partial<TestSettings> = {},
): Promise<void> {
  const payload: TestSettings = {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
  await page.addInitScript((settings: TestSettings) => {
    try {
      localStorage.setItem('apiBase', settings.apiBase);
      localStorage.setItem('bearerToken', settings.bearerToken);
      localStorage.setItem('cloudStorageEnabled', String(settings.cloudStorageEnabled));
      localStorage.setItem('apiSyncEnabled', String(settings.cloudStorageEnabled));
      localStorage.setItem('csvRowRecordsEnabled', String(settings.csvRowRecordsEnabled));
      localStorage.removeItem('chatPanelMessages');
      localStorage.removeItem('neotoma_keys');
    } catch {
      // Ignore storage failures in headless mode
    }
  }, payload);
}

export async function seedSampleRecordsInApp(
  page: Page,
  { force = true }: { force?: boolean } = {},
): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as WindowWithSeeds).seedNeotomaSamples === 'function',
    undefined,
    { timeout: 30_000 },
  );
  await page.evaluate(
    async ({ shouldForce }) => {
      const win = window as WindowWithSeeds;
      if (typeof win.seedNeotomaSamples === 'function') {
        await win.seedNeotomaSamples({ force: shouldForce });
      }
    },
    { shouldForce: force },
  );
}

export async function readLocalStorageValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((storageKey) => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, key);
}

export async function uploadFileFromRecordsTable(page: Page, filePath: string): Promise<void> {
  const uploadButton = page.getByTestId('records-table-upload-button');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    uploadButton.click(),
  ]);
  await chooser.setFiles(filePath);
}

export async function getToastMessages(page: Page): Promise<string[]> {
  const locator = page.locator('[data-sonner-toast]');
  return locator.allTextContents();
}

export async function waitForRecordsToRender(page: Page): Promise<void> {
  await page.evaluate(() => {
    const chatPanel = document.querySelector('[data-chat-ready]');
    if (chatPanel instanceof HTMLElement) {
      chatPanel.style.display = 'none';
    }
  });
  await page.locator('[data-record-summary]').first().waitFor({ timeout: 30_000, state: 'attached' });
}

export function attachBrowserLogging(page: Page): void {
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    console.log(`[browser:pageerror] ${error?.stack || error?.message || error}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      console.log(`[browser:response] ${response.status()} ${response.url()}`);
    }
  });
}


export async function routeChatThroughMock(page: Page, mockApiOrigin?: string): Promise<void> {
  if (!mockApiOrigin) {
    return;
  }
  await page.route('**/api/chat', async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    const mockResponse = await page.request.fetch(`${mockApiOrigin}/api/chat`, {
      method: 'POST',
      headers: request.headers(),
      data: body ?? undefined,
    });
    const responseBody = await mockResponse.body();
    await route.fulfill({
      status: mockResponse.status(),
      headers: mockResponse.headers(),
      body: responseBody,
    });
  });
}

export async function simulateUploadFailure(page: Page, errorType: 'timeout' | 'network' | 'server' = 'network'): Promise<void> {
  await page.route('**/api/upload', async (route) => {
    if (errorType === 'timeout') {
      // Simulate timeout by never responding
      await page.waitForTimeout(60000);
    } else if (errorType === 'network') {
      await route.abort('failed');
    } else if (errorType === 'server') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    }
  });
}

export async function setQuotaExceeded(page: Page, exceeded: boolean = true): Promise<void> {
  await page.evaluate((isExceeded) => {
    // Override the storage quota API to simulate quota exceeded
    if (isExceeded) {
      (window as any).__NEOTOMA_FORCE_QUOTA_EXCEEDED = true;
    } else {
      delete (window as any).__NEOTOMA_FORCE_QUOTA_EXCEEDED;
    }
  }, exceeded);
}

export async function simulateError(page: Page, errorType: 'decryption' | 'datastore' | 'sync'): Promise<void> {
  await page.evaluate((type) => {
    if (type === 'decryption') {
      (window as any).__NEOTOMA_FORCE_DECRYPTION_ERROR = true;
    } else if (type === 'datastore') {
      (window as any).__NEOTOMA_FORCE_DATASTORE_ERROR = true;
    } else if (type === 'sync') {
      (window as any).__NEOTOMA_FORCE_SYNC_ERROR = true;
    }
  }, errorType);
}

export async function toggleColumnVisibility(page: Page, columnId: string): Promise<void> {
  await page.getByTestId('columns-dropdown-trigger').click();
  await page.waitForTimeout(200);
  
  // Try data-testid first, fall back to role selector
  const testIdCheckbox = page.getByTestId(`column-visibility-${columnId}`);
  const isVisible = await testIdCheckbox.isVisible({ timeout: 1000 }).catch(() => false);
  
  if (isVisible) {
    await testIdCheckbox.click();
  } else {
    // Fall back to role selector
    const roleCheckbox = page.getByRole('menuitemcheckbox').filter({ hasText: new RegExp(columnId, 'i') });
    if (await roleCheckbox.count() > 0) {
      await roleCheckbox.first().click();
    }
  }
  
  await page.waitForTimeout(200);
  // Close dropdown by pressing Escape
  await page.keyboard.press('Escape');
}

export async function reorderColumn(page: Page, sourceColumnId: string, targetColumnId: string): Promise<void> {
  const sourceHeader = page.getByTestId(`column-header-${sourceColumnId}`);
  const targetHeader = page.getByTestId(`column-header-${targetColumnId}`);
  
  const sourceBoundingBox = await sourceHeader.boundingBox();
  const targetBoundingBox = await targetHeader.boundingBox();
  
  if (!sourceBoundingBox || !targetBoundingBox) {
    throw new Error('Could not get bounding boxes for column headers');
  }
  
  // Perform drag and drop
  await page.mouse.move(
    sourceBoundingBox.x + sourceBoundingBox.width / 2,
    sourceBoundingBox.y + sourceBoundingBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBoundingBox.x + targetBoundingBox.width / 2,
    targetBoundingBox.y + targetBoundingBox.height / 2,
    { steps: 10 }
  );
  await page.mouse.up();
}

export async function resizeColumn(page: Page, columnId: string, deltaX: number): Promise<void> {
  const resizeHandle = page.getByTestId(`column-resize-handle-${columnId}`);
  
  const handleBoundingBox = await resizeHandle.boundingBox();
  
  if (!handleBoundingBox) {
    throw new Error('Could not get bounding box for resize handle');
  }
  
  // Start resize
  await page.mouse.move(
    handleBoundingBox.x + handleBoundingBox.width / 2,
    handleBoundingBox.y + handleBoundingBox.height / 2
  );
  await page.mouse.down();
  
  // Drag to resize
  await page.mouse.move(
    handleBoundingBox.x + handleBoundingBox.width / 2 + deltaX,
    handleBoundingBox.y + handleBoundingBox.height / 2,
    { steps: 5 }
  );
  await page.mouse.up();
}

export async function simulateOffline(page: Page, offline: boolean = true): Promise<void> {
  await page.context().setOffline(offline);
  
  // Also set navigator.onLine for consistency
  await page.evaluate((isOffline) => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: !isOffline,
    });
    
    // Dispatch online/offline events
    if (isOffline) {
      window.dispatchEvent(new Event('offline'));
    } else {
      window.dispatchEvent(new Event('online'));
    }
  }, offline);
}

export async function fillStorageQuota(page: Page, percentage: number): Promise<void> {
  await page.evaluate((targetPercentage) => {
    // Mock the storage estimate API to simulate quota usage
    const originalEstimate = navigator.storage?.estimate;
    
    if (navigator.storage) {
      navigator.storage.estimate = async () => {
        const fakeQuota = 1024 * 1024 * 1024; // 1GB
        const fakeUsage = Math.floor((fakeQuota * targetPercentage) / 100);
        
        return {
          quota: fakeQuota,
          usage: fakeUsage,
          usageDetails: {},
        };
      };
    }
  }, percentage);
}

export async function createDragEvent(page: Page, filePath: string): Promise<any> {
  const fs = await import('fs');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const fileName = filePath.split('/').pop() || 'file.txt';
  
  return page.evaluateHandle(({ content, name }) => {
    const dt = new DataTransfer();
    const file = new File([content], name, { type: 'text/plain' });
    dt.items.add(file);
    return dt;
  }, { content: fileContent, name: fileName });
}

export async function waitForSync(page: Page, timeout: number = 5000): Promise<void> {
  // Wait for any sync indicators to appear and disappear
  const syncIndicators = [
    page.locator('[data-syncing="true"]'),
    page.locator('.syncing'),
    page.getByText(/syncing/i),
    page.locator('[aria-busy="true"]'),
  ];
  
  // Wait for any sync indicator to appear or timeout
  const raceResult = await Promise.race([
    ...syncIndicators.map(indicator => 
      indicator.waitFor({ state: 'visible', timeout }).catch(() => null)
    ),
    page.waitForTimeout(timeout).then(() => 'timeout'),
  ]);
  
  // If a sync indicator appeared, wait for it to disappear
  if (raceResult !== 'timeout' && raceResult !== null) {
    await page.waitForTimeout(500);
    
    // Wait for sync indicators to disappear
    for (const indicator of syncIndicators) {
      const isVisible = await indicator.isVisible().catch(() => false);
      if (isVisible) {
        await indicator.waitFor({ state: 'hidden', timeout }).catch(() => {});
      }
    }
  }
}

export async function getStatusBadgeText(page: Page, recordId: string): Promise<string | null> {
  // Find the record row
  const recordRow = page.locator(`[data-record-id="${recordId}"]`);
  
  if (!(await recordRow.isVisible())) {
    return null;
  }
  
  // Get the status from the row (might be in a specific cell or attribute)
  const statusCell = recordRow.locator('td').filter({ hasText: /Uploading|Ready|Failed/i });
  
  if (await statusCell.count() > 0) {
    return statusCell.first().textContent();
  }
  
  // Try getting from class name
  const className = await recordRow.getAttribute('class');
  if (className?.includes('Uploading')) return 'Uploading';
  if (className?.includes('Failed')) return 'Failed';
  if (className?.includes('Ready')) return 'Ready';
  
  return null;
}
