import { useCallback, useSyncExternalStore } from 'react';

export interface Settings {
  apiBase: string;
  bearerToken: string; // Derived from Ed25519 public key
  cloudStorageEnabled: boolean; // Whether to store files/records in Supabase
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
    const cloudStorageEnabledValue = storage?.getItem('cloudStorageEnabled');
    const legacyApiSyncEnabled = storage?.getItem('apiSyncEnabled');
    const csvRowRecordsEnabled = storage?.getItem('csvRowRecordsEnabled');
    const storedApiBase = storage?.getItem('apiBase');
    const defaultApiBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
    const resolvedCloudSetting = cloudStorageEnabledValue ?? legacyApiSyncEnabled;
    return {
      apiBase: storedApiBase || defaultApiBase,
      bearerToken: storage?.getItem('bearerToken') || '',
      cloudStorageEnabled: resolvedCloudSetting !== null ? resolvedCloudSetting === 'true' : false,
      csvRowRecordsEnabled: csvRowRecordsEnabled !== null ? csvRowRecordsEnabled === 'true' : true,
    };
  } catch {
    return {
      apiBase: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080',
      bearerToken: '',
      cloudStorageEnabled: false,
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
    if (partial.cloudStorageEnabled !== undefined) {
      storage.setItem('cloudStorageEnabled', String(partial.cloudStorageEnabled));
      // Keep legacy key in sync for older builds that still read apiSyncEnabled
      storage.setItem('apiSyncEnabled', String(partial.cloudStorageEnabled));
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

