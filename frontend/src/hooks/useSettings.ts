import { useCallback, useSyncExternalStore } from 'react';

export interface Settings {
  apiBase: string;
  bearerToken: string; // Derived from Ed25519 public key
  cloudStorageEnabled: boolean; // Whether to store files/records in Supabase
  csvRowRecordsEnabled: boolean; // Whether CSV uploads expand to per-row records
  apiSyncEnabled: boolean; // Legacy alias for cloudStorageEnabled
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
      apiSyncEnabled: resolvedCloudSetting !== null ? resolvedCloudSetting === 'true' : false,
      csvRowRecordsEnabled: csvRowRecordsEnabled !== null ? csvRowRecordsEnabled === 'true' : true,
    };
  } catch {
    return {
      apiBase: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080',
      bearerToken: '',
      cloudStorageEnabled: false,
      apiSyncEnabled: false,
      csvRowRecordsEnabled: true,
    };
  }
}

function normalizeSettingsPatch(partial: Partial<Settings>): Partial<Settings> {
  const normalized = { ...partial };
  if (normalized.apiSyncEnabled !== undefined && normalized.cloudStorageEnabled === undefined) {
    normalized.cloudStorageEnabled = normalized.apiSyncEnabled;
  }
  if (normalized.cloudStorageEnabled !== undefined && normalized.apiSyncEnabled === undefined) {
    normalized.apiSyncEnabled = normalized.cloudStorageEnabled;
  }
  return normalized;
}

type SettingsListener = () => void;

let cachedSettings: Settings = readSettingsFromStorage();
const listeners = new Set<SettingsListener>();

function persistSettings(partial: Partial<Settings>) {
  const normalized = normalizeSettingsPatch(partial);
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    if (normalized.apiBase !== undefined) {
      storage.setItem('apiBase', normalized.apiBase);
    }
    if (normalized.bearerToken !== undefined) {
      storage.setItem('bearerToken', normalized.bearerToken);
    }
    if (normalized.cloudStorageEnabled !== undefined) {
      storage.setItem('cloudStorageEnabled', String(normalized.cloudStorageEnabled));
      storage.setItem('apiSyncEnabled', String(normalized.cloudStorageEnabled));
    }
    if (normalized.csvRowRecordsEnabled !== undefined) {
      storage.setItem('csvRowRecordsEnabled', String(normalized.csvRowRecordsEnabled));
    }
  } catch (error) {
    console.warn('Failed to persist settings', error);
  }
}

function updateCachedSettings(partial: Partial<Settings>) {
  const normalized = normalizeSettingsPatch(partial);
  cachedSettings = { ...cachedSettings, ...normalized };
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

