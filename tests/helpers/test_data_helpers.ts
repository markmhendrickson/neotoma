/**
 * Test Data Helpers
 *
 * Helper functions for creating test data with proper schemas
 */

import { db } from "../../src/db.js";

/**
 * Create a test source with all required fields
 */
export async function createTestSource(params: {
  user_id: string | null;
  content_hash?: string;
  storage_url?: string;
  mime_type?: string;
  file_size?: number;
}): Promise<{ id: string }> {
  const { data: source, error } = await db
    .from("sources")
    .insert({
      user_id: params.user_id,
      content_hash: params.content_hash || `test-hash-${Date.now()}`,
      storage_url: params.storage_url || `file:///test/${Date.now()}.txt`,
      mime_type: params.mime_type || "text/plain",
      file_size: params.file_size || 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test source: ${error.message}`);
  }

  return source;
}

/**
 * Create a test observation
 */
export async function createTestObservation(params: {
  source_id: string;
  entity_id: string;
  entity_type: string;
  user_id: string | null;
  observed_properties: Record<string, any>;
  observation_priority?: number;
}): Promise<{ id: string }> {
  const crypto = await import("crypto");
  const { data: observation, error } = await db
    .from("observations")
    .insert({
      id: crypto.randomUUID(),
      source_id: params.source_id,
      entity_id: params.entity_id,
      entity_type: params.entity_type,
      schema_version: "1.0",
      user_id: params.user_id,
      fields: params.observed_properties,
      source_priority: params.observation_priority ?? 500,
      observed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test observation: ${error.message}`);
  }

  return observation;
}

/**
 * Create a test entity
 */
export async function createTestEntity(params: {
  entity_type: string;
  canonical_name: string;
  user_id: string | null;
  metadata?: Record<string, any>;
}): Promise<string> {
  // First create entity ID (deterministic hash-based)
  const entityId = `ent_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // First create the entity record
  const { error: entityError } = await db.from("entities").insert({
    id: entityId,
    entity_type: params.entity_type,
    canonical_name: params.canonical_name,
    user_id: params.user_id,
  });

  if (entityError) {
    throw new Error(`Failed to create test entity: ${entityError.message}`);
  }

  // Then create the snapshot
  const { data: snapshot, error: snapshotError } = await db
    .from("entity_snapshots")
    .insert({
      entity_id: entityId,
      entity_type: params.entity_type,
      user_id: params.user_id,
      schema_version: "1.0",
      snapshot: {
        canonical_name: params.canonical_name,
        ...(params.metadata || {}),
      },
      provenance: {},
      observation_count: 0,
      last_observation_at: new Date().toISOString(),
      computed_at: new Date().toISOString(),
    })
    .select("entity_id")
    .single();

  if (snapshotError) {
    throw new Error(`Failed to create test entity snapshot: ${snapshotError.message}`);
  }

  return entityId;
}

/**
 * Create a test relationship
 * Creates observation and computes snapshot
 */
export async function createTestRelationship(params: {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  user_id: string | null;
  metadata?: Record<string, any>;
}): Promise<string> {
  const crypto = await import('crypto');

  // Create test source for the relationship
  const { data: source, error: sourceError } = await db
    .from("sources")
    .insert({
      user_id: params.user_id,
      content_hash: `rel_test_${Date.now()}_${crypto.randomUUID()}`,
      original_filename: "test_relationship.json",
      mime_type: "application/json",
      file_size_bytes: 100,
      raw_text: JSON.stringify(params.metadata || {}),
      storage_path: null,
    })
    .select("id")
    .single();

  if (sourceError) {
    throw new Error(`Failed to create test source: ${sourceError.message}`);
  }

  // Create relationship observation
  const relationshipKey = `${params.source_entity_id}:${params.relationship_type}:${params.target_entity_id}`;
  const canonicalHash = crypto
    .createHash('sha256')
    .update(relationshipKey)
    .digest('hex')
    .substring(0, 24);

  const { error: obsError } = await db
    .from("relationship_observations")
    .insert({
      id: crypto.randomUUID(),
      relationship_key: relationshipKey,
      source_entity_id: params.source_entity_id,
      relationship_type: params.relationship_type,
      target_entity_id: params.target_entity_id,
      source_id: source.id,
      user_id: params.user_id,
      observed_at: new Date().toISOString(),
      canonical_hash: canonicalHash,
      metadata: params.metadata || {},
      specificity_score: null,
      source_priority: 0,
      interpretation_id: null,
    });

  if (obsError) {
    throw new Error(`Failed to create relationship observation: ${obsError.message}`);
  }

  // Compute snapshot
  const { computeRelationshipSnapshot } = await import("../helpers/database_verifiers.js");
  await computeRelationshipSnapshot(
    params.relationship_type,
    params.source_entity_id,
    params.target_entity_id
  );

  // Return a composite ID
  return `${params.source_entity_id}:${params.relationship_type}:${params.target_entity_id}`;
}

/**
 * Create a test interpretation
 */
export async function createTestInterpretation(params: {
  source_id: string;
  user_id: string | null;
  interpretation_data: Record<string, any>;
  config?: Record<string, any>;
}): Promise<string> {
  const crypto = await import("crypto");
  const { data: interpretation, error } = await db
    .from("interpretations")
    .insert({
      id: crypto.randomUUID(),
      source_id: params.source_id,
      user_id: params.user_id,
      interpretation_config: params.config || {},
      status: "completed",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create test interpretation: ${error.message}`);
  }

  return interpretation.id;
}
