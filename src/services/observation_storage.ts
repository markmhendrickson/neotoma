/**
 * Observation Storage Service (Domain Layer)
 *
 * Handles observation CRUD operations, providing a clean domain interface
 * so that Presentation (actions.ts) and Application (server.ts) layers
 * do not access the database directly for observation operations.
 */

import { db } from "../db.js";
import { generateObservationId } from "./observation_identity.js";

export interface CreateObservationParams {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number;
  source_priority: number;
  fields: Record<string, unknown>;
  user_id: string;
  idempotency_key?: string | null;
}

export interface ObservationRecord {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number;
  source_priority: number;
  fields: Record<string, unknown>;
  user_id: string;
  created_at: string;
}

export async function createObservation(
  params: CreateObservationParams
): Promise<ObservationRecord> {
  const observationId = generateObservationId(
    params.source_id,
    params.interpretation_id,
    params.entity_id,
    params.fields,
    params.idempotency_key
  );

  const row = {
    id: observationId,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    schema_version: params.schema_version,
    source_id: params.source_id,
    interpretation_id: params.interpretation_id,
    observed_at: params.observed_at,
    specificity_score: params.specificity_score,
    source_priority: params.source_priority,
    fields: params.fields,
    user_id: params.user_id,
    created_at: new Date().toISOString(),
  };

  if (params.idempotency_key) {
    (row as Record<string, unknown>).idempotency_key = params.idempotency_key;
  }

  const { data, error } = await db
    .from("observations")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create observation: ${error.message}`);
  }

  return data as ObservationRecord;
}

export async function listObservationsForEntity(
  entityId: string,
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ data: ObservationRecord[]; count: number }> {
  let query = db
    .from("observations")
    .select("*", { count: "exact" })
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .order("observed_at", { ascending: false });

  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.range(options.offset, (options.offset ?? 0) + (options.limit ?? 50) - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list observations: ${error.message}`);
  return { data: (data || []) as ObservationRecord[], count: count ?? 0 };
}

export async function listObservationsForSource(
  sourceId: string,
  userId: string
): Promise<ObservationRecord[]> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .eq("source_id", sourceId)
    .eq("user_id", userId)
    .order("observed_at", { ascending: false });

  if (error) throw new Error(`Failed to list observations for source: ${error.message}`);
  return (data || []) as ObservationRecord[];
}

export async function getObservationsByIds(
  ids: string[],
  userId: string
): Promise<ObservationRecord[]> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .in("id", ids)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to get observations by IDs: ${error.message}`);
  return (data || []) as ObservationRecord[];
}

export async function rewriteObservationEntityId(
  fromEntityId: string,
  toEntityId: string,
  userId: string
): Promise<number> {
  const { data, error } = await db
    .from("observations")
    .update({ entity_id: toEntityId })
    .eq("entity_id", fromEntityId)
    .eq("user_id", userId)
    .select("id");

  if (error) throw new Error(`Failed to rewrite observations: ${error.message}`);
  return data?.length || 0;
}

export async function hasObservationsForEntity(
  entityId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("observations")
    .select("id")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .limit(1);

  if (error) throw new Error(`Failed to check observations: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
