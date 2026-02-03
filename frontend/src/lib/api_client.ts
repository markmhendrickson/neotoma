import { createApiClient } from "@shared/api_client";

export function getApiClient(token?: string) {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  const isDev = import.meta.env.DEV || apiBase === window.location.origin || !apiBase;
  const baseUrl = isDev ? undefined : apiBase.replace(/\/$/, "");
  return createApiClient({ baseUrl, token });
}
