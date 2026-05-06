/**
 * Dashboard Statistics Service (FU-305)
 * 
 * Provides aggregate statistics for main objects (not deprecated records)
 */

import { db } from "../db.js";

export interface DashboardStats {
  sources_count: number;
  entities_by_type: Record<string, number>;
  total_entities: number;
  total_relationships: number;
  total_events: number;
  total_observations: number;
  total_interpretations: number;
  /**
   * Count of observations per structured identity basis (R4 telemetry).
   * Keys are values of {@link IdentityBasis} — `schema_rule`,
   * `heuristic_name`, `heuristic_fallback`, `target_id`. Observations
   * written before the identity_basis column existed appear under
   * `unclassified`.
   */
  observations_by_identity_basis: Record<string, number>;
  /**
   * Count of observations per structured identity basis for each entity_type
   * (R4 telemetry). Outer key is entity_type; inner key is basis.
   */
  observations_by_identity_basis_by_type: Record<string, Record<string, number>>;
  last_updated: string;
}

/**
 * Get dashboard statistics for main objects
 */
export async function getDashboardStats(userId?: string): Promise<DashboardStats> {
  const stats: DashboardStats = {
    sources_count: 0,
    entities_by_type: {},
    total_entities: 0,
    total_relationships: 0,
    total_events: 0,
    total_observations: 0,
    total_interpretations: 0,
    observations_by_identity_basis: {},
    observations_by_identity_basis_by_type: {},
    last_updated: new Date().toISOString(),
  };

  // Get source count
  let sourcesQuery = db
    .from("sources")
    .select("*", { count: "exact", head: true });
  
  if (userId) {
    sourcesQuery = sourcesQuery.eq("user_id", userId);
  }
  
  const { count: sourcesCount } = await sourcesQuery;
  stats.sources_count = sourcesCount || 0;

  // Get entities by type
  let entitiesQuery = db
    .from("entities")
    .select("entity_type", { count: "exact" })
    .is("merged_to_entity_id", null); // Exclude merged entities
  
  if (userId) {
    entitiesQuery = entitiesQuery.eq("user_id", userId);
  }
  
  const { data: entities, error: entitiesError } = await entitiesQuery;
  
  if (!entitiesError && entities) {
    // Count entities by type
    const typeCounts = new Map<string, number>();
    for (const entity of entities) {
      const type = entity.entity_type;
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    
    stats.entities_by_type = Object.fromEntries(typeCounts);
    stats.total_entities = entities.length;
  }

  // Get total events count
  // Note: timeline_events table doesn't have user_id column
  // User filtering should be done through source_id -> sources.user_id if needed
  // For now, we rely on RLS policies to enforce user isolation
  const { count: eventsCount } = await db
    .from("timeline_events")
    .select("*", { count: "exact", head: true });
  stats.total_events = eventsCount || 0;

  // Get total observations count
  let observationsQuery = db
    .from("observations")
    .select("*", { count: "exact", head: true });
  
  if (userId) {
    observationsQuery = observationsQuery.eq("user_id", userId);
  }
  
  const { count: observationsCount } = await observationsQuery;
  stats.total_observations = observationsCount || 0;

  // R4: observations bucketed by identity_basis (and by entity_type for
  // per-schema triage). Rows written before this column existed are
  // bucketed as "unclassified" so operators can see coverage grow over time.
  let basisQuery = db
    .from("observations")
    .select("entity_type, identity_basis");
  if (userId) {
    basisQuery = basisQuery.eq("user_id", userId);
  }
  const { data: basisRows, error: basisError } = await basisQuery;
  if (!basisError && basisRows) {
    // Keep total and buckets internally consistent when concurrent test writes
    // land between the count query and the bucket query.
    stats.total_observations = Math.max(stats.total_observations, basisRows.length);
    const totals = new Map<string, number>();
    const byType = new Map<string, Map<string, number>>();
    for (const row of basisRows as Array<{
      entity_type?: string | null;
      identity_basis?: string | null;
    }>) {
      const basis = row.identity_basis || "unclassified";
      totals.set(basis, (totals.get(basis) || 0) + 1);

      const type = row.entity_type || "unknown";
      if (!byType.has(type)) byType.set(type, new Map());
      const bucket = byType.get(type)!;
      bucket.set(basis, (bucket.get(basis) || 0) + 1);
    }
    stats.observations_by_identity_basis = Object.fromEntries(totals);
    stats.observations_by_identity_basis_by_type = Object.fromEntries(
      Array.from(byType.entries()).map(([t, m]) => [t, Object.fromEntries(m)]),
    );
  }

  // Get total relationships count (relationship_snapshots)
  let relationshipsQuery = db
    .from("relationship_snapshots")
    .select("*", { count: "exact", head: true });
  if (userId) {
    relationshipsQuery = relationshipsQuery.eq("user_id", userId);
  }
  const { count: relationshipsCount } = await relationshipsQuery;
  stats.total_relationships = relationshipsCount || 0;

  // Get total interpretations count
  let interpretationsQuery = db
    .from("interpretations")
    .select("*", { count: "exact", head: true });
  
  if (userId) {
    interpretationsQuery = interpretationsQuery.eq("user_id", userId);
  }
  
  const { count: interpretationsCount } = await interpretationsQuery;
  stats.total_interpretations = interpretationsCount || 0;

  return stats;
}
