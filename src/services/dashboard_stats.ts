/**
 * Dashboard Statistics Service (FU-305)
 * 
 * Provides aggregate statistics for main objects (not deprecated records)
 */

import { supabase } from "../db.js";

export interface DashboardStats {
  sources_count: number;
  entities_by_type: Record<string, number>;
  total_entities: number;
  total_relationships: number;
  total_events: number;
  total_observations: number;
  total_interpretations: number;
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
    last_updated: new Date().toISOString(),
  };

  // Get source count
  let sourcesQuery = supabase
    .from("sources")
    .select("*", { count: "exact", head: true });
  
  if (userId) {
    sourcesQuery = sourcesQuery.eq("user_id", userId);
  }
  
  const { count: sourcesCount } = await sourcesQuery;
  stats.sources_count = sourcesCount || 0;

  // Get entities by type
  let entitiesQuery = supabase
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
  const { count: eventsCount } = await supabase
    .from("timeline_events")
    .select("*", { count: "exact", head: true });
  stats.total_events = eventsCount || 0;

  // Get total observations count
  let observationsQuery = supabase
    .from("observations")
    .select("*", { count: "exact", head: true });
  
  if (userId) {
    observationsQuery = observationsQuery.eq("user_id", userId);
  }
  
  const { count: observationsCount } = await observationsQuery;
  stats.total_observations = observationsCount || 0;

  // Get total relationships count (relationship_snapshots)
  let relationshipsQuery = supabase
    .from("relationship_snapshots")
    .select("*", { count: "exact", head: true });
  if (userId) {
    relationshipsQuery = relationshipsQuery.eq("user_id", userId);
  }
  const { count: relationshipsCount } = await relationshipsQuery;
  stats.total_relationships = relationshipsCount || 0;

  // Get total interpretations count
  let interpretationsQuery = supabase
    .from("interpretations")
    .select("*", { count: "exact", head: true });
  
  if (userId) {
    interpretationsQuery = interpretationsQuery.eq("user_id", userId);
  }
  
  const { count: interpretationsCount } = await interpretationsQuery;
  stats.total_interpretations = interpretationsCount || 0;

  return stats;
}
