import { get, post } from "../client";
import type { ServerInfo, UserInfo, HealthCheckResult } from "@/types/api";

export function healthCheck() {
  return get<{ ok: boolean }>("/health");
}

export function getServerInfo() {
  return get<ServerInfo>("/server-info");
}

export function getMe() {
  return get<UserInfo>("/me");
}

export function getAuthenticatedUser() {
  return post<UserInfo>("/get_authenticated_user", {});
}

export function healthCheckSnapshots(autoFix = false) {
  return post<HealthCheckResult>("/health_check_snapshots", { auto_fix: autoFix });
}
