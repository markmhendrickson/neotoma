/**
 * Database State Verification Library
 *
 * Comprehensive verification functions for database assertions across all test phases.
 * All functions verify actual database state, not return values.
 */

import { expect } from "vitest";
import { supabase } from "../../src/db.js";

// =============================================================================
// Source Verification
// =============================================================================

/**
 * Verify source exists with expected fields
 */
export async function verifySourceExists(
  sourceId: string,
  expected: {
    content_hash?: string;
    mime_type?: string;
    original_filename?: string;
    user_id?: string | null;
    source_priority?: number;
  } = {}
): Promise<void> {
  const { data: source, error } = await supabase
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .single();

  expect(error).toBeNull();
  expect(source).toBeDefined();

  if (expected.content_hash) {
    expect(source.content_hash).toBe(expected.content_hash);
  }

  if (expected.mime_type) {
    expect(source.mime_type).toBe(expected.mime_type);
  }

  if (expected.original_filename) {
    expect(source.original_filename).toBe(expected.original_filename);
  }

  if (expected.user_id !== undefined) {
    expect(source.user_id).toBe(expected.user_id);
  }

  if (expected.source_priority !== undefined) {
    expect(source.source_priority).toBe(expected.source_priority);
  }
}

/**
 * Verify source does not exist
 */
export async function verifySourceNotExists(sourceId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sources")
    .select("id")
    .eq("id", sourceId)
    .maybeSingle();

  // Either error or data should be null
  expect(data).toBeNull();
}

// =============================================================================
// Entity Verification
// =============================================================================

/**
 * Verify entity exists with observations and snapshot
 */
export async function verifyEntityExists(
  entityId: string,
  expected: {
    entity_type: string;
    canonical_name?: string;
    user_id?: string | null;
    observationCount?: number;
    snapshotExists?: boolean;
    snapshotObservationCount?: number;
  }
): Promise<void> {
  // Verify entity row
  const { data: entity, error } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .single();

  expect(error).toBeNull();
  expect(entity).toBeDefined();
  expect(entity.entity_type).toBe(expected.entity_type);

  if (expected.canonical_name !== undefined) {
    expect(entity.canonical_name).toBe(expected.canonical_name);
  }

  if (expected.user_id !== undefined) {
    expect(entity.user_id).toBe(expected.user_id);
  }

  // Verify observations
  if (expected.observationCount !== undefined) {
    const { count } = await supabase
      .from("observations")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId);
    expect(count).toBe(expected.observationCount);
  }

  // Verify snapshot
  if (expected.snapshotExists !== undefined) {
    const { data: snapshot, error: snapshotError } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entityId)
      .maybeSingle();

    if (expected.snapshotExists) {
      expect(snapshotError).toBeNull();
      expect(snapshot).toBeDefined();

      if (expected.snapshotObservationCount !== undefined) {
        expect(snapshot.observation_count).toBe(expected.snapshotObservationCount);
      }
    } else {
      expect(snapshot).toBeNull();
    }
  }
}

/**
 * Verify entity does not exist
 */
export async function verifyEntityNotExists(entityId: string): Promise<void> {
  const { data, error } = await supabase
    .from("entities")
    .select("id")
    .eq("id", entityId)
    .maybeSingle();

  expect(data).toBeNull();
}

// =============================================================================
// Observation Verification
// =============================================================================

/**
 * Verify observation exists with expected fields and provenance
 */
export async function verifyObservationExists(
  observationId: string,
  expected: {
    entity_id?: string;
    entity_type?: string;
    source_id?: string;
    field?: string;
    value?: unknown;
    user_id?: string | null;
    priority?: number;
    observed_at?: string;
  } = {}
): Promise<void> {
  const { data: observation, error } = await supabase
    .from("observations")
    .select("*")
    .eq("id", observationId)
    .single();

  expect(error).toBeNull();
  expect(observation).toBeDefined();

  if (expected.entity_id) {
    expect(observation.entity_id).toBe(expected.entity_id);
  }

  if (expected.entity_type) {
    expect(observation.entity_type).toBe(expected.entity_type);
  }

  if (expected.source_id) {
    expect(observation.source_id).toBe(expected.source_id);
  }

  if (expected.field) {
    expect(observation.field).toBe(expected.field);
  }

  if (expected.value !== undefined) {
    expect(observation.value).toEqual(expected.value);
  }

  if (expected.user_id !== undefined) {
    expect(observation.user_id).toBe(expected.user_id);
  }

  if (expected.priority !== undefined) {
    expect(observation.priority).toBe(expected.priority);
  }

  if (expected.observed_at) {
    expect(observation.observed_at).toBe(expected.observed_at);
  }
}

