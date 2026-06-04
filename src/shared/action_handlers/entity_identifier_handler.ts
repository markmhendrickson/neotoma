import { db } from "../../db.js";
import { semanticSearchEntities } from "../../services/entity_semantic_search.js";
import { queryEntities } from "../../services/entity_queries.js";
import { generateEntityId, normalizeEntityValue } from "../../services/entity_resolution.js";
import { resolveIdentitySearchFields } from "../../services/schema_registry.js";
import { logger } from "../../utils/logger.js";

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

/**
 * Which resolution pass produced the result set. Surfaced to callers via the
 * `match_mode` response field so a relaxed fallback is distinguishable from a
 * direct identifier hit (#1495 silent-behavior advisory).
 * - `direct` — canonical_name / alias match, or derived-id lookup.
 * - `snapshot_field` — matched an identity-bearing snapshot field (generic base
 *   or schema `identity_search_fields`).
 * - `semantic` — vector-similarity fallback.
 * - `none` — no match.
 */
export type IdentifierMatchMode = "direct" | "snapshot_field" | "semantic" | "none";

export interface RetrieveEntityByIdentifierResult {
  entities: RetrievedEntity[];
  total: number;
  match_mode: IdentifierMatchMode;
}

/**
 * Generic identity-bearing snapshot fields scanned for ALL entity types when
 * canonical_name/alias matching misses. Type-specific identity fields (e.g.
 * `institution` / `account_name` for `financial_account`, #1495) are NOT
 * listed here — they are declared per type via
 * `SchemaDefinition.identity_search_fields` and merged in at runtime by
 * {@link resolveIdentitySearchFields}. This keeps the generic handler free of
 * per-type field knowledge per docs/foundation/schema_agnostic_design_rules.md.
 */
const BASE_SNAPSHOT_SEARCH_FIELDS = [
  "name",
  "full_name",
  "title",
  "email",
  "domain",
  "company",
] as const;

type SnapshotRow = {
  entity_id: string;
  entity_type: string;
  snapshot: Record<string, unknown> | null;
};

function snapshotFieldsMatch(
  snapshot: Record<string, unknown> | null,
  needleLower: string,
  fields: readonly string[]
): boolean {
  if (!snapshot) return false;
  // Leading token of a compound identifier (e.g. "ibercaja regular (spain
  // domestic)" → "ibercaja") so a single-word institution name resolves a
  // financial_account whose snapshot institution holds only that word (#1495).
  const needleLeadingToken = needleLower.split(/\s+/).filter(Boolean)[0] ?? needleLower;
  for (const field of fields) {
    const value = (snapshot as Record<string, unknown>)[field];
    if (value == null) continue;
    const str = String(value).trim().toLowerCase();
    if (!str) continue;
    if (str === needleLower) return true;
    if (str.includes(needleLower)) return true;
    if (field === "email" && str.split("@").pop() === needleLower) return true;
    // Token-level match: the field value equals the leading token of a compound
    // needle, or the needle equals the leading token of a compound field value.
    if (str === needleLeadingToken) return true;
    const fieldLeadingToken = str.split(/\s+/).filter(Boolean)[0] ?? str;
    if (fieldLeadingToken === needleLower) return true;
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
  // Raw entity_id fast path. Identifiers shaped like `ent_<24 hex>` are entity
  // ids, not natural-language values; canonical_name/snapshot/semantic matching
  // never resolves them, so without this they returned empty. retrieve_entity_
  // snapshot already accepts raw ids; this aligns retrieve_entity_by_identifier.
  const rawId = identifier.trim();
  if (/^ent_[0-9a-f]{24}$/i.test(rawId)) {
    const { data: byId, error: byIdError } = await db
      .from("entities")
      .select("*")
      .eq("id", rawId)
      .eq("user_id", userId)
      .maybeSingle();
    if (byIdError) {
      throw new Error(`Failed to look up entity by id: ${byIdError.message}`);
    }
    if (byId) {
      const { data: snap } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("user_id", userId)
        .eq("entity_id", (byId as { id: string }).id)
        .maybeSingle();
      const mapped: RetrievedEntity = {
        id: (byId as { id: string }).id,
        entity_type: (byId as { entity_type: string }).entity_type,
        canonical_name: (byId as { canonical_name: string }).canonical_name,
        snapshot: snap ?? null,
      };
      const withObs = includeObservations
        ? await attachObservations([mapped], userId, observationsLimit)
        : [mapped];
      // A raw `ent_<hash>` id lookup is a derived-id direct hit (see
      // IdentifierMatchMode docs: `direct` covers derived-id lookups).
      return { entities: withObs, total: withObs.length, match_mode: "direct" };
    }
    // A well-formed but unknown entity id is an explicit not-found, not a
    // degraded natural-language search. Return an empty result with total 0;
    // callers distinguish "no such id" from a name miss by the id-shaped input.
    return { entities: [], total: 0, match_mode: "none" };
  }

  const normalizedRaw = entityType
    ? normalizeEntityValue(entityType, identifier)
    : identifier.trim().toLowerCase();
  // SECURITY: strip commas before interpolating into a PostgREST-style
  // .or(...) clause; the builder splits parts on commas. See docs/reports/
  // security_audit_2026_04_22.md S-3.
  const normalized = normalizedRaw.replace(/,/g, "");
  const needleLower = identifier.trim().toLowerCase();
  // When the caller pins a field via `by`, scan only that field. Otherwise the
  // per-entity_type snapshot fields are resolved from the schema registry
  // during the snapshot-field pass below (generic base + declared
  // identity_search_fields), so a financial_account's institution/account_name
  // are scanned without hardcoding finance fields here (#1495).
  const explicitFields = by ? [by] : null;
  // Cache resolved field sets per entity_type for the duration of one call so
  // a cross-type snapshot scan does not re-load the same schema repeatedly.
  const fieldsByEntityType = new Map<string, string[]>();
  async function snapshotFieldsForType(rowEntityType: string): Promise<string[]> {
    if (explicitFields) return explicitFields;
    const cached = fieldsByEntityType.get(rowEntityType);
    if (cached) return cached;
    const { fields, usedFallback } = await resolveIdentitySearchFields(
      rowEntityType,
      BASE_SNAPSHOT_SEARCH_FIELDS,
      userId
    );
    if (usedFallback) {
      // Structured, entity-type-keyed warning so heuristic fallbacks are
      // auditable (schema_agnostic_design_rules.md). Only the generic base
      // set was used; a type with identity-bearing snapshot fields should
      // declare identity_search_fields.
      logger.warn(
        `[retrieveEntityByIdentifier] no identity_search_fields declared for entity_type=` +
          `${rowEntityType}; using generic snapshot field set for identifier resolution`
      );
    }
    fieldsByEntityType.set(rowEntityType, fields);
    return fields;
  }

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
    const snapshotMatches: SnapshotRow[] = [];
    for (const row of (snapshotRows as SnapshotRow[] | null) || []) {
      const fields = await snapshotFieldsForType(row.entity_type);
      if (snapshotFieldsMatch(row.snapshot, needleLower, fields)) {
        snapshotMatches.push(row);
      }
    }
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
          match_mode: "snapshot_field",
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
      return { entities: [], total: 0, match_mode: "none" };
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
      match_mode: "semantic",
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
    match_mode: "direct",
  };
}
