import type { Page } from '@playwright/test';

export type TestSettings = {
  apiBase: string;
  bearerToken: string;
  cloudStorageEnabled: boolean;
};

const DEFAULT_SETTINGS: TestSettings = {
  apiBase: '',
  bearerToken: '',
  cloudStorageEnabled: false,
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
      localStorage.removeItem('neotoma_keys');
    } catch {
      // Ignore storage failures in headless mode
    }
  }, payload);
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

export async function getToastMessages(page: Page): Promise<string[]> {
  const locator = page.locator('[data-sonner-toast]');
  return locator.allTextContents();
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

/**
 * Collect console errors and page errors for assertion
 * Use this to verify no console errors occur during UI interactions
 * 
 * @example
 * ```typescript
 * test("should not have console errors", async ({ page }) => {
 *   const errors = collectConsoleErrors(page);
 *   await page.goto("/page-path");
 *   await page.click("button");
 *   expect(errors.getErrors()).toHaveLength(0);
 * });
 * ```
 */
export function collectConsoleErrors(page: Page): {
  getErrors: () => string[];
  getPageErrors: () => string[];
  clear: () => void;
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    const errorMessage = error?.stack || error?.message || String(error);
    pageErrors.push(errorMessage);
  });

  return {
    getErrors: () => [...consoleErrors],
    getPageErrors: () => [...pageErrors],
    clear: () => {
      consoleErrors.length = 0;
      pageErrors.length = 0;
    },
  };
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

// ============================================================================
// OAuth Flow Helpers
// ============================================================================

/**
 * Wait for the app to show authenticated shell (MainApp after ProtectedRoute).
 * Use after guest sign-in or when verifying auth. Default route is Dashboard ("Welcome to Neotoma").
 */
export async function waitForAuthenticatedUI(page: Page, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout ?? 30_000;
  await page.waitForFunction(
    () => {
      const guestButtons = Array.from(document.querySelectorAll('button')).filter(
        (btn) => {
          const t = (btn.textContent || '').trim();
          return t.includes('Continue as Guest') || (t.includes('Guest') && t.length < 30);
        },
      );
      const notAuthPage = guestButtons.length === 0;
      const hasNav = document.querySelector('nav, aside, [role="navigation"]') !== null;
      const hasMain = document.querySelector('main, [role="main"]') !== null;
      const hasHeading = document.querySelector('h1, h2') !== null;
      return notAuthPage && (hasNav || hasMain || hasHeading);
    },
    { timeout },
  );
}

/**
 * Sign in as guest (anonymous user).
 * Waits for authenticated UI (nav/main/heading, no guest button). Default landing is Dashboard.
 */
export async function signInAsGuest(page: Page): Promise<void> {
  const alreadyAuthenticated = await page
    .waitForFunction(
      () => {
        const hasNav = document.querySelector('nav, aside, [role="navigation"]') !== null;
        const hasMain = document.querySelector('main, [role="main"]') !== null;
        const guestButtons = Array.from(document.querySelectorAll('button')).filter(
          (btn) => (btn.textContent || '').includes('Continue as Guest') || (btn.textContent || '').includes('Guest'),
        );
        return (hasNav || hasMain) && guestButtons.length === 0;
      },
      { timeout: 2_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (alreadyAuthenticated) {
    return;
  }

  const guestButton = page.getByRole('button', { name: /Continue as Guest/i });
  const isVisible = await guestButton.isVisible({ timeout: 5000 }).catch(() => false);

  if (isVisible) {
    await guestButton.click();
    await waitForAuthenticatedUI(page);
  }
}

/**
 * Navigate to MCP config area. App may show Dashboard by default; OAuth page is at /oauth.
 * Use this when a test expects to be on a page with MCP/OAuth UI (e.g. after going to /oauth or /mcp/cursor).
 */
export async function navigateToMCPConfig(page: Page): Promise<void> {
  await waitForAuthenticatedUI(page, { timeout: 10_000 });
  const oauthTab = page.getByRole('tab', { name: 'OAuth Connection' });
  if (await oauthTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await oauthTab.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Generate connection ID in UI
 */
export async function generateConnectionId(page: Page): Promise<string> {
  const generateButton = page.getByRole('button', { name: /Generate/i });
  await generateButton.click();
  await page.waitForTimeout(500);
  
  // Get the generated connection ID from the input
  const connectionIdInput = page.locator('input#oauth-connection-id');
  const connectionId = await connectionIdInput.inputValue();
  return connectionId;
}

/**
 * Start OAuth flow and get auth URL
 */
export async function startOAuthFlow(page: Page, connectionId: string): Promise<string> {
  // Ensure connection ID is set
  const connectionIdInput = page.locator('input#oauth-connection-id');
  await connectionIdInput.fill(connectionId);
  await page.waitForTimeout(300);
  
  // Intercept the initiate request to capture authUrl
  let authUrl = '';
  await page.route('**/api/mcp/oauth/initiate', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    authUrl = data.authUrl;
    await route.fulfill({ response, json: data });
  });
  
  // Click "Start OAuth Flow" button
  const startButton = page.getByRole('button', { name: /Start OAuth Flow/i });
  await startButton.click();
  
  // Wait for auth URL to be set
  await page.waitForTimeout(1500);
  
  return authUrl;
}

/**
 * Mock OAuth callback (simulate auth provider redirect)
 */
export async function simulateOAuthCallback(
  page: Page,
  apiBaseUrl: string,
  code: string,
  state: string
): Promise<void> {
  // Directly navigate to callback URL (simulates browser redirect from auth provider)
  const callbackUrl = `${apiBaseUrl}/mcp/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  await page.goto(callbackUrl);
}

/**
 * Wait for connection to appear in list
 */
export async function waitForConnectionInList(
  page: Page,
  connectionId: string,
  status: 'active' | 'pending' | 'expired'
): Promise<void> {
  // Wait for connections list to load
  const connectionsList = page.locator('[data-connections-list]');
  await connectionsList.waitFor({ timeout: 10_000 });
  
  // Find connection by ID
  const connectionRow = page.locator(`[data-connection-id="${connectionId}"]`);
  await connectionRow.waitFor({ state: 'visible', timeout: 10_000 });
  
  // Verify status badge exists (we mark active connections with the badge)
  const statusBadge = connectionRow.locator('[data-connection-status]');
  await statusBadge.waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Get connection status from API
 */
export async function getConnectionStatus(
  apiBaseUrl: string,
  connectionId: string
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/mcp/oauth/status?connection_id=${encodeURIComponent(connectionId)}`);
  const data = await response.json();
  return data.status;
}
