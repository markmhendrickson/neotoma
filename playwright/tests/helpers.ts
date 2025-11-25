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
