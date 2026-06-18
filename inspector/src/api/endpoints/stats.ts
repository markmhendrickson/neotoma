import { get, type FetchOptions } from "../client";
import type { DashboardStats } from "@/types/api";

export function getStats(fetch?: FetchOptions) {
  return get<DashboardStats>("/stats", undefined, fetch);
}
