/**
 * Usage Statistics Service
 *
 * Provides aggregate usage statistics for the Inspector Usage view.
 * All data is computed from local data only — no external calls.
 */

import { db } from "../db.js";

export interface UsageStats {
  /** Count of active (non-merged) entities per entity_type, sorted by count desc. */
  entities_by_type: Record<string, number>;
  /** Total active entities. */
  total_entities: number;
  /** Count of observations grouped by observation_source. */
  observations_by_source: Record<string, number>;
  /** Total observations. */
  total_observations: number;
  /** Number of entities created in the last 7 days. */
  entities_created_last_7_days: number;
  /** Number of entities created in the last 30 days. */
  entities_created_last_30_days: number;
  /** Number of distinct entity_types that have a registered schema. */
  entity_types_with_schema: number;
  /** Total distinct entity_types present in the entities table. */
  entity_types_total: number;
  last_updated: string;
}

/**
 * Get usage statistics scoped to the authenticated user.
 * All queries are local-only — no external API calls are made.
 */
export async function getUsageStats(userId?: string): Promise<UsageStats> {
  const now = new Date();
  const cutoff7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const stats: UsageStats = {
    entities_by_type: {},
    total_entities: 0,
    observations_by_source: {},
    total_observations: 0,
    entities_created_last_7_days: 0,
    entities_created_last_30_days: 0,
    entity_types_with_schema: 0,
    entity_types_total: 0,
    last_updated: now.toISOString(),
  };

  // --- Entities by type (active only) ---
  let entitiesQuery = db
    .from("entities")
    .select("entity_type, created_at")
    .is("merged_to_entity_id", null);
  if (userId) {
    entitiesQuery = entitiesQuery.eq("user_id", userId);
  }
  const { data: entities, error: entitiesError } = await entitiesQuery;
  if (!entitiesError && entities) {
    const typeCounts = new Map<string, number>();
    let recent7 = 0;
    let recent30 = 0;
    for (const row of entities as Array<{ entity_type: string; created_at: string }>) {
      typeCounts.set(row.entity_type, (typeCounts.get(row.entity_type) || 0) + 1);
      if (row.created_at >= cutoff7) recent7++;
      if (row.created_at >= cutoff30) recent30++;
    }
    // Sort by count descending, then type name ascending for stability.
    const sorted = Array.from(typeCounts.entries()).sort(([aKey, aVal], [bKey, bVal]) => {
      const diff = bVal - aVal;
      return diff !== 0 ? diff : aKey.localeCompare(bKey);
    });
    stats.entities_by_type = Object.fromEntries(sorted);
    stats.total_entities = entities.length;
    stats.entity_types_total = typeCounts.size;
    stats.entities_created_last_7_days = recent7;
    stats.entities_created_last_30_days = recent30;
  }

  // --- Observations by source ---
  let obsQuery = db.from("observations").select("observation_source");
  if (userId) {
    obsQuery = obsQuery.eq("user_id", userId);
  }
  const { data: obsRows, error: obsError } = await obsQuery;
  if (!obsError && obsRows) {
    stats.total_observations = obsRows.length;
    const sourceCounts = new Map<string, number>();
    for (const row of obsRows as Array<{ observation_source: string | null }>) {
      const src = row.observation_source ?? "unclassified";
      sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
    }
    // Sort by count descending, then source name ascending.
    const sorted = Array.from(sourceCounts.entries()).sort(([aKey, aVal], [bKey, bVal]) => {
      const diff = bVal - aVal;
      return diff !== 0 ? diff : aKey.localeCompare(bKey);
    });
    stats.observations_by_source = Object.fromEntries(sorted);
  }

  // --- Schema coverage: entity types with a registered schema ---
  // The schema_registry table holds one row per registered entity_type.
  const { data: schemaRows, error: schemaError } = await db
    .from("schema_registry")
    .select("entity_type");
  if (!schemaError && schemaRows) {
    const registeredTypes = new Set(
      (schemaRows as Array<{ entity_type: string }>).map((r) => r.entity_type)
    );
    // Count how many distinct entity types in the entities table have a registered schema.
    const distinctTypes = new Set(Object.keys(stats.entities_by_type));
    stats.entity_types_with_schema = [...distinctTypes].filter((t) =>
      registeredTypes.has(t)
    ).length;
  }

  return stats;
}
