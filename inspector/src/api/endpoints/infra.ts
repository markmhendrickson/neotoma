import { get, post, type FetchOptions } from "../client";
import type { ServerInfo, UserInfo, HealthCheckResult } from "@/types/api";

export function healthCheck(fetch?: FetchOptions) {
  return get<{ ok: boolean }>("/health", undefined, fetch);
}

export function getServerInfo(fetch?: FetchOptions) {
  return get<ServerInfo>("/server-info", undefined, fetch);
}

export function getMe(fetch?: FetchOptions) {
  return get<UserInfo>("/me", undefined, fetch);
}

export function getAuthenticatedUser(fetch?: FetchOptions) {
  return post<UserInfo>("/get_authenticated_user", {}, fetch);
}

export function healthCheckSnapshots(autoFix = false, fetch?: FetchOptions) {
  return post<HealthCheckResult>("/health_check_snapshots", { auto_fix: autoFix }, fetch);
}
