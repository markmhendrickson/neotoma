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

export interface UsageStats {
  entities_by_type: Record<string, number>;
  total_entities: number;
  observations_by_source: Record<string, number>;
  total_observations: number;
  entities_created_last_7_days: number;
  entities_created_last_30_days: number;
  entity_types_with_schema: number;
  entity_types_total: number;
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
  let sourcesQuery = db.from("sources").select("*", { count: "exact", head: true });

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
  let observationsQuery = db.from("observations").select("*", { count: "exact", head: true });

  if (userId) {
    observationsQuery = observationsQuery.eq("user_id", userId);
  }

  const { count: observationsCount } = await observationsQuery;
  stats.total_observations = observationsCount || 0;

  // R4: observations bucketed by identity_basis (and by entity_type for
  // per-schema triage). Rows written before this column existed are
  // bucketed as "unclassified" so operators can see coverage grow over time.
  let basisQuery = db.from("observations").select("entity_type, identity_basis");
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
      Array.from(byType.entries()).map(([t, m]) => [t, Object.fromEntries(m)])
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
  let interpretationsQuery = db.from("interpretations").select("*", { count: "exact", head: true });

  if (userId) {
    interpretationsQuery = interpretationsQuery.eq("user_id", userId);
  }

  const { count: interpretationsCount } = await interpretationsQuery;
  stats.total_interpretations = interpretationsCount || 0;

  return stats;
}

/**
 * Get aggregate usage statistics for the Inspector usage page.
 */
export async function getUsageStats(userId: string): Promise<UsageStats> {
  const lastUpdated = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const stats: UsageStats = {
    entities_by_type: {},
    total_entities: 0,
    observations_by_source: {},
    total_observations: 0,
    entities_created_last_7_days: 0,
    entities_created_last_30_days: 0,
    entity_types_with_schema: 0,
    entity_types_total: 0,
    last_updated: lastUpdated,
  };

  const { data: entities, error: entitiesError } = await db
    .from("entities")
    .select("entity_type, created_at")
    .eq("user_id", userId)
    .is("merged_to_entity_id", null);

  if (entitiesError) {
    throw new Error(`Failed to load usage entity counts: ${entitiesError.message}`);
  }

  const entitiesByType = new Map<string, number>();
  for (const entity of (entities ?? []) as Array<{
    entity_type?: string | null;
    created_at?: string | null;
  }>) {
    const type = entity.entity_type || "unknown";
    entitiesByType.set(type, (entitiesByType.get(type) || 0) + 1);

    const createdAt = entity.created_at;
    if (createdAt && createdAt >= sevenDaysAgo) {
      stats.entities_created_last_7_days += 1;
    }
    if (createdAt && createdAt >= thirtyDaysAgo) {
      stats.entities_created_last_30_days += 1;
    }
  }

  stats.entities_by_type = Object.fromEntries(
    Array.from(entitiesByType.entries()).sort(([typeA, countA], [typeB, countB]) => {
      if (countB !== countA) return countB - countA;
      return typeA.localeCompare(typeB);
    })
  );
  stats.total_entities = entities?.length ?? 0;
  stats.entity_types_total = entitiesByType.size;

  const { data: observations, error: observationsError } = await db
    .from("observations")
    .select("observation_source")
    .eq("user_id", userId);

  if (observationsError) {
    throw new Error(`Failed to load usage observation counts: ${observationsError.message}`);
  }

  const observationsBySource = new Map<string, number>();
  for (const observation of (observations ?? []) as Array<{ observation_source?: string | null }>) {
    const source = observation.observation_source || "unclassified";
    observationsBySource.set(source, (observationsBySource.get(source) || 0) + 1);
  }
  stats.observations_by_source = Object.fromEntries(
    Array.from(observationsBySource.entries()).sort(([sourceA, countA], [sourceB, countB]) => {
      if (countB !== countA) return countB - countA;
      return sourceA.localeCompare(sourceB);
    })
  );
  stats.total_observations = observations?.length ?? 0;

  const { data: schemas, error: schemasError } = await db
    .from("schema_registry")
    .select("entity_type")
    .eq("active", true)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (schemasError) {
    throw new Error(`Failed to load usage schema coverage: ${schemasError.message}`);
  }

  const schemaTypes = new Set(
    ((schemas ?? []) as Array<{ entity_type?: string | null }>)
      .map((schema) => schema.entity_type)
      .filter((type): type is string => Boolean(type))
  );
  stats.entity_types_with_schema = Array.from(entitiesByType.keys()).filter((type) =>
    schemaTypes.has(type)
  ).length;

  return stats;
}
