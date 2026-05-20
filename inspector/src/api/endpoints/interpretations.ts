import { get, type FetchOptions } from "../client";
import type { Interpretation } from "@/types/api";

export function listInterpretations(
  params?: { source_id?: string; limit?: number; offset?: number },
  fetch?: FetchOptions,
) {
  return get<{ interpretations: Interpretation[] }>(
    "/interpretations",
    params as Record<string, string | number>,
    fetch,
  );
}
