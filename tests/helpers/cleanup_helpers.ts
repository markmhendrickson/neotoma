/**
 * Cleanup Helpers Library
 *
 * Reusable cleanup functions for test data with proper foreign key ordering.
 * All functions handle FK constraints correctly and track created IDs.
 */

import { supabase } from "../../src/db.js";

// =============================================================================
// Entity Cleanup
// =============================================================================

/**
 * Clean up test entity and all related data in correct FK order
 */
export async function cleanupTestEntity(entityId: string): Promise<void> {
  // Order matters due to FK constraints:
  // 1. Timeline events (FK to entities)
  // 2. Entity snapshots (FK to entities)
  // 3. Observations (FK to entities)
  // 4. Relationship observations (FK to entities)
  // 5. Relationship snapshots (FK to entities)
  // 6. Entity itself

  await supabase.from("timeline_events").delete().eq("entity_id", entityId);
  await supabase.from("entity_snapshots").delete().eq("entity_id", entityId);
  await supabase.from("observations").delete().eq("entity_id", entityId);

  // Relationship observations (as source or target)
  await supabase.from("relationship_observations").delete().eq("source_entity_id", entityId);
  await supabase.from("relationship_observations").delete().eq("target_entity_id", entityId);

  // Relationship snapshots (as source or target)
  await supabase.from("relationship_snapshots").delete().eq("source_entity_id", entityId);
  await supabase.from("relationship_snapshots").delete().eq("target_entity_id", entityId);

  // Finally delete the entity
  await supabase.from("entities").delete().eq("id", entityId);
}

/**
 * Clean up multiple test entities efficiently
 */
export async function cleanupTestEntities(entityIds: string[]): Promise<void> {
  if (entityIds.length === 0) return;

  // Batch delete related data
  await supabase.from("timeline_events").delete().in("entity_id", entityIds);
  await supabase.from("entity_snapshots").delete().in("entity_id", entityIds);
  await supabase.from("observations").delete().in("entity_id", entityIds);

  // Relationships (as source or target)
  await supabase.from("relationship_observations").delete().in("source_entity_id", entityIds);
  await supabase.from("relationship_observations").delete().in("target_entity_id", entityIds);
  await supabase.from("relationship_snapshots").delete().in("source_entity_id", entityIds);
  await supabase.from("relationship_snapshots").delete().in("target_entity_id", entityIds);

  // Delete entities
  await supabase.from("entities").delete().in("id", entityIds);
}

// =============================================================================
// Source Cleanup
// =============================================================================

/**
 * Clean up test source and all related data in correct FK order
 */
export async function cleanupTestSource(sourceId: string): Promise<void> {
  // Order matters due to FK constraints:
  // 1. Interpretations (FK to sources)
  // 2. Raw fragments (FK to sources)
  // 3. Observations (FK to sources)
  // 4. Relationship observations (FK to sources)
  // 5. Source itself

  await supabase.from("interpretations").delete().eq("source_id", sourceId);
  await supabase.from("raw_fragments").delete().eq("source_id", sourceId);
  await supabase.from("observations").delete().eq("source_id", sourceId);
  await supabase.from("relationship_observations").delete().eq("source_id", sourceId);

  // Finally delete the source
  await supabase.from("sources").delete().eq("id", sourceId);
}

/**
 * Clean up multiple test sources efficiently
 */
export async function cleanupTestSources(sourceIds: string[]): Promise<void> {
  if (sourceIds.length === 0) return;

  // Batch delete related data
  await supabase.from("interpretations").delete().in("source_id", sourceIds);
  await supabase.from("raw_fragments").delete().in("source_id", sourceIds);
  await supabase.from("observations").delete().in("source_id", sourceIds);
  await supabase.from("relationship_observations").delete().in("source_id", sourceIds);

  // Delete sources
  await supabase.from("sources").delete().in("id", sourceIds);
}

// =============================================================================
// Relationship Cleanup
// =============================================================================

/**
 * Clean up test relationship and related observations
 */
export async function cleanupTestRelationship(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string
): Promise<void> {
  // Delete relationship observations first (FK to relationship_snapshots)
  await supabase
    .from("relationship_observations")
    .delete()
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId);

  // Delete relationship snapshot
  await supabase
    .from("relationship_snapshots")
    .delete()
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId);
}

/**
 * Clean up all relationships for an entity
 */
