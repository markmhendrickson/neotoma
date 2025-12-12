/**
 * Observation-Aware Ingestion Pipeline (FU-058)
 *
 * Integrates observation creation into ingestion pipeline.
 */

import { supabase } from "../db.js";
import { extractEntities, resolveEntity } from "./entity_resolution.js";
import { observationReducer } from "../reducers/observation_reducer.js";
import { schemaRegistry } from "./schema_registry.js";
import { emitRecordCreated } from "../events/event_emitter.js";
import type { NeotomaRecord } from "../db.js";

export interface ObservationCreationResult {
  record: NeotomaRecord;
  observations: Array<{
    id: string;
    entity_id: string;
    entity_type: string;
  }>;
  snapshotUpdated: boolean;
}

/**
 * Create observations from record and trigger reducer
 */
export async function createObservationsFromRecord(
  record: NeotomaRecord,
  userId: string = "00000000-0000-0000-0000-000000000000" // Default for v0.1.0 single-user
): Promise<ObservationCreationResult> {
  const entities = extractEntities(record.properties, record.type);
  const observations = [];

  // Load active schema for entity types
  const entityTypes = new Set(entities.map((e) => e.entity_type));
  const schemaMap = new Map<string, any>();

  for (const entityType of entityTypes) {
    const schema = await schemaRegistry.loadActiveSchema(entityType);
    if (schema) {
      schemaMap.set(entityType, schema);
    }
  }

  // Resolve entities and create observations
  for (const entity of entities) {
    const resolved = await resolveEntity(entity.entity_type, entity.raw_value);
    const schema = schemaMap.get(entity.entity_type);
    const schemaVersion = schema?.schema_version || "1.0";

    // Separate known fields from unknown fields
    const knownFields: Record<string, unknown> = {};
    const unknownFields: Record<string, unknown> = {};

    if (schema) {
      const schemaFields = Object.keys(schema.schema_definition.fields);
      for (const [key, value] of Object.entries(record.properties)) {
        if (schemaFields.includes(key)) {
          knownFields[key] = value;
        } else {
          unknownFields[key] = value;
        }
      }
    } else {
      // No schema - treat all as known for now
      Object.assign(knownFields, record.properties);
    }

    // Store raw fragments for unknown fields
    if (Object.keys(unknownFields).length > 0) {
      for (const [key, value] of Object.entries(unknownFields)) {
        await supabase.from("raw_fragments").insert({
          record_id: record.id,
          fragment_type: "unknown_field",
          fragment_key: key,
          fragment_value: value,
          fragment_envelope: {
            type: typeof value,
            confidence: 0.5,
          },
          frequency_count: 1,
        });
      }
    }

    // Create observation
    const observedAt = new Date().toISOString();
    const { data: observationData, error: obsError } = await supabase
      .from("observations")
      .insert({
        entity_id: resolved.id,
        entity_type: resolved.entity_type,
        schema_version: schemaVersion,
        source_record_id: record.id,
        observed_at: observedAt,
        specificity_score: 0.8, // Default specificity
        source_priority: 0, // Default priority
        fields: knownFields,
        user_id: userId,
      })
      .select()
      .single();

    if (obsError) {
      console.error(`Failed to create observation: ${obsError.message}`);
      continue;
    }

    if (observationData) {
      observations.push({
        id: observationData.id,
        entity_id: resolved.id,
        entity_type: resolved.entity_type,
      });
    }
  }

  // Trigger reducer for each entity
  let snapshotUpdated = false;
  for (const obs of observations) {
    try {
      // Get all observations for entity
      const { data: allObservations } = await supabase
        .from("observations")
        .select("*")
        .eq("entity_id", obs.entity_id)
        .order("observed_at", { ascending: true });

      if (allObservations && allObservations.length > 0) {
        // Compute snapshot
        const snapshot = await observationReducer.computeSnapshot(
          obs.entity_id,
          allObservations as any
        );

        // Save snapshot
        await supabase.from("entity_snapshots").upsert(
          {
            entity_id: snapshot.entity_id,
            entity_type: snapshot.entity_type,
            schema_version: snapshot.schema_version,
            snapshot: snapshot.snapshot,
            computed_at: snapshot.computed_at,
            observation_count: snapshot.observation_count,
            last_observation_at: snapshot.last_observation_at,
            provenance: snapshot.provenance,
            user_id: snapshot.user_id,
          },
          {
            onConflict: "entity_id",
          }
        );

        snapshotUpdated = true;
      }
    } catch (error) {
      console.error(
        `Failed to compute snapshot for entity ${obs.entity_id}:`,
        error
      );
    }
  }

  // Emit state event for observation creation (FU-050 integration)
  try {
    await emitRecordCreated(record);
  } catch (error) {
    console.error("Failed to emit record created event:", error);
  }

  return {
    record,
    observations,
    snapshotUpdated,
  };
}






