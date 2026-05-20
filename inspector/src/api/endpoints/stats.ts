import { get } from "../client";
import type { DashboardStats } from "@/types/api";

export function getStats() {
  return get<DashboardStats>("/stats");
}
