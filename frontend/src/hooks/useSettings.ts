import { useState } from 'react';

export interface Settings {
  apiBase: string;
  bearerToken: string;
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

  const saveSettings = (newSettings: Settings) => {
    try {
      localStorage.setItem('apiBase', newSettings.apiBase);
      localStorage.setItem('bearerToken', newSettings.bearerToken);
      setSettings(newSettings);
    } catch (e) {
      console.warn('Failed to save settings', e);
    }
  };

  return { settings, saveSettings };
}

