import { get, type FetchOptions } from "../client";
import type { RecordActivityItem } from "@/types/api";

export function listRecordActivity(
  params?: {
    limit?: number;
    offset?: number;
    /** Comma-separated `record_type` values; omit for all types. */
    record_types?: string;
  },
  fetch?: FetchOptions,
) {
  return get<{
    items: RecordActivityItem[];
    has_more: boolean;
    limit: number;
    offset: number;
  }>("/record_activity", params as Record<string, string | number>, fetch);
}
