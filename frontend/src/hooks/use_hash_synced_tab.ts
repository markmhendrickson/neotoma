import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function safeDecodeHash(raw: string): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Syncs a tab value with `location.hash` (e.g. `#relationships`). Invalid or missing hash
 * falls back to `defaultTab`. Tab changes use `navigate(..., { replace: true })`.
 */
export function useHashSyncedTab(
  defaultTab: string,
  validTabs: readonly string[],
): { tab: string; setTab: (value: string) => void } {
  const location = useLocation();
  const navigate = useNavigate();
  const allowed = useMemo(() => new Set(validTabs), [validTabs]);

  const tab = useMemo(() => {
    const raw = (location.hash ?? "").replace(/^#/, "");
    const id = safeDecodeHash(raw);
    if (id && allowed.has(id)) return id;
    return defaultTab;
  }, [location.hash, allowed, defaultTab]);

  const setTab = useCallback(
    (value: string) => {
      if (!allowed.has(value)) return;
      const nextHash = `#${encodeURIComponent(value)}`;
      if (location.hash === nextHash) return;
      navigate(`${location.pathname}${location.search}${nextHash}`, { replace: true });
    },
    [allowed, location.hash, location.pathname, location.search, navigate],
  );

  return { tab, setTab };
}
