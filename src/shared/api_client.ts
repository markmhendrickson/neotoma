import createClient from "openapi-fetch";
import type { paths } from "./openapi_types.js";
import { getLocalTransportClient } from "./local_transport.js";

export interface ApiClientOptions {
  baseUrl?: string;
  token?: string;
  useOfflineFallback?: boolean;
  /**
   * When true, sign outbound requests with the CLI-side AAuth keypair at
   * `~/.neotoma/aauth/`. Silently falls back to unsigned `fetch` when no
   * keypair is configured so CLI callers that have not run
   * `neotoma auth keygen` are unaffected. Defaults to true in CLI
   * contexts and false in test / offline contexts.
   */
  signWithCliAAuth?: boolean;
}

/**
 * Build a `fetch` wrapper that attempts to sign outbound requests with the
 * CLI-side AAuth keypair. When signing is disabled or no keypair is
 * configured the returned function is the global `fetch` unchanged. This
 * indirection keeps Node-only `fs`/`jose` imports out of the browser
 * bundle via a dynamic import.
 */
function buildMaybeSignedFetch(enabled: boolean): typeof fetch {
  if (!enabled) return fetch;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL | Request).toString();
    const { cliSignedFetch } = await import("../cli/aauth_signer.js");
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = new Headers(init.headers);
      h.forEach((value, key) => {
        headers[key] = value;
      });
    }
    const body = typeof init?.body === "string" ? init.body : undefined;
    try {
      return await cliSignedFetch(url, {
        method,
        headers,
        body,
        signal: init?.signal ?? undefined,
      });
    } catch {
      // Never surface signing misconfiguration as a hard failure from the
      // API client — the caller should still reach the server and land
      // as `unverified_client` / `anonymous` tier.
      return fetch(input, init);
    }
  }) as typeof fetch;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const signingEnabled =
    options.signWithCliAAuth ??
    (process.env.NODE_ENV !== "test" &&
      process.env.NEOTOMA_CLI_AAUTH_DISABLE !== "1" &&
      process.env.NEOTOMA_CLI_AAUTH_ENABLE !== "0");
  const fetchImpl = buildMaybeSignedFetch(signingEnabled);

  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    headers,
    fetch: fetchImpl,
  });

  const defaultFallback =
    process.env.NODE_ENV === "test"
      ? false
      : process.env.NEOTOMA_ENABLE_OFFLINE_FALLBACK === "true" &&
        process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK !== "true";
  const shouldFallback = options.useOfflineFallback ?? defaultFallback;
  const forceLocal = process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT === "true";

  const canFallbackForPath = (path: string): boolean => path !== "/health";
  const isNetworkError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    const causeCode = (err.cause as { code?: string } | undefined)?.code;
    const message = err.message ?? "";
    return (
      message === "fetch failed" ||
      message.includes("ECONNREFUSED") ||
      message.includes("ECONNRESET") ||
      message.includes("timeout") ||
      causeCode === "ECONNREFUSED" ||
      causeCode === "ECONNRESET" ||
      causeCode === "ETIMEDOUT"
    );
  };

  const wrapMethod = <TMethod extends "GET" | "POST" | "PUT" | "DELETE">(method: TMethod) => {
    const original = client[method].bind(client) as (
      path: string,
      ...args: unknown[]
    ) => Promise<unknown>;
    return (async (path: string, ...args: unknown[]) => {
      if (forceLocal && canFallbackForPath(path)) {
        const localClient = await getLocalTransportClient({
          token: options.token,
          baseUrl: options.baseUrl,
        });
        const localMethod = localClient[method].bind(localClient) as (
          path: string,
          ...args: unknown[]
        ) => Promise<unknown>;
        return localMethod(path, ...args);
      }
      try {
        return await original(path, ...args);
      } catch (err) {
        if (!shouldFallback || !canFallbackForPath(path) || !isNetworkError(err)) {
          throw err;
        }
        const localClient = await getLocalTransportClient({
          token: options.token,
          baseUrl: options.baseUrl,
        });
        const localMethod = localClient[method].bind(localClient) as (
          path: string,
          ...args: unknown[]
        ) => Promise<unknown>;
        return localMethod(path, ...args);
      }
    }) as typeof client[TMethod];
  };

  return {
    ...client,
    GET: wrapMethod("GET"),
    POST: wrapMethod("POST"),
    PUT: wrapMethod("PUT"),
    DELETE: wrapMethod("DELETE"),
  };
}