/**
 * Verify observation does not exist
 */
export async function verifyObservationNotExists(observationId: string): Promise<void> {
  const { data } = await supabase
    .from("observations")
    .select("id")
    .eq("id", observationId)
    .maybeSingle();

  expect(data).toBeNull();
}

/**
 * Count observations for entity
 */
export async function countObservationsForEntity(entityId: string): Promise<number> {
  const { count } = await supabase
    .from("observations")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId);

  return count || 0;
}

// =============================================================================
// Relationship Verification
// =============================================================================

/**
 * Verify relationship exists with expected fields
 */
export async function verifyRelationshipExists(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  expected: {
    metadata?: Record<string, unknown>;
    observationCount?: number;
    snapshotExists?: boolean;
  } = {}
): Promise<void> {
  // Verify relationship snapshot
  const { data: snapshot, error } = await supabase
    .from("relationship_snapshots")
    .select("*")
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId)
    .maybeSingle();

  if (expected.snapshotExists === false) {
    expect(snapshot).toBeNull();
    return;
  }

  expect(error).toBeNull();
  expect(snapshot).toBeDefined();

  if (expected.metadata) {
    expect(snapshot.metadata).toEqual(expected.metadata);
  }

  if (expected.observationCount !== undefined) {
    expect(snapshot.observation_count).toBe(expected.observationCount);
  }

  // Verify relationship observations exist
  if (expected.observationCount !== undefined && expected.observationCount > 0) {
    const { count } = await supabase
      .from("relationship_observations")
      .select("id", { count: "exact", head: true })
      .eq("relationship_type", relationshipType)
      .eq("source_entity_id", sourceEntityId)
      .eq("target_entity_id", targetEntityId);

    expect(count).toBe(expected.observationCount);
  }
}

/**
 * Verify relationship does not exist
 */
export async function verifyRelationshipNotExists(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string
): Promise<void> {
  const { data } = await supabase
    .from("relationship_snapshots")
    .select("*")
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId)
    .maybeSingle();

  expect(data).toBeNull();
}

/**
 * Verify relationship observations exist
 */
export async function verifyRelationshipObservations(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  expectedCount: number
): Promise<void> {
  const { data, error } = await supabase
    .from("relationship_observations")
    .select("*")
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId);

  expect(error).toBeNull();
  expect(data).toBeDefined();
  expect(data.length).toBe(expectedCount);
}

// =============================================================================
// Snapshot Verification
// =============================================================================

/**
 * Verify entity snapshot computed correctly
 */
export async function verifySnapshotComputed(
  entityId: string,
  expectedState: {
    observationCount?: number;
    computedFields?: Record<string, unknown>;
    hasFields?: string[];
  }
): Promise<void> {
  const { data: snapshot, error } = await supabase
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .single();

  expect(error).toBeNull();
  expect(snapshot).toBeDefined();

  if (expectedState.observationCount !== undefined) {
    expect(snapshot.observation_count).toBe(expectedState.observationCount);
  }

  if (expectedState.computedFields) {
    expect(snapshot.computed_state).toBeDefined();
    for (const [field, value] of Object.entries(expectedState.computedFields)) {
      expect(snapshot.computed_state[field]).toEqual(value);
    }
  }

  if (expectedState.hasFields) {
    expect(snapshot.computed_state).toBeDefined();
    for (const field of expectedState.hasFields) {
      expect(snapshot.computed_state).toHaveProperty(field);
    }
  }
}

// =============================================================================
// Timeline Event Verification
// =============================================================================

/**
 * Verify timeline event created
 */
