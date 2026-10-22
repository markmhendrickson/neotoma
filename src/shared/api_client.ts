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
  /**
   * When true with `signWithCliAAuth`, do not fall back to unsigned `fetch`
   * on missing/unusable keys or signing errors. Intended for unattended
   * paths (`issues sync` env-gated AAuth, `api --aauth`) where silent
   * anonymous requests would mask misconfiguration. Optional interactive
   * signing keeps the default silent fallback.
   */
  requireCliAAuth?: boolean;
  /**
   * Force the HTTP transport even when `NEOTOMA_FORCE_LOCAL_TRANSPORT=true`.
   * The in-process local transport never makes an HTTP request, so RFC 9421
   * request signing has nothing to sign — AAuth-attributed calls MUST go over
   * HTTP. Setting this also disables the offline→local fallback (which would
   * likewise bypass signing). Pairs with `signWithCliAAuth`.
   */
  forceHttpTransport?: boolean;
}

/**
 * Build a `fetch` wrapper that attempts to sign outbound requests with the
 * CLI-side AAuth keypair. When signing is disabled or no keypair is
 * configured the returned function is the global `fetch` unchanged. This
 * indirection keeps Node-only `fs`/`jose` imports out of the browser
 * bundle via a dynamic import.
 */
function buildMaybeSignedFetch(enabled: boolean, requireCliAAuth = false): typeof fetch {
  if (!enabled) return fetch;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : typeof input === "string" ? input : input.toString();
    const { cliSignedFetch, loadCliSignerConfig } = await import("../cli/aauth_signer.js");
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    const sourceHeaders = new Headers(request?.headers);
    if (init?.headers) {
      const overrides = new Headers(init.headers);
      overrides.forEach((value, key) => {
        sourceHeaders.set(key, value);
      });
    }
    if (sourceHeaders) {
      const h = new Headers(sourceHeaders);
      h.forEach((value, key) => {
        headers[key] = value;
      });
    }
    let body = typeof init?.body === "string" ? init.body : undefined;
    if (body === undefined && request && method !== "GET" && method !== "HEAD") {
      body = await request.clone().text();
    }
    try {
      if (requireCliAAuth) {
        const signerConfig = await loadCliSignerConfig();
        if (!signerConfig) {
          throw new Error(
            "AAuth signing is required but no usable CLI keypair was found. " +
              "Set NEOTOMA_AAUTH_PRIVATE_JWK_PATH to a valid private JWK, or run `neotoma auth keygen`."
          );
        }
      }
      return await cliSignedFetch(url, {
        method,
        headers,
        body,
        signal: init?.signal ?? undefined,
      });
    } catch (err) {
      if (requireCliAAuth) throw err;
      // Never surface signing misconfiguration as a hard failure from the
      // API client — the caller should still reach the server and land
      // as `unverified_client` / `anonymous` tier.
      return fetch(input, init);
    }
  }) as typeof fetch;
}

export type NeotomaApiClient = ReturnType<typeof createApiClient>;

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
  const fetchImpl = buildMaybeSignedFetch(signingEnabled, Boolean(options.requireCliAAuth));

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
  const shouldFallback = options.forceHttpTransport
    ? false
    : (options.useOfflineFallback ?? defaultFallback);
  const forceLocal =
    !options.forceHttpTransport && process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT === "true";

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
    }) as (typeof client)[TMethod];
  };

  return {
    ...client,
    GET: wrapMethod("GET"),
    POST: wrapMethod("POST"),
    PUT: wrapMethod("PUT"),
    DELETE: wrapMethod("DELETE"),
  };
}
