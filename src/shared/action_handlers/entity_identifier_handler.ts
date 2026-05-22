import { db } from "../../db.js";
import { semanticSearchEntities } from "../../services/entity_semantic_search.js";
import { queryEntities } from "../../services/entity_queries.js";
import { generateEntityId, normalizeEntityValue } from "../../services/entity_resolution.js";

type RetrievedEntity = {
  id: string;
  entity_type: string;
  canonical_name: string;
  snapshot: unknown;
  /**
   * Optionally included when the caller sets `include_observations = true`.
   * Ordered by observed_at descending, capped by `observations_limit`.
   */
  observations?: unknown[];
};

export interface RetrieveEntityByIdentifierParams {
  identifier: string;
  entityType?: string;
  userId: string;
  limit?: number;
  /**
   * Restrict snapshot matching to a specific field (e.g. "email", "domain",
   * "company"). When omitted, a default set of identity-bearing fields is
   * checked (name, full_name, title, email, domain, company).
   */
  by?: string;
  /**
   * When true, attach the latest observations to each returned entity so
   * callers can resolve, snapshot, and hydrate observations in a single
   * round-trip.
   */
  includeObservations?: boolean;
  /**
   * Maximum observations to attach per entity (default 20, max 200).
   * Ignored when includeObservations is false.
   */
  observationsLimit?: number;
}

export interface RetrieveEntityByIdentifierResult {
  entities: RetrievedEntity[];
  total: number;
}

/**
 * Fields to scan inside entity snapshots when canonical_name/alias matching
 * misses. Keep this conservative: email and domain surfaces are the highest
 * signal for natural-language identifiers.
 */
const DEFAULT_SNAPSHOT_SEARCH_FIELDS = [
  "name",
  "full_name",
  "title",
  "email",
  "domain",
  "company",
] as const;

type SnapshotRow = {
  entity_id: string;
  snapshot: Record<string, unknown> | null;
};

function snapshotFieldsMatch(
  snapshot: Record<string, unknown> | null,
  needleLower: string,
  fields: readonly string[]
): boolean {
  if (!snapshot) return false;
  for (const field of fields) {
    const value = (snapshot as Record<string, unknown>)[field];
    if (value == null) continue;
    const str = String(value).trim().toLowerCase();
    if (!str) continue;
    if (str === needleLower) return true;
    if (str.includes(needleLower)) return true;
    if (field === "email" && str.split("@").pop() === needleLower) return true;
  }
  return false;
}

async function attachObservations(
  entities: RetrievedEntity[],
  userId: string,
  observationsLimit: number
): Promise<RetrievedEntity[]> {
  if (entities.length === 0) return entities;
  const entityIds = entities.map((e) => e.id);
  // Supabase / sqlite adapter doesn't support window-function-based limit-per-group,
  // so fetch a bounded slice per entity. For typical agent flows limit is small
  // (default 20), and identifier lookups rarely return more than a handful of
  // entities, so N round-trips remain cheap relative to three separate MCP calls.
  const safeLimit = Math.min(Math.max(observationsLimit, 1), 200);
  const results: RetrievedEntity[] = [];
  for (const entity of entities) {
    const { data: obs } = await db
      .from("observations")
      .select("*")
      .eq("user_id", userId)
      .eq("entity_id", entity.id)
      .order("observed_at", { ascending: false })
      .limit(safeLimit);
    results.push({ ...entity, observations: obs || [] });
  }
  void entityIds;
  return results;
}

