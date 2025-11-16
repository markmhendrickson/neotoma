import { useState, useCallback } from 'react';

export interface Settings {
  apiBase: string;
  bearerToken: string; // Derived from Ed25519 public key
  apiSyncEnabled: boolean; // Whether to sync records to API
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const apiSyncEnabled = localStorage.getItem('apiSyncEnabled');
      // Default to current origin in development (uses Vite proxy)
      // Only use stored value if it exists and is different from default
      const storedApiBase = localStorage.getItem('apiBase');
      const defaultApiBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
      return {
        apiBase: storedApiBase || defaultApiBase,
        bearerToken: localStorage.getItem('bearerToken') || '',
        apiSyncEnabled: apiSyncEnabled !== null ? apiSyncEnabled === 'true' : false,
      };
    } catch {
      return {
        apiBase: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080',
        bearerToken: '',
        apiSyncEnabled: false,
      };
    }
  });

  const saveSettings = useCallback((newSettings: Partial<Settings>) => {
    try {
      if (newSettings.apiBase !== undefined) {
        localStorage.setItem('apiBase', newSettings.apiBase);
      }
      if (newSettings.bearerToken !== undefined) {
        localStorage.setItem('bearerToken', newSettings.bearerToken);
      }
      if (newSettings.apiSyncEnabled !== undefined) {
        localStorage.setItem('apiSyncEnabled', String(newSettings.apiSyncEnabled));
      }
      setSettings(prev => ({ ...prev, ...newSettings }));
    } catch (e) {
      console.warn('Failed to save settings', e);
    }
  }, []);

  const updateBearerToken = useCallback((token: string) => {
    saveSettings({ bearerToken: token });
  }, [saveSettings]);

  return { settings, saveSettings, updateBearerToken };
}

