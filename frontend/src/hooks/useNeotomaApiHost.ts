import { useCallback, useState } from "react";

const STORAGE_KEY = "neotoma-api-host";

function getStoredApiHost(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Persisted Neotoma API host (tunnel or domain, no protocol).
 * Shared across integration pages and survives refresh.
 */
export function useNeotomaApiHost(): [string, (value: string) => void] {
  const [apiHost, setApiHostState] = useState(getStoredApiHost);
  const setApiHost = useCallback((value: string) => {
    setApiHostState(value);
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, value);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);
  return [apiHost, setApiHost];
}