export async function verifyTimelineEventCreated(
  eventType: string,
  entityId: string,
  expected: {
    event_date?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  const { data: events, error } = await supabase
    .from("timeline_events")
    .select("*")
    .eq("event_type", eventType)
    .eq("entity_id", entityId);

  expect(error).toBeNull();
  expect(events).toBeDefined();
  expect(events.length).toBeGreaterThan(0);

  const event = events[0];

  if (expected.event_date) {
    expect(event.event_date).toBe(expected.event_date);
  }

  if (expected.metadata) {
    expect(event.metadata).toEqual(expected.metadata);
  }
}

/**
 * Verify timeline event does not exist
 */
export async function verifyTimelineEventNotExists(
  eventType: string,
  entityId: string
): Promise<void> {
  const { data } = await supabase
    .from("timeline_events")
    .select("id")
    .eq("event_type", eventType)
    .eq("entity_id", entityId);

  expect(data).toBeDefined();
  expect(data.length).toBe(0);
}

// =============================================================================
// Schema Registry Verification
// =============================================================================

/**
 * Verify schema version is active
 */
export async function verifySchemaVersionActive(
  entityType: string,
  schemaVersion: string,
  expected: {
    user_id?: string | null;
    hasFields?: string[];
  } = {}
): Promise<void> {
  let query = supabase
    .from("schema_registry")
    .select("*")
    .eq("entity_type", entityType)
    .eq("schema_version", schemaVersion)
    .eq("active", true);

  if (expected.user_id !== undefined) {
    if (expected.user_id === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", expected.user_id);
    }
  }

  const { data: schema, error } = await query.single();

  expect(error).toBeNull();
  expect(schema).toBeDefined();
  expect(schema.active).toBe(true);

  if (expected.hasFields) {
    expect(schema.schema_definition).toBeDefined();
    expect(schema.schema_definition.fields).toBeDefined();
    for (const field of expected.hasFields) {
      expect(schema.schema_definition.fields).toHaveProperty(field);
    }
  }
}

/**
 * Verify schema field exists
 */
export async function verifySchemaFieldExists(
  entityType: string,
  fieldName: string,
  expected: {
    type?: string;
    required?: boolean;
    user_id?: string | null;
  } = {}
): Promise<void> {
  let query = supabase
    .from("schema_registry")
    .select("*")
    .eq("entity_type", entityType)
    .eq("active", true);

  if (expected.user_id !== undefined) {
    if (expected.user_id === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", expected.user_id);
    }
  }

  const { data: schema, error } = await query.single();

  expect(error).toBeNull();
  expect(schema).toBeDefined();
  expect(schema.schema_definition.fields).toHaveProperty(fieldName);

  const field = schema.schema_definition.fields[fieldName];

  if (expected.type) {
    expect(field.type).toBe(expected.type);
  }

  if (expected.required !== undefined) {
    expect(field.required).toBe(expected.required);
  }
}

/**
 * Verify schema recommendation exists
 */
export async function verifySchemaRecommendation(
  entityType: string,
  fieldName: string,
  expected: {
    status?: "pending" | "approved" | "rejected" | "auto_applied";
    inferred_type?: string;
    user_id?: string | null;
  } = {}
): Promise<void> {
  let query = supabase
    .from("schema_recommendations")
    .select("*")
    .eq("entity_type", entityType)
    .eq("field_name", fieldName);

  if (expected.user_id !== undefined) {
    if (expected.user_id === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", expected.user_id);
    }
  }

  const { data: recommendations, error } = await query;

  expect(error).toBeNull();
  expect(recommendations).toBeDefined();
  expect(recommendations.length).toBeGreaterThan(0);

  const recommendation = recommendations[0];

  if (expected.status) {
    expect(recommendation.status).toBe(expected.status);
  }

  if (expected.inferred_type) {
    expect(recommendation.inferred_type).toBe(expected.inferred_type);
  }
}

// =============================================================================
// Raw Fragment Verification
// =============================================================================

/**
 * Verify raw fragment stored
 */
export async function verifyRawFragmentStored(
  fragmentKey: string,
  entityType: string,
  expected: {
    fragment_value?: unknown;
    user_id?: string | null;
    source_id?: string;
  } = {}
): Promise<void> {
  let query = supabase
    .from("raw_fragments")
    .select("*")
    .eq("fragment_key", fragmentKey)
    .eq("entity_type", entityType);

  if (expected.user_id !== undefined) {
    if (expected.user_id === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", expected.user_id);
    }
  }

  const { data: fragments, error } = await query;

  expect(error).toBeNull();
  expect(fragments).toBeDefined();
  expect(fragments.length).toBeGreaterThan(0);

  const fragment = fragments[0];

  if (expected.fragment_value !== undefined) {
    expect(fragment.fragment_value).toEqual(expected.fragment_value);
  }

  if (expected.source_id) {
    expect(fragment.source_id).toBe(expected.source_id);
  }
}

/**
 * Verify raw fragment promoted (no longer exists)
 */
export async function verifyRawFragmentPromoted(
  fragmentKey: string,
  entityType: string,
  userId?: string | null
): Promise<void> {
  let query = supabase
    .from("raw_fragments")
    .select("id")
    .eq("fragment_key", fragmentKey)
    .eq("entity_type", entityType);

  if (userId !== undefined) {
    if (userId === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", userId);
    }
  }

  const { data } = await query;

  // Should be empty (promoted to schema)
  expect(data).toBeDefined();
  expect(data.length).toBe(0);
}

// =============================================================================
// Interpretation Verification
// =============================================================================

/**
 * Verify interpretation created
 */
export async function verifyInterpretationCreated(
  sourceId: string,
  expected: {
    status?: "pending" | "completed" | "failed";
    entity_count?: number;
    model_id?: string;
  } = {}
): Promise<void> {
  const { data: interpretations, error } = await supabase
    .from("interpretations")
    .select("*")
    .eq("source_id", sourceId);

  expect(error).toBeNull();
  expect(interpretations).toBeDefined();
  expect(interpretations.length).toBeGreaterThan(0);

  const interpretation = interpretations[0];

  if (expected.status) {
    expect(interpretation.status).toBe(expected.status);
  }

  if (expected.entity_count !== undefined) {
    expect(interpretation.entity_count).toBe(expected.entity_count);
  }

  if (expected.model_id) {
    expect(interpretation.model_id).toBe(expected.model_id);
  }
}

/**
 * Verify interpretation does not exist
 */
export async function verifyInterpretationNotExists(sourceId: string): Promise<void> {
  const { data } = await supabase
    .from("interpretations")
    .select("id")
    .eq("source_id", sourceId);

  expect(data).toBeDefined();
  expect(data.length).toBe(0);
}

// =============================================================================
// Auto-Enhancement Queue Verification
// =============================================================================

/**
 * Verify auto-enhancement queue entry exists
 */
export async function verifyAutoEnhancementQueued(
  entityType: string,
  fragmentKey: string,
  expected: {
    status?: "pending" | "processing" | "completed" | "failed";
    user_id?: string | null;
  } = {}
): Promise<void> {
  let query = supabase
    .from("auto_enhancement_queue")
    .select("*")
    .eq("entity_type", entityType)
    .eq("fragment_key", fragmentKey);

  if (expected.user_id !== undefined) {
    if (expected.user_id === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", expected.user_id);
    }
  }

  const { data: queueItems, error } = await query;

  expect(error).toBeNull();
  expect(queueItems).toBeDefined();
  expect(queueItems.length).toBeGreaterThan(0);

  if (expected.status) {
    expect(queueItems[0].status).toBe(expected.status);
  }
}

// =============================================================================
// Snapshot Computation Helpers
// =============================================================================

/**
 * Compute entity snapshot from observations
 *
 * This is a test helper that triggers snapshot computation for an entity.
 * In production, snapshots are computed via the reducer during store operations.
 */
export async function computeEntitySnapshot(entityId: string): Promise<void> {
  // Import reducer dynamically to avoid circular dependencies
  const { ObservationReducer } = await import("../../src/reducers/observation_reducer.js");
  const reducer = new ObservationReducer();

  // Get all observations for entity
  const { data: observations, error } = await supabase
    .from("observations")
    .select("*")
    .eq("entity_id", entityId);

  if (error) {
    throw new Error(`Failed to fetch observations for entity ${entityId}: ${error.message}`);
  }

  if (!observations || observations.length === 0) {
    throw new Error(`No observations found for entity ${entityId}`);
  }

  // Compute snapshot
  const snapshot = await reducer.computeSnapshot(entityId, observations);

  if (!snapshot) {
    // Entity is deleted - no snapshot to store
    return;
  }

  // Store snapshot in database
  const { error: upsertError } = await supabase
    .from("entity_snapshots")
    .upsert(snapshot, {
      onConflict: "entity_id",
    });

  if (upsertError) {
    throw new Error(`Failed to store snapshot for entity ${entityId}: ${upsertError.message}`);
  }
}

/**
 * Compute relationship snapshot from relationship observations
 */
export async function computeRelationshipSnapshot(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string
): Promise<void> {
  // Import reducer dynamically to avoid circular dependencies
  const { RelationshipReducer } = await import("../../src/reducers/relationship_reducer.js");
  const reducer = new RelationshipReducer();

  // Get all relationship observations
  const { data: observations, error } = await supabase
    .from("relationship_observations")
    .select("*")
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId);

  if (error) {
    throw new Error(`Failed to fetch relationship observations: ${error.message}`);
  }

  if (!observations || observations.length === 0) {
    throw new Error(`No relationship observations found`);
  }

  // Build relationship key
  const relationshipKey = `${sourceEntityId}:${relationshipType}:${targetEntityId}`;

  // Compute snapshot
  const snapshot = await reducer.computeSnapshot(
    relationshipKey,
    observations
  );

  if (!snapshot) {
    // Relationship is deleted - no snapshot to store
    return;
  }

  // Store snapshot in database
  const { error: upsertError } = await supabase
    .from("relationship_snapshots")
    .upsert(snapshot, {
      onConflict: "relationship_type,source_entity_id,target_entity_id",
    });

  if (upsertError) {
    throw new Error(`Failed to store relationship snapshot: ${upsertError.message}`);
  }
}
