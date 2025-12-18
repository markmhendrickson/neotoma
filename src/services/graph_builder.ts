/**
 * Graph Builder Service (FU-103)
 *
 * Transactional graph insertion with integrity enforcement (orphan detection, cycle prevention).
 */

import { supabase } from "../db.js";
import type { Entity } from "./entity_resolution.js";
import type { TimelineEvent } from "./event_generation.js";

export interface GraphInsertResult {
  recordId: string;
  entityIds: string[];
  eventIds: string[];
  relationshipIds: string[];
}

/**
 * Check for orphan nodes in graph
 */
export async function detectOrphanNodes(): Promise<{
  orphanRecords: number;
  orphanEntities: number;
  orphanEvents: number;
}> {
  const orphanCounts = {
    orphanRecords: 0,
    orphanEntities: 0,
    orphanEvents: 0,
  };

  // Check for orphan records (records with no edges)
  const { data: allRecords } = await supabase.from("records").select("id");

  if (allRecords && allRecords.length > 0) {
    const recordIds = allRecords.map((r) => r.id);

    // Get all records that have at least one edge
    const { data: recordEntityEdges } = await supabase
      .from("record_entity_edges")
      .select("record_id");

    const { data: recordEventEdges } = await supabase
      .from("record_event_edges")
      .select("record_id");

    const { data: recordRelationships } = await supabase
      .from("record_relationships")
      .select("source_id, target_id");

    const recordsWithEdges = new Set<string>();

    if (recordEntityEdges) {
      recordEntityEdges.forEach((edge) => recordsWithEdges.add(edge.record_id));
    }

    if (recordEventEdges) {
      recordEventEdges.forEach((edge) => recordsWithEdges.add(edge.record_id));
    }

    if (recordRelationships) {
      recordRelationships.forEach((rel) => {
        recordsWithEdges.add(rel.source_id);
        recordsWithEdges.add(rel.target_id);
      });
    }

    orphanCounts.orphanRecords = recordIds.filter(
      (id) => !recordsWithEdges.has(id),
    ).length;
  }

  // Check for orphan entities (entities with no record_entity_edges)
  const { data: allEntities } = await supabase.from("entities").select("id");

  if (allEntities && allEntities.length > 0) {
    const entityIds = allEntities.map((e) => e.id);

    const { data: entityEdges } = await supabase
      .from("record_entity_edges")
      .select("entity_id");

    const entitiesWithEdges = new Set<string>();
    if (entityEdges) {
      entityEdges.forEach((edge) => entitiesWithEdges.add(edge.entity_id));
    }

    orphanCounts.orphanEntities = entityIds.filter(
      (id) => !entitiesWithEdges.has(id),
    ).length;
  }

  // Check for orphan events (events with no record_event_edges)
  const { data: allEvents } = await supabase
    .from("timeline_events")
    .select("id");

  if (allEvents && allEvents.length > 0) {
    const eventIds = allEvents.map((e) => e.id);

    const { data: eventEdges } = await supabase
      .from("record_event_edges")
      .select("event_id");

    const eventsWithEdges = new Set<string>();
    if (eventEdges) {
      eventEdges.forEach((edge) => eventsWithEdges.add(edge.event_id));
    }

    orphanCounts.orphanEvents = eventIds.filter(
      (id) => !eventsWithEdges.has(id),
    ).length;
  }

  return orphanCounts;
}

/**
 * Detect cycles in relationships
 */
export async function detectCycles(
  relationshipType?: string,
): Promise<string[][]> {
  const cycles: string[][] = [];

  // Get all record-to-record relationships
  let recordQuery = supabase
    .from("record_relationships")
    .select("source_id, target_id, relationship");
  if (relationshipType) {
    recordQuery = recordQuery.eq("relationship", relationshipType);
  }

  const { data: recordRelationships } = await recordQuery;

  // Get all entity-to-entity relationships
  let entityQuery = supabase
    .from("relationships")
    .select("source_entity_id, target_entity_id, relationship_type");
  if (relationshipType) {
    entityQuery = entityQuery.eq("relationship_type", relationshipType);
  }

  const { data: entityRelationships } = await entityQuery;

  // Build combined adjacency map for all relationships
  const graph = new Map<string, Set<string>>();

  // Add record relationships
  if (recordRelationships) {
    for (const rel of recordRelationships) {
      if (!graph.has(rel.source_id)) {
        graph.set(rel.source_id, new Set());
      }
      graph.get(rel.source_id)!.add(rel.target_id);
    }
  }

  // Add entity relationships
  if (entityRelationships) {
    for (const rel of entityRelationships) {
      if (!graph.has(rel.source_entity_id)) {
        graph.set(rel.source_entity_id, new Set());
      }
      graph.get(rel.source_entity_id)!.add(rel.target_entity_id);
    }
  }

  if (graph.size === 0) {
    return cycles;
  }

  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    if (recursionStack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), node]);
      }
      return true;
    }

    if (visited.has(node)) {
      return false;
    }

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) {
        return true;
      }
    }

    path.pop();
    recursionStack.delete(node);
    return false;
  }

  // Check all nodes
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Validate graph integrity
 */
