import createClient from "openapi-fetch";
import type { paths } from "./openapi_types.js";

export interface ApiClientOptions {
  baseUrl?: string;
  token?: string;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers,
  });
}
