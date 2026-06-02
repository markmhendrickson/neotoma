import { get, type FetchOptions } from "../client";
import type { UsageStats } from "@/types/api";

export function getUsage(fetch?: FetchOptions) {
  return get<UsageStats>("/usage", undefined, fetch);
}
