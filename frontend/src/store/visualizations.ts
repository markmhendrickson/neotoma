import { useSyncExternalStore } from 'react';
import type { VisualizationRequest, VisualizationGraphType } from '@/types/visualization';

const STORAGE_KEY = 'chatVisualizations';

export interface VisualizationPreferences {
  selectedGraphType?: VisualizationGraphType;
  dimensionFieldKey?: string;
  measureFieldKeys?: string[];
}

export interface VisualizationEntry {
  messageId: string;
  request: VisualizationRequest;
  createdAt: string;
  updatedAt: string;
  dismissed?: boolean;
  preferences?: VisualizationPreferences;
}

export interface VisualizationState {
  entries: Record<string, VisualizationEntry>;
  lastViewedId?: string;
}

const getStorage = (): Storage | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore
  }
  return null;
};

const loadState = (): VisualizationState => {
  const storage = getStorage();
  if (!storage) {
    return { entries: {} };
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { entries: {} };
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        entries: typeof parsed.entries === 'object' && parsed.entries !== null ? parsed.entries : {},
        lastViewedId: typeof parsed.lastViewedId === 'string' ? parsed.lastViewedId : undefined,
      };
    }
    return { entries: {} };
  } catch (error) {
    console.warn('[visualizations] Failed to read cache', error);
    return { entries: {} };
  }
};

let state: VisualizationState = loadState();
const listeners = new Set<() => void>();

const persistState = () => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[visualizations] Failed to persist cache', error);
  }
};

const emit = () => {
  persistState();
  listeners.forEach(listener => listener());
};

const setState = (updater: (prev: VisualizationState) => VisualizationState) => {
  state = updater(state);
  emit();
};

export const subscribeVisualizations = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getVisualizationState = (): VisualizationState => state;

export const registerVisualization = (messageId: string, request: VisualizationRequest) => {
  if (!messageId) return;
  setState(prev => {
    const existing = prev.entries[messageId];
    const timestamp = new Date().toISOString();
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [messageId]: {
          messageId,
          request,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          dismissed: false,
          preferences: existing?.preferences,
        },
      },
      lastViewedId: prev.lastViewedId ?? messageId,
    };
  });
};

export const updateVisualizationPreferences = (
  messageId: string,
  preferences: Partial<VisualizationPreferences>
) => {
  if (!messageId || !preferences || Object.keys(preferences).length === 0) {
    return;
  }
  setState(prev => {
    const existing = prev.entries[messageId];
    if (!existing) {
      return prev;
    }
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [messageId]: {
          ...existing,
          updatedAt: new Date().toISOString(),
          preferences: {
            ...existing.preferences,
            ...preferences,
          },
        },
      },
    };
  });
};

export const dismissVisualization = (messageId: string) => {
  if (!messageId) return;
  setState(prev => {
    const existing = prev.entries[messageId];
    if (!existing) {
      return prev;
    }
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [messageId]: {
          ...existing,
          dismissed: true,
          updatedAt: new Date().toISOString(),
        },
      },
      lastViewedId: prev.lastViewedId === messageId ? undefined : prev.lastViewedId,
    };
  });
};

export const setLastViewedVisualization = (messageId: string | undefined) => {
  setState(prev => ({
    ...prev,
    lastViewedId: messageId,
  }));
};

export const useVisualizations = () => {
  const snapshot = useSyncExternalStore(
    subscribeVisualizations,
    getVisualizationState,
    getVisualizationState
  );
  return snapshot;
};

export function __resetVisualizationsStoreForTest() {
  state = { entries: {} };
  emit();
}

