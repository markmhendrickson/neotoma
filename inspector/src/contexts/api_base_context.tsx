/**
 * ApiBaseContext — Phase 1 of inspector embed support (#1606).
 *
 * Threads a configurable API base URL through the component tree so that
 * embedded/isolated views (e.g. /embed/graph) can target an arbitrary origin
 * instead of always reading from localStorage / the Vite proxy default.
 *
 * Default behavior (no provider, or provider with no `apiBase` override) is
 * identical to the existing `getApiUrl()` path — zero behavior change for the
 * normal Inspector shell.
 */
import { createContext, useContext, type ReactNode } from "react";
import { getApiUrl } from "@/api/client";

export type ApiBaseContextValue = {
  /** Resolved API base URL (no trailing slash). Never empty in a configured context. */
  apiBase: string;
};

const ApiBaseContext = createContext<ApiBaseContextValue | null>(null);

/**
 * Consume the nearest ApiBaseContext, falling back to `getApiUrl()` when no
 * provider is mounted. This means existing hooks/components that do NOT use
 * this context continue working exactly as before.
 */
export function useApiBase(): string {
  const ctx = useContext(ApiBaseContext);
  return ctx?.apiBase ?? getApiUrl();
}

type ApiBaseProviderProps = {
  /**
   * Override the API base for all descendants. When omitted or empty, the
   * provider is transparent — descendants fall back to `getApiUrl()`.
   */
  apiBase?: string;
  children: ReactNode;
};

/**
 * Provide an explicit API base to a subtree. Used by the embed routes to
 * inject a `?apiBase=` query-param value without touching localStorage.
 *
 * Mounting this with no `apiBase` prop (or an empty string) is a no-op:
 * descendants see the same result as without any provider.
 */
export function ApiBaseProvider({ apiBase, children }: ApiBaseProviderProps) {
  const normalized = apiBase?.trim().replace(/\/$/, "") || "";
  const value: ApiBaseContextValue | null = normalized
    ? { apiBase: normalized }
    : null;

  if (value === null) {
    // No override — skip the context layer entirely so downstream reads go to
    // the default getApiUrl() path, preserving existing behavior exactly.
    return <>{children}</>;
  }

  return (
    <ApiBaseContext.Provider value={value}>{children}</ApiBaseContext.Provider>
  );
}
