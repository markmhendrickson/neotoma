import { get, post } from "../client";
import type { Observation, ObservationsQueryParams } from "@/types/api";

export function listObservations(params?: { user_id?: string; source_id?: string; entity_id?: string; limit?: number; offset?: number }) {
  return get<{ observations: Observation[] }>("/observations", params as Record<string, string | number>);
}

export function queryObservations(params: ObservationsQueryParams) {
  return post<{ observations: Observation[]; total: number; limit: number; offset: number }>("/observations/query", params);
}

export function listObservationsForEntity(entityId: string, limit?: number, offset?: number) {
  return post<{ observations: Observation[] }>("/list_observations", { entity_id: entityId, limit, offset });
}

export function createObservation(data: Record<string, unknown>) {
  return post<Record<string, unknown>>("/observations/create", data);
}
