/**
 * Graph Builder Service (FU-103)
 *
 * Transactional graph insertion with integrity enforcement (orphan detection, cycle prevention).
 */

import { supabase } from "../db.js";

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
  // Check for records with no relationships
  // This is a simplified check - in full implementation would check all edge types
  const orphanCounts = {
    orphanRecords: 0,
    orphanEntities: 0,
    orphanEvents: 0,
  };

  // For v0.1.0, orphan detection focuses on record_relationships
  // A record is an orphan if it has no relationships (record_relationships entries)
  const { data: allRecords } = await supabase.from("records").select("id");

  if (allRecords) {
    const recordIds = allRecords.map((r) => r.id);

    if (recordIds.length > 0) {
      const { data: relatedRecords } = await supabase
        .from("record_relationships")
        .select("source_id, target_id");

      if (relatedRecords) {
        const relatedIds = new Set<string>();
        for (const rel of relatedRecords) {
          relatedIds.add(rel.source_id);
          relatedIds.add(rel.target_id);
        }

        orphanCounts.orphanRecords = recordIds.filter(
          (id) => !relatedIds.has(id)
        ).length;
      } else {
        orphanCounts.orphanRecords = recordIds.length;
      }
    }
  }

  return orphanCounts;
}

/**
 * Detect cycles in relationships
 */
export async function detectCycles(
  relationshipType?: string
): Promise<string[][]> {
  const cycles: string[][] = [];

  // Get all relationships
  let query = supabase
    .from("record_relationships")
    .select("source_id, target_id, relationship");
  if (relationshipType) {
    query = query.eq("relationship", relationshipType);
  }

  const { data: relationships } = await query;

  if (!relationships || relationships.length === 0) {
    return cycles;
  }

  // Build adjacency map
  const graph = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!graph.has(rel.source_id)) {
      graph.set(rel.source_id, new Set());
    }
    graph.get(rel.source_id)!.add(rel.target_id);
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

  // For v0.1.0, orphan records are acceptable (records can exist without relationships)
  // Only cycles are considered invalid
  if (cycleCount > 0) {
    errors.push(`Found ${cycleCount} cycles in graph`);
  }

  return {
    valid: errors.length === 0, // Only cycles make it invalid
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
  entityIds: string[] = [],
  eventIds: string[] = [],
  relationships: Array<{
    target_id: string;
    relationship: string;
    metadata?: Record<string, unknown>;
  }> = []
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
      `Failed to insert record: ${recordError?.message || "Unknown error"}`
    );
  }

  const recordId = recordData.id;
  const insertedEntityIds: string[] = [];
  const insertedEventIds: string[] = [];
  const insertedRelationshipIds: string[] = [];

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
      `Graph insertion would create cycles: ${JSON.stringify(cycles)}`
    );
  }

  return {
    recordId,
    entityIds: insertedEntityIds,
    eventIds: insertedEventIds,
    relationshipIds: insertedRelationshipIds,
  };
}
