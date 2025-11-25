import type { Page } from '@playwright/test';
import type { Settings } from '../../frontend/src/hooks/useSettings';
import { buildSampleRecords, SAMPLE_RECORD_STORAGE_KEY } from '../../frontend/src/sample-data/sample-records';
import type { LocalRecord } from '../../frontend/src/store/types';

type WindowWithSeeds = Window & {
  seedNeotomaSamples?: (options?: { force?: boolean }) => Promise<void>;
};

const DEFAULT_SETTINGS: Settings = {
  apiBase: '',
  bearerToken: 'mock-e2e-bearer',
  cloudStorageEnabled: false,
  csvRowRecordsEnabled: true,
};

export async function clearClientState(page: Page, originPath = '/'): Promise<void> {
  try {
    await page.goto(originPath, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    console.warn('[clearClientState] Failed to load origin before clearing storage:', error);
  }

  await page.evaluate(async () => {
    try {
      localStorage?.clear();
      sessionStorage?.clear();
    } catch (error) {
      console.warn('[clearClientState] Unable to access web storage:', error);
    }
    try {
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
    } catch (error) {
      console.warn('[clearClientState] Unable to clear IndexedDB:', error);
    }
  });

  await page.goto('about:blank');
}

export async function primeLocalSettings(
  page: Page,
  overrides: Partial<Settings> = {},
): Promise<void> {
  const payload: Settings = {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
  await page.addInitScript((settings: Settings) => {
    try {
      localStorage.setItem('apiBase', settings.apiBase);
      localStorage.setItem('bearerToken', settings.bearerToken);
      localStorage.setItem('cloudStorageEnabled', String(settings.cloudStorageEnabled));
      localStorage.setItem('apiSyncEnabled', String(settings.cloudStorageEnabled));
      localStorage.setItem('csvRowRecordsEnabled', String(settings.csvRowRecordsEnabled));
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

export async function markSamplesSeeded(page: Page, value = 'true'): Promise<void> {
  await page.addInitScript(
    ({ key, marker }) => {
      try {
        localStorage.setItem(key, marker);
      } catch {
        // ignore
      }
    },
    { key: SAMPLE_RECORD_STORAGE_KEY, marker: value },
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
  const uploadButton = page.getByRole('button', { name: 'Upload file' }).first();
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
  const sampleSummary = buildSampleRecords()[0]?.summary;
  if (sampleSummary) {
    await page
      .getByText(sampleSummary, { exact: false })
      .first()
      .waitFor({ state: 'attached', timeout: 30_000 });
  } else {
    await page.waitForTimeout(500);
  }
}

export async function getSampleRecords(): Promise<LocalRecord[]> {
  return buildSampleRecords();
}

export { SAMPLE_RECORD_STORAGE_KEY };

