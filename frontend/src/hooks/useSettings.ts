import { useCallback, useSyncExternalStore } from 'react';

export interface Settings {
  apiBase: string;
  bearerToken: string; // Derived from Ed25519 public key
  apiSyncEnabled: boolean; // Whether to sync records to API
  csvRowRecordsEnabled: boolean; // Whether CSV uploads expand to per-row records
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore
  }
  return null;
}

function readSettingsFromStorage(): Settings {
  const storage = getStorage();
  try {
    const apiSyncEnabled = storage?.getItem('apiSyncEnabled');
    const csvRowRecordsEnabled = storage?.getItem('csvRowRecordsEnabled');
    const storedApiBase = storage?.getItem('apiBase');
    const defaultApiBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
    return {
      apiBase: storedApiBase || defaultApiBase,
      bearerToken: storage?.getItem('bearerToken') || '',
      apiSyncEnabled: apiSyncEnabled !== null ? apiSyncEnabled === 'true' : false,
      csvRowRecordsEnabled: csvRowRecordsEnabled !== null ? csvRowRecordsEnabled === 'true' : true,
    };
  } catch {
    return {
      apiBase: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080',
      bearerToken: '',
      apiSyncEnabled: false,
      csvRowRecordsEnabled: true,
    };
  }
}

type SettingsListener = () => void;

let cachedSettings: Settings = readSettingsFromStorage();
const listeners = new Set<SettingsListener>();

function persistSettings(partial: Partial<Settings>) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    if (partial.apiBase !== undefined) {
      storage.setItem('apiBase', partial.apiBase);
    }
    if (partial.bearerToken !== undefined) {
      storage.setItem('bearerToken', partial.bearerToken);
    }
    if (partial.apiSyncEnabled !== undefined) {
      storage.setItem('apiSyncEnabled', String(partial.apiSyncEnabled));
    }
    if (partial.csvRowRecordsEnabled !== undefined) {
      storage.setItem('csvRowRecordsEnabled', String(partial.csvRowRecordsEnabled));
    }
  } catch (error) {
    console.warn('Failed to persist settings', error);
  }
}

function updateCachedSettings(partial: Partial<Settings>) {
  cachedSettings = { ...cachedSettings, ...partial };
  listeners.forEach(listener => listener());
}

export function useSettings() {
  const settings = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cachedSettings,
    () => cachedSettings
  );

  const saveSettings = useCallback((newSettings: Partial<Settings>) => {
    persistSettings(newSettings);
    updateCachedSettings(newSettings);
  }, []);

  const updateBearerToken = useCallback((token: string) => {
    saveSettings({ bearerToken: token });
  }, [saveSettings]);

  return { settings, saveSettings, updateBearerToken };
}