export async function cleanupEntityRelationships(entityId: string): Promise<void> {
  // Delete relationship observations (as source or target)
  await supabase.from("relationship_observations").delete().eq("source_entity_id", entityId);
  await supabase.from("relationship_observations").delete().eq("target_entity_id", entityId);

  // Delete relationship snapshots (as source or target)
  await supabase.from("relationship_snapshots").delete().eq("source_entity_id", entityId);
  await supabase.from("relationship_snapshots").delete().eq("target_entity_id", entityId);
}

// =============================================================================
// Observation Cleanup
// =============================================================================

/**
 * Clean up test observation
 */
export async function cleanupTestObservation(observationId: string): Promise<void> {
  await supabase.from("observations").delete().eq("id", observationId);
}

/**
 * Clean up multiple test observations
 */
export async function cleanupTestObservations(observationIds: string[]): Promise<void> {
  if (observationIds.length === 0) return;
  await supabase.from("observations").delete().in("id", observationIds);
}

/**
 * Clean up all observations for an entity
 */
export async function cleanupEntityObservations(entityId: string): Promise<void> {
  await supabase.from("observations").delete().eq("entity_id", entityId);
}

/**
 * Clean up all observations from a source
 */
export async function cleanupSourceObservations(sourceId: string): Promise<void> {
  await supabase.from("observations").delete().eq("source_id", sourceId);
}

// =============================================================================
// Schema Cleanup
// =============================================================================

/**
 * Clean up test schema registry entry
 */
export async function cleanupTestSchema(
  entityType: string,
  userId?: string | null
): Promise<void> {
  let query = supabase
    .from("schema_registry")
    .delete()
    .eq("entity_type", entityType);

  if (userId !== undefined) {
    if (userId === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", userId);
    }
  }

  await query;
}

/**
 * Clean up schema recommendations
 */
export async function cleanupSchemaRecommendations(
  entityType: string,
  userId?: string | null
): Promise<void> {
  let query = supabase
    .from("schema_recommendations")
    .delete()
    .eq("entity_type", entityType);

  if (userId !== undefined) {
    if (userId === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", userId);
    }
  }

  await query;
}

// =============================================================================
// Raw Fragment Cleanup
// =============================================================================

/**
 * Clean up raw fragments for entity type
 */
export async function cleanupRawFragments(
  entityType: string,
  userId?: string | null
): Promise<void> {
  let query = supabase
    .from("raw_fragments")
    .delete()
    .eq("entity_type", entityType);

  if (userId !== undefined) {
    if (userId === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", userId);
    }
  }

  await query;
}

/**
 * Clean up raw fragments from source
 */
export async function cleanupSourceRawFragments(sourceId: string): Promise<void> {
  await supabase.from("raw_fragments").delete().eq("source_id", sourceId);
}

// =============================================================================
// Auto-Enhancement Queue Cleanup
// =============================================================================

/**
 * Clean up auto-enhancement queue entries
 */
export async function cleanupAutoEnhancementQueue(
  entityType: string,
  userId?: string | null
): Promise<void> {
  let query = supabase
    .from("auto_enhancement_queue")
    .delete()
    .eq("entity_type", entityType);

  if (userId !== undefined) {
    if (userId === null) {
      query = query.is("user_id", null);
    } else {
      query = query.eq("user_id", userId);
    }
  }

  await query;
}

// =============================================================================
// Timeline Event Cleanup
// =============================================================================

/**
 * Clean up timeline events for entity
 */
export async function cleanupTimelineEvents(entityId: string): Promise<void> {
  await supabase.from("timeline_events").delete().eq("entity_id", entityId);
}

/**
 * Clean up timeline events by type
 */
export async function cleanupTimelineEventsByType(
  eventType: string,
  entityId?: string
): Promise<void> {
  let query = supabase
    .from("timeline_events")
    .delete()
    .eq("event_type", eventType);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  await query;
}

// =============================================================================
// Interpretation Cleanup
// =============================================================================

/**
 * Clean up interpretations for source
 */
export async function cleanupInterpretations(sourceId: string): Promise<void> {
  await supabase.from("interpretations").delete().eq("source_id", sourceId);
}

// =============================================================================
// Snapshot Cleanup
// =============================================================================

/**
 * Clean up entity snapshot
 */
export async function cleanupEntitySnapshot(entityId: string): Promise<void> {
  await supabase.from("entity_snapshots").delete().eq("entity_id", entityId);
}

/**
 * Clean up relationship snapshot
 */
