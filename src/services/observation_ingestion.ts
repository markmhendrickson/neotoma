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
import type { PayloadSubmission } from "./payload_schema.js";
import type { Capability } from "./capability_registry.js";

// Sentinel payload ID used for legacy v0.1.0 observation flows that operate
// directly on records without an explicit payload submission.
const LEGACY_OBSERVATION_PAYLOAD_ID =
  "00000000-0000-0000-0000-000000000000";

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
  userId: string = "00000000-0000-0000-0000-000000000000", // Default for v0.1.0 single-user
): Promise<ObservationCreationResult> {
  const entities = extractEntities(record.properties, record.type);
  const observations = [];

  // Ensure a legacy payload exists to satisfy observations.source_payload_id FK
  await ensureLegacyObservationPayload();

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
    const baseObservation = {
      entity_id: resolved.id,
      entity_type: resolved.entity_type,
      schema_version: schemaVersion,
      // For legacy v0.1.0 paths that ingest directly from records (without payloads),
      // associate observations with a sentinel payload ID to satisfy schema constraints.
      // This sentinel payload (all-zero UUID) is preserved by tests and migrations.
      source_payload_id: "00000000-0000-0000-0000-000000000000",
      observed_at: observedAt,
      specificity_score: 0.8, // Default specificity
      source_priority: 0, // Default priority
      fields: knownFields,
      user_id: userId,
    };

    const insertObservation = async (payload: Record<string, unknown>) =>
      supabase.from("observations").insert(payload).select().single();

    let { data: observationData, error: obsError } = await insertObservation(
      baseObservation,
    );

    // Fallback for environments where source_payload_id column is missing
    if (
      obsError &&
      (obsError as any).code === "PGRST204" &&
      typeof (obsError as any).message === "string" &&
      (obsError as any).message.includes("source_payload_id")
    ) {
      const fallback: Record<string, unknown> = { ...baseObservation };
      delete (fallback as any).source_payload_id;
      ({ data: observationData, error: obsError } =
        await insertObservation(fallback));
    }

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
          allObservations as any,
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
          },
        );

        snapshotUpdated = true;
      }
    } catch (error) {
      console.error(
        `Failed to compute snapshot for entity ${obs.entity_id}:`,
        error,
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

/**
 * Create observations from payload using capability extraction rules
 */
export async function createObservationsFromPayload(
  payload: PayloadSubmission,
  capability: Capability,
  userId: string = "00000000-0000-0000-0000-000000000000",
): Promise<ObservationCreationResult> {
  const allEntities: Array<{ entity_type: string; raw_value: string }> = [];

  // Extract entities using capability's entity_extraction_rules
  for (const rule of capability.entity_extraction_rules) {
    if (rule.extraction_type === "payload_self") {
      // Payload itself becomes entity (e.g., note → note entity)
      // Use payload ID or title/name field as entity identifier
      const entityValue =
        (payload.body.title as string) ||
        (payload.body.name as string) ||
        payload.id;
      allEntities.push({
        entity_type: rule.entity_type,
        raw_value: entityValue,
      });
    } else if (rule.extraction_type === "field_value") {
      // Extract from single field (e.g., vendor_name → company)
      const fieldValue = payload.body[rule.source_field!];
      if (fieldValue && typeof fieldValue === "string") {
        allEntities.push({
          entity_type: rule.entity_type,
          raw_value: fieldValue,
        });
      }
    } else if (rule.extraction_type === "array_items") {
      // Extract from array field (e.g., tasks array → task entities)
      const arrayValue = payload.body[rule.source_field!];
      if (Array.isArray(arrayValue)) {
        for (const item of arrayValue) {
          if (typeof item === "string") {
            allEntities.push({
              entity_type: rule.entity_type,
              raw_value: item,
            });
          } else if (
            typeof item === "object" &&
            item !== null &&
            "title" in item
          ) {
            allEntities.push({
              entity_type: rule.entity_type,
              raw_value: (item as { title: string }).title,
            });
          }
        }
      }
    }
  }

  const observations = [];

  // Load active schema for entity types
  const entityTypes = new Set(allEntities.map((e) => e.entity_type));
  const schemaMap = new Map<string, any>();

  for (const entityType of entityTypes) {
    const schema = await schemaRegistry.loadActiveSchema(entityType);
    if (schema) {
      schemaMap.set(entityType, schema);
    }
  }

  // Resolve all entities and create observations
  for (const entity of allEntities) {
    const resolved = await resolveEntity(entity.entity_type, entity.raw_value);
    const schema = schemaMap.get(entity.entity_type);
    const schemaVersion = schema?.schema_version || "1.0";

    // Separate known fields from unknown fields
    const knownFields: Record<string, unknown> = {};
    const unknownFields: Record<string, unknown> = {};

    if (schema) {
      const schemaFields = Object.keys(schema.schema_definition.fields);
      for (const [key, value] of Object.entries(payload.body)) {
        if (schemaFields.includes(key)) {
          knownFields[key] = value;
        } else {
          unknownFields[key] = value;
        }
      }
    } else {
      // No schema - treat all as known for now
      Object.assign(knownFields, payload.body);
    }

    // Create observation with source_payload_id
    const observedAt = new Date().toISOString();
    const baseObservation = {
      entity_id: resolved.id,
      entity_type: resolved.entity_type,
      schema_version: schemaVersion,
      source_payload_id: payload.id,
      observed_at: observedAt,
      specificity_score: 0.8,
      source_priority: 0,
      fields: knownFields,
      user_id: userId,
    };

    const insertObservation = async (payload: Record<string, unknown>) =>
      supabase.from("observations").insert(payload).select().single();

    let { data: observationData, error: obsError } = await insertObservation(
      baseObservation,
    );

    // Fallback for environments where source_payload_id column is missing
    if (
      obsError &&
      (obsError as any).code === "PGRST204" &&
      typeof (obsError as any).message === "string" &&
      (obsError as any).message.includes("source_payload_id")
    ) {
      const fallback: Record<string, unknown> = { ...baseObservation };
      delete (fallback as any).source_payload_id;
      ({ data: observationData, error: obsError } =
        await insertObservation(fallback));
    }

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
          allObservations as any,
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
          },
        );

        snapshotUpdated = true;
      }
    } catch (error) {
      console.error(
        `Failed to compute snapshot for entity ${obs.entity_id}:`,
        error,
      );
    }
  }

  // Return result compatible with ObservationCreationResult
  // Note: record field is placeholder for payload-based observations
  return {
    record: { id: payload.id } as NeotomaRecord,
    observations,
    snapshotUpdated,
  };
}

/**
 * Ensure legacy payload row exists for record-based observations
 */
async function ensureLegacyObservationPayload(): Promise<void> {
  // Check if sentinel payload already exists
  const { data, error } = await supabase
    .from("payload_submissions")
    .select("id")
    .eq("id", LEGACY_OBSERVATION_PAYLOAD_ID)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to check legacy observation payload:",
      (error as any).message || error,
    );
    return;
  }

  if (data) return;

  const { error: insertError } = await supabase
    .from("payload_submissions")
    .insert({
      id: LEGACY_OBSERVATION_PAYLOAD_ID,
      payload_submission_id: "legacy_observation_sentinel",
      payload_content_id: "legacy_observation_sentinel",
      capability_id: "legacy:store_record:v0",
      body: {},
      provenance: { mode: "legacy" },
    });

  if (insertError) {
    console.error(
      "Failed to create legacy observation payload:",
      (insertError as any).message || insertError,
    );
  }
}
