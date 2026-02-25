import createClient from "openapi-fetch";
import type { paths } from "./openapi_types.js";
import { getLocalTransportClient } from "./local_transport.js";

export interface ApiClientOptions {
  baseUrl?: string;
  token?: string;
  useOfflineFallback?: boolean;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    headers,
  });

  const defaultFallback =
    process.env.NODE_ENV === "test" ? false : process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK !== "true";
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
