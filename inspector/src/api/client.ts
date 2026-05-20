const LEGACY_API_URL_KEY = "neotoma_inspector_api_url";
const LEGACY_AUTH_TOKEN_KEY = "neotoma_inspector_auth_token";
const API_URL_KEY_PREFIX = "neotoma_inspector_api_url";
const AUTH_TOKEN_KEY_PREFIX = "neotoma_inspector_auth_token";
const LOCAL_PROXY_BASE = "/api";

export type InspectorEnvironment = "dev" | "prod";

export function getInspectorEnvironment(): InspectorEnvironment {
  const env = import.meta.env.VITE_NEOTOMA_ENV;
  if (env === "prod" || env === "production") {
    return "prod";
  }
  return "dev";
}

/**
 * Prefer the API's resolved `NEOTOMA_ENV` (from `/server-info`) for UI that should
 * reflect the running server. Falls back to {@link getInspectorEnvironment} (Vite
 * `VITE_NEOTOMA_ENV`) when the server has not returned a value yet.
 */
export function resolveInspectorBadgeEnvironment(
  apiNeotomaEnv: string | undefined,
  viteInspectorEnv: InspectorEnvironment,
): InspectorEnvironment {
  if (apiNeotomaEnv == null || !String(apiNeotomaEnv).trim()) {
    return viteInspectorEnv;
  }
  const n = String(apiNeotomaEnv).trim().toLowerCase();
  if (n === "production" || n === "prod") {
    return "prod";
  }
  return "dev";
}

function getScopedStorageKey(prefix: string): string {
  return `${prefix}_${getInspectorEnvironment()}`;
}

function getStoredValue(prefix: string, legacyKey: string): string | null {
  const scopedKey = getScopedStorageKey(prefix);
  const scopedValue = localStorage.getItem(scopedKey);
  if (scopedValue) {
    return scopedValue;
  }

  const legacyValue = localStorage.getItem(legacyKey);
  if (legacyValue) {
    localStorage.setItem(scopedKey, legacyValue);
    localStorage.removeItem(legacyKey);
    return legacyValue;
  }

  return null;
}

function normalizeStoredUrl(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function isProxyDefaultEnabled(): boolean {
  return import.meta.env.DEV;
}

/**
 * Read the optional `<meta name="neotoma-api-base">` tag injected by a
 * Neotoma server when it serves this bundled SPA at `/inspector`. Lets the
 * same Inspector dist work as both a same-origin Neotoma mount and a
 * standalone GitHub Pages / sandbox deployment without rebuilding.
 */
function readSameOriginApiBaseFromMeta(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const meta = document.querySelector('meta[name="neotoma-api-base"]');
    const content = meta?.getAttribute("content")?.trim();
    return content || null;
  } catch {
    return null;
  }
}

export function getDefaultApiUrl(): string {
  if (import.meta.env.VITE_NEOTOMA_API_URL) {
    return import.meta.env.VITE_NEOTOMA_API_URL;
  }
  // Production bundles (e.g. GitHub Pages) are served from a public origin; browsers
  // block or gate fetches to loopback. Localhost defaults are only for Vite dev / Node.
  if (import.meta.env.PROD) {
    // When the SPA is served by a Neotoma server (bundled mount at /inspector),
    // the server injects `<meta name="neotoma-api-base">` with the resolved
    // origin so the SPA can default to same-origin requests without a baked
    // VITE_NEOTOMA_API_URL.
    const sameOriginBase = readSameOriginApiBaseFromMeta();
    if (sameOriginBase) return sameOriginBase;
    return "";
  }
  return getInspectorEnvironment() === "prod" ? "http://localhost:3180" : "http://localhost:3080";
}

/** User-visible hint when the hosted app has no API base URL yet. */
export const MISSING_API_URL_MESSAGE =
  "No Neotoma API URL configured. Open Settings and set your HTTPS API base URL.";