export async function validateGraphIntegrity(): Promise<{
  valid: boolean;
  orphanCount: number;
  cycleCount: number;
  errors: string[];
}> {
  const errors: string[] = [];

  const orphans = await detectOrphanNodes();
  const totalOrphans =
    orphans.orphanRecords + orphans.orphanEntities + orphans.orphanEvents;

  const cycles = await detectCycles();
  const cycleCount = cycles.length;

  // Orphan records are acceptable (records can exist without entities/events if nothing was extracted)
  // But orphan entities and events should not exist - they should always have edges
  if (orphans.orphanEntities > 0) {
    errors.push(
      `Found ${orphans.orphanEntities} orphan entities (entities with no record_entity_edges)`,
    );
  }

  if (orphans.orphanEvents > 0) {
    errors.push(
      `Found ${orphans.orphanEvents} orphan events (events with no record_event_edges)`,
    );
  }

  // Cycles are invalid
  if (cycleCount > 0) {
    errors.push(`Found ${cycleCount} cycles in graph`);
  }

  return {
    valid: errors.length === 0,
    orphanCount: totalOrphans,
    cycleCount,
    errors,
  };
}

/**
 * Insert record with graph edges transactionally
 */
export async function insertRecordWithGraph(
  record: {
    type: string;
    properties: Record<string, unknown>;
    file_urls?: string[];
  },
  entities: Entity[] = [],
  events: TimelineEvent[] = [],
  relationships: Array<{
    target_id: string;
    relationship: string;
    metadata?: Record<string, unknown>;
  }> = [],
): Promise<GraphInsertResult> {
  // Use Supabase transaction (RPC function) for atomicity
  // For now, do sequential inserts and validate integrity after
  // Full transaction support would require PostgreSQL function

  // Insert record
  const { data: recordData, error: recordError } = await supabase
    .from("records")
    .insert({
      type: record.type,
      properties: record.properties,
      file_urls: record.file_urls || [],
    })
    .select()
    .single();

  if (recordError || !recordData) {
    throw new Error(
      `Failed to insert record: ${recordError?.message || "Unknown error"}`,
    );
  }

  const recordId = recordData.id;
  const insertedEntityIds: string[] = [];
  const insertedEventIds: string[] = [];
  const insertedRelationshipIds: string[] = [];

  // Insert entities (they should already be persisted via resolveEntity, but we create edges)
  for (const entity of entities) {
    insertedEntityIds.push(entity.id);

    // Create record-entity edge
    const { error: edgeError } = await supabase
      .from("record_entity_edges")
      .insert({
        record_id: recordId,
        entity_id: entity.id,
        edge_type: "EXTRACTED_FROM",
      });

    if (edgeError) {
      console.error(
        `Failed to insert record-entity edge: ${edgeError.message}`,
      );
    }
  }

  // Insert events (they should already be persisted via persistEvents, but we create edges)
  for (const event of events) {
    insertedEventIds.push(event.id);

    // Create record-event edge
    const { error: recordEventError } = await supabase
      .from("record_event_edges")
      .insert({
        record_id: recordId,
        event_id: event.id,
        edge_type: "GENERATED_FROM",
      });

    if (recordEventError) {
      console.error(
        `Failed to insert record-event edge: ${recordEventError.message}`,
      );
    }

    // Create entity-event edges for entities involved in this event
    for (const entity of entities) {
      const { error: entityEventError } = await supabase
        .from("entity_event_edges")
        .insert({
          entity_id: entity.id,
          event_id: event.id,
          edge_type: "INVOLVES",
        });

      if (entityEventError) {
        console.error(
          `Failed to insert entity-event edge: ${entityEventError.message}`,
        );
      }
    }
  }

  // Insert relationships
  for (const rel of relationships) {
    const { data: relData, error: relError } = await supabase
      .from("record_relationships")
      .insert({
        source_id: recordId,
        target_id: rel.target_id,
        relationship: rel.relationship,
        metadata: rel.metadata || {},
      })
      .select()
      .single();

    if (relError) {
      // Log error but continue (partial failure handling)
      console.error(`Failed to insert relationship: ${relError.message}`);
    } else if (relData) {
      insertedRelationshipIds.push(relData.id);
    }
  }

  // Validate no cycles were created
  const cycles = await detectCycles();
  if (cycles.length > 0) {
    // Rollback by deleting inserted record (simplified - full rollback would need transaction)
    await supabase.from("records").delete().eq("id", recordId);
    throw new Error(
      `Graph insertion would create cycles: ${JSON.stringify(cycles)}`,
    );
  }

  return {
    recordId,
    entityIds: insertedEntityIds,
    eventIds: insertedEventIds,
    relationshipIds: insertedRelationshipIds,
  };
}