export async function cleanupRelationshipSnapshot(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string
): Promise<void> {
  await supabase
    .from("relationship_snapshots")
    .delete()
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId);
}

// =============================================================================
// Comprehensive Cleanup (Entity Type)
// =============================================================================

/**
 * Clean up all data for an entity type
 * Handles all related tables in correct FK order
 */
export async function cleanupEntityType(
  entityType: string,
  userId?: string | null
): Promise<void> {
  // First, get all entity IDs for this type
  let entityQuery = supabase
    .from("entities")
    .select("id")
    .eq("entity_type", entityType);

  if (userId !== undefined) {
    if (userId === null) {
      entityQuery = entityQuery.is("user_id", null);
    } else {
      entityQuery = entityQuery.eq("user_id", userId);
    }
  }

  const { data: entities } = await entityQuery;
  const entityIds = entities?.map(e => e.id) || [];

  // Clean up entity-specific data
  if (entityIds.length > 0) {
    await cleanupTestEntities(entityIds);
  }

  // Clean up non-entity-specific data
  await cleanupRawFragments(entityType, userId);
  await cleanupAutoEnhancementQueue(entityType, userId);
  await cleanupSchemaRecommendations(entityType, userId);
  await cleanupTestSchema(entityType, userId);
}

// =============================================================================
// Batch Cleanup
// =============================================================================

/**
 * Clean up all test data for multiple test IDs
 * Efficiently handles batches of entities, sources, etc.
 */
export async function cleanupAllTestData(testIds: {
  entityIds?: string[];
  sourceIds?: string[];
  observationIds?: string[];
  entityTypes?: string[];
  userIds?: Array<string | null>;
}): Promise<void> {
  // Clean up entities
  if (testIds.entityIds && testIds.entityIds.length > 0) {
    await cleanupTestEntities(testIds.entityIds);
  }

  // Clean up sources
  if (testIds.sourceIds && testIds.sourceIds.length > 0) {
    await cleanupTestSources(testIds.sourceIds);
  }

  // Clean up observations
  if (testIds.observationIds && testIds.observationIds.length > 0) {
    await cleanupTestObservations(testIds.observationIds);
  }

  // Clean up entity types
  if (testIds.entityTypes && testIds.entityTypes.length > 0) {
    for (const entityType of testIds.entityTypes) {
      // If userIds provided, clean per user; otherwise clean globally
      if (testIds.userIds && testIds.userIds.length > 0) {
        for (const userId of testIds.userIds) {
          await cleanupEntityType(entityType, userId);
        }
      } else {
        await cleanupEntityType(entityType, undefined);
      }
    }
  }
}

// =============================================================================
// ID Tracking Helpers
// =============================================================================

/**
 * Test ID tracker for automatic cleanup
 */
export class TestIdTracker {
  private entityIds: string[] = [];
  private sourceIds: string[] = [];
  private observationIds: string[] = [];
  private entityTypes: string[] = [];

  /**
   * Track entity ID for cleanup
   */
  trackEntity(entityId: string): void {
    if (!this.entityIds.includes(entityId)) {
      this.entityIds.push(entityId);
    }
  }

  /**
   * Track source ID for cleanup
   */
  trackSource(sourceId: string): void {
    if (!this.sourceIds.includes(sourceId)) {
      this.sourceIds.push(sourceId);
    }
  }

  /**
   * Track observation ID for cleanup
   */
  trackObservation(observationId: string): void {
    if (!this.observationIds.includes(observationId)) {
      this.observationIds.push(observationId);
    }
  }

  /**
   * Track entity type for cleanup
   */
  trackEntityType(entityType: string): void {
    if (!this.entityTypes.includes(entityType)) {
      this.entityTypes.push(entityType);
    }
  }

  /**
   * Clean up all tracked IDs
   */
  async cleanup(): Promise<void> {
    await cleanupAllTestData({
      entityIds: this.entityIds,
      sourceIds: this.sourceIds,
      observationIds: this.observationIds,
      entityTypes: this.entityTypes,
    });

    // Clear tracking arrays
    this.entityIds = [];
    this.sourceIds = [];
    this.observationIds = [];
    this.entityTypes = [];
  }

  /**
   * Get tracked IDs count
   */
  getTrackedCount(): {
    entities: number;
    sources: number;
    observations: number;
    entityTypes: number;
  } {
    return {
      entities: this.entityIds.length,
      sources: this.sourceIds.length,
      observations: this.observationIds.length,
      entityTypes: this.entityTypes.length,
    };
  }
}
