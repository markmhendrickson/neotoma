import { useState } from 'react';

export interface Settings {
  apiBase: string;
  bearerToken: string;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return {
        apiBase: localStorage.getItem('apiBase') || 'http://localhost:8080',
        bearerToken: localStorage.getItem('bearerToken') || '',
      };
    } catch {
      return {
        apiBase: 'http://localhost:8080',
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

