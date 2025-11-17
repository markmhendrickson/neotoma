import { useEffect, useMemo, useState } from 'react';

interface StorageQuotaState {
  usage: number | null;
  quota: number | null;
  loading: boolean;
  supported: boolean;
}

/**
 * Reads the browser's OPFS quota via `navigator.storage.estimate()`.
 * Accepts an arbitrary reload key (e.g., record count) to force re-fetches.
 */
export function useStorageQuota(reloadKey?: unknown) {
  const supported =
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.estimate === 'function';

  const [state, setState] = useState<StorageQuotaState>({
    usage: null,
    quota: null,
    loading: supported,
    supported,
  });

  useEffect(() => {
    if (!supported) return;

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    navigator.storage
      .estimate()
      .then((estimate) => {
        if (cancelled) return;
        setState({
          usage: estimate.usage ?? null,
          quota: estimate.quota ?? null,
          loading: false,
          supported,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ usage: null, quota: null, loading: false, supported });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, supported]);

  const usagePercent = useMemo(() => {
    if (!state.quota || !state.usage) return null;
    if (state.quota === 0) return null;
    return (state.usage / state.quota) * 100;
  }, [state.quota, state.usage]);

  return {
    ...state,
    usagePercent,
  };
}