export async function retrieveEntityByIdentifierWithFallback(
  params: RetrieveEntityByIdentifierParams
): Promise<RetrieveEntityByIdentifierResult> {
  const {
    identifier,
    entityType,
    userId,
    limit = 100,
    by,
    includeObservations = false,
    observationsLimit = 20,
  } = params;
  const normalizedRaw = entityType
    ? normalizeEntityValue(entityType, identifier)
    : identifier.trim().toLowerCase();
  // SECURITY: strip commas before interpolating into a PostgREST-style
  // .or(...) clause; the builder splits parts on commas. See docs/reports/
  // security_audit_2026_04_22.md S-3.
  const normalized = normalizedRaw.replace(/,/g, "");
  const needleLower = identifier.trim().toLowerCase();
  const snapshotFields = by ? [by] : DEFAULT_SNAPSHOT_SEARCH_FIELDS;

  let query = db
    .from("entities")
    .select("*")
    .eq("user_id", userId)
    .or(`canonical_name.ilike.%${normalized}%,aliases.cs.["${normalized}"]`)
    .order("canonical_name", { ascending: true })
    .order("id", { ascending: true });

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  const { data: entities, error } = await query.limit(limit);
  if (error) {
    throw new Error(`Failed to search entities: ${error.message}`);
  }

  let directEntities = entities || [];
  if (directEntities.length === 0 && entityType) {
    const possibleId = generateEntityId(entityType, identifier);
    const { data: entityById, error: idError } = await db
      .from("entities")
      .select("*")
      .eq("id", possibleId)
      .eq("user_id", userId)
      .single();

    if (!idError && entityById) {
      directEntities = [entityById];
    }
  }

  if (directEntities.length === 0) {
    // Snapshot-field pass: walk entity_snapshots (optionally filtered by type)
    // and JS-match name/title/email/domain/company so identifiers that never
    // reached canonical_name or aliases still resolve.
    let snapshotQuery = db
      .from("entity_snapshots")
      .select("entity_id, entity_type, snapshot")
      .eq("user_id", userId);
    if (entityType) {
      snapshotQuery = snapshotQuery.eq("entity_type", entityType);
    }
    const { data: snapshotRows } = await snapshotQuery.limit(500);
    const snapshotMatches = ((snapshotRows as SnapshotRow[] | null) || []).filter((row) =>
      snapshotFieldsMatch(row.snapshot, needleLower, snapshotFields)
    );
    if (snapshotMatches.length > 0) {
      const matchedIds = snapshotMatches.map((r) => r.entity_id);
      const snapshotEntities = await queryEntities({
        userId,
        includeMerged: false,
        entityIds: matchedIds,
        limit,
        offset: 0,
      });
      if (snapshotEntities.length > 0) {
        const mapped: RetrievedEntity[] = snapshotEntities.map((entity) => ({
          id: entity.entity_id,
          entity_type: entity.entity_type,
          canonical_name: entity.canonical_name,
          snapshot: entity.snapshot,
        }));
        const withObservations = includeObservations
          ? await attachObservations(mapped, userId, observationsLimit)
          : mapped;
        return {
          entities: withObservations,
          total: withObservations.length,
        };
      }
    }

    const { entityIds, total } = await semanticSearchEntities({
      searchText: identifier,
      userId,
      entityType,
      includeMerged: false,
      limit,
      offset: 0,
    });

    if (entityIds.length === 0) {
      return { entities: [], total: 0 };
    }

    const semanticEntities = await queryEntities({
      userId,
      includeMerged: false,
      entityIds,
      limit,
      offset: 0,
    });

    const semanticMapped: RetrievedEntity[] = semanticEntities.map((entity) => ({
      id: entity.entity_id,
      entity_type: entity.entity_type,
      canonical_name: entity.canonical_name,
      snapshot: entity.snapshot,
    }));
    const semanticWithObservations = includeObservations
      ? await attachObservations(semanticMapped, userId, observationsLimit)
      : semanticMapped;

    return {
      entities: semanticWithObservations,
      total,
    };
  }

  const entityIds = directEntities.map((entity: { id: string }) => entity.id);
  const { data: snapshots } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("user_id", userId)
    .in("entity_id", entityIds);

  const snapshotMap = new Map(
    (snapshots || []).map((snapshot: { entity_id: string }) => [snapshot.entity_id, snapshot])
  );
  const entitiesWithSnapshots = directEntities.map((entity: any) => ({
    ...entity,
    snapshot: snapshotMap.get(entity.id) || null,
  }));

  let finalEntities: any[] = entitiesWithSnapshots;
  if (includeObservations) {
    const adapted: RetrievedEntity[] = entitiesWithSnapshots.map((entity: any) => ({
      id: entity.id,
      entity_type: entity.entity_type,
      canonical_name: entity.canonical_name,
      snapshot: entity.snapshot,
    }));
    const withObs = await attachObservations(adapted, userId, observationsLimit);
    const obsById = new Map(withObs.map((e) => [e.id, e.observations ?? []]));
    finalEntities = entitiesWithSnapshots.map((entity: any) => ({
      ...entity,
      observations: obsById.get(entity.id) ?? [],
    }));
  }

  return {
    entities: finalEntities,
    total: finalEntities.length,
  };
}
