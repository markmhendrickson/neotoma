import { useState, useCallback } from 'react';

export interface Settings {
  apiBase: string;
  bearerToken: string; // Derived from Ed25519 public key
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return {
        apiBase: localStorage.getItem('apiBase') || window.location.origin,
        bearerToken: localStorage.getItem('bearerToken') || '',
      };
    } catch {
      return {
        apiBase: window.location.origin,
        bearerToken: '',
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