export function getSavedApiUrl(): string | null {
  const storedValue = normalizeStoredUrl(getStoredValue(API_URL_KEY_PREFIX, LEGACY_API_URL_KEY));
  if (!storedValue) {
    return null;
  }

  // Migrate older local-dev defaults back to the proxy-based default.
  if (isProxyDefaultEnabled() && storedValue === getDefaultApiUrl()) {
    clearApiUrl();
    return null;
  }

  return storedValue;
}

export function getApiUrl(): string {
  return getSavedApiUrl() || (isProxyDefaultEnabled() ? LOCAL_PROXY_BASE : getDefaultApiUrl());
}

/** True when requests should go to a configured base (saved URL, dev /api proxy, or baked VITE_NEOTOMA_API_URL). */
export function isApiUrlConfigured(): boolean {
  return Boolean(getApiUrl().trim());
}

function requireApiBase(): string {
  const base = getApiUrl().replace(/\/$/, "");
  if (!base) {
    throw new Error(MISSING_API_URL_MESSAGE);
  }
  return base;
}

export function setApiUrl(url: string) {
  const normalized = url.trim();
  if (!normalized) {
    clearApiUrl();
    return;
  }
  localStorage.setItem(getScopedStorageKey(API_URL_KEY_PREFIX), normalized);
}

export function clearApiUrl() {
  localStorage.removeItem(getScopedStorageKey(API_URL_KEY_PREFIX));
  localStorage.removeItem(LEGACY_API_URL_KEY);
}

export function getAuthToken(): string | null {
  return getStoredValue(AUTH_TOKEN_KEY_PREFIX, LEGACY_AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(getScopedStorageKey(AUTH_TOKEN_KEY_PREFIX), token);
}

export function clearAuthToken() {
  localStorage.removeItem(getScopedStorageKey(AUTH_TOKEN_KEY_PREFIX));
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}

function formatHttpErrorMessage(status: number, body: string, requestPath?: string): string {
  const raw = body.trim();
  if (!raw) return `HTTP ${status}`;

  const cannotRoute = raw.match(/Cannot (GET|POST|PUT|PATCH|DELETE)\s+(\S+)/);
  if (cannotRoute) {
    const p = (cannotRoute[2] ?? "").split("<")[0]?.trim() ?? cannotRoute[2];
    return (
      `HTTP ${status}: missing route ${p}. Rebuild the API (npm run build:server) and restart it, ` +
      `or run npm run watch:server / tsx watch src/actions.ts. Confirm Settings → API URL targets this Neotoma instance.`
    );
  }

  if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<html")) {
    let msg = `HTTP ${status}: server returned HTML instead of JSON — wrong API base URL or a proxy/front-end on that port.`;
    if (
      status === 404 &&
      requestPath &&
      requestPath.includes("/issues/") &&
      !requestPath.startsWith("/api/")
    ) {
      msg +=
        " If the API URL is correct, the running server may be an older build: run `npm run build:server` and restart the API (or save `src/actions.ts` if you use `tsx watch`) so `POST /issues/add_message` is registered.";
    }
    return msg;
  }

  try {
    const json = JSON.parse(raw) as { message?: string; error?: string };
    return json.message || json.error || `HTTP ${status}`;
  } catch {
    return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = requireApiBase();
  const url = `${base}${path}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatHttpErrorMessage(res.status, body, path));
  }
  return res.json() as Promise<T>;
}

export function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  let queryString = "";
  if (params) {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
    if (entries.length) {
      queryString = "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
    }
  }
  return request<T>(path + queryString);
}

function buildQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

export function buildApiUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const base = requireApiBase();
  return `${base}${path}${buildQueryString(params)}`;
}

/**
 * Fetch a non-JSON response body as text. Used by endpoints like
 * GET /entities/:id/markdown that return `text/markdown`.
 */
export async function getText(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<string> {
  const url = buildApiUrl(path, params);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.text();
}

export async function getBlob(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<Blob> {
  const url = buildApiUrl(path, params);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.blob();
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
