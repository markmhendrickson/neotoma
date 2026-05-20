import { get, post, type FetchOptions } from "../client";
import type { Observation, ObservationsQueryParams } from "@/types/api";

export function listObservations(
  params?: { user_id?: string; source_id?: string; entity_id?: string; limit?: number; offset?: number },
  fetch?: FetchOptions,
) {
  return get<{ observations: Observation[] }>("/observations", params as Record<string, string | number>, fetch);
}

export function queryObservations(params: ObservationsQueryParams, fetch?: FetchOptions) {
  return post<{ observations: Observation[]; total: number; limit: number; offset: number }>(
    "/observations/query",
    params,
    fetch,
  );
}

export function listObservationsForEntity(
  entityId: string,
  limit?: number,
  offset?: number,
  fetch?: FetchOptions,
) {
  return post<{ observations: Observation[] }>(
    "/list_observations",
    { entity_id: entityId, limit, offset },
    fetch,
  );
}

export function createObservation(data: Record<string, unknown>, fetch?: FetchOptions) {
  return post<Record<string, unknown>>("/observations/create", data, fetch);
}
