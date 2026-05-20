import { get } from "../client";
import type { UsageStats } from "@/types/api";

export function getUsage() {
  return get<UsageStats>("/usage");
}
