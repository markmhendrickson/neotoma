import { db } from "../../db.js";
import { semanticSearchEntities } from "../../services/entity_semantic_search.js";
import { queryEntities } from "../../services/entity_queries.js";
import {
  entityIdTenantSalt,
  generateEntityId,
  normalizeEntityValue,
} from "../../services/entity_resolution.js";
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
  /**
   * Present only when `identifier` is shaped like an entity_id (`ent_<hex>`)
   * but no entity with that id exists for the caller. Points the caller at the
   * direct-fetch path instead of leaving a silent empty result (#1597).
   */
  hint?: string;
}

/**
 * An entity_id is `ent_` followed by lowercase hex (see
 * {@link generateEntityId}, which emits `ent_<24 hex>`). Matching the full hex
 * tail rather than a fixed width keeps the fast path resilient to any future
 * id width while never colliding with a natural-language identifier.
 */
const ENTITY_ID_PATTERN = /^ent_[0-9a-f]+$/i;

/**
 * Returned (as `hint`) when the caller passes an entity_id-shaped identifier
 * that resolves to nothing. `retrieve_entity_by_identifier` matches names /
 * aliases / snapshot fields, not primary keys; the direct fetch for a known id
 * is `retrieve_entity_snapshot` (#1597).
 */
export const ENTITY_ID_NOT_FOUND_HINT =
  "identifier looks like an entity_id; use retrieve_entity_snapshot(entity_id=…) for direct fetch";

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

/**
 * Field names that may be interpolated into a SQL column path.
 *
 * The exact pre-pass builds `lower(snapshot->>${field})` and hands it to the
 * query builder, which splices the column side into SQL literally (only the
 * compared *value* is parameterised). Any field name reaching that path must
 * therefore be a plain SQL identifier. This mirrors the pattern the sqlite
 * adapter's `normalizeColumnName` recognises — names outside it fall through
 * that function unchanged and would be interpolated raw.
 */
const SAFE_SNAPSHOT_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isSafeSnapshotFieldName(field: unknown): field is string {
  return typeof field === "string" && SAFE_SNAPSHOT_FIELD_PATTERN.test(field);
}

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
  // Raw entity_id fast path. Identifiers shaped like `ent_<hex>` are entity
  // ids, not natural-language values; canonical_name/snapshot/semantic matching
  // never resolves them (it instead surfaces tangential rows whose text mentions
  // the id, #1561, or nothing at all, #1550). Short-circuit to a primary-key
  // lookup so the target entity is the exclusive, top-ranked result. retrieve_
  // entity_snapshot already accepts raw ids; this aligns the two surfaces.
  const rawId = identifier.trim();
  if (ENTITY_ID_PATTERN.test(rawId)) {
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
    // degraded natural-language search. Return an empty result with total 0 and
    // a structured hint pointing at the direct-fetch path, so the empty result
    // is not silently misread as "no such entity" (#1550, #1597). Fuzzy / text /
    // name matching is reserved for non-id identifiers below.
    return {
      entities: [],
      total: 0,
      match_mode: "none",
      hint: ENTITY_ID_NOT_FOUND_HINT,
    };
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
  //
  // SECURITY: `by` is caller-supplied at the MCP surface and is interpolated
  // into a SQL column path (`lower(snapshot->>${field})`) by the exact pre-pass
  // below. The sqlite adapter's normalizeColumnName only recognises that shape
  // for `[A-Za-z_][A-Za-z0-9_]*` field names and otherwise returns the string
  // unchanged, which is then spliced raw into the filter clause (only the
  // *value* side is parameterised). An unvalidated `by` is therefore a SQL
  // injection vector. Reject anything that is not a plain identifier before it
  // can reach a query builder — the exact-pass is the only place `by` becomes
  // a column expression, so validating here covers every downstream use.
  // Validate on `by` itself rather than on the derived array: `by: ""` is
  // falsy, so a truthiness check would skip validation and silently fall
  // through to the no-`by` path instead of rejecting a malformed pin.
  if (by !== undefined && by !== null && !isSafeSnapshotFieldName(by)) {
    throw new Error(
      `Invalid \`by\` field name: ${JSON.stringify(by)}. ` +
        `Must match ${SAFE_SNAPSHOT_FIELD_PATTERN.source}.`
    );
  }
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
    const possibleId = generateEntityId(entityType, identifier, entityIdTenantSalt(userId));
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
    // Snapshot-field pass: resolve identifiers that never reached
    // canonical_name or aliases (e.g. an email/phone that isn't the
    // canonical_name) by matching declared identity fields in the snapshot.
    //
    // #1963-adjacent scale bug: the JS scan below loads an *unordered,
    // 500-row* window of entity_snapshots and filters in memory. On an
    // instance with thousands of entities, an exact email/phone whose row
    // sits outside that arbitrary window is never examined, so by="email"
    // /by="phone" lookups (and identify_entity_by_signals, which sits on
    // this) silently return nothing even for values present verbatim in a
    // snapshot. First do a targeted, index-friendly server-side exact match
    // on the known identity fields via `snapshot->>{field}`, which the DB can
    // satisfy from any row regardless of the window; keep the bounded JS scan
    // only as a fuzzy/token fallback.
    const snapshotMatches: SnapshotRow[] = [];

    // Server-side exact-equality pre-pass. When an explicit `by` is given,
    // only that field is scanned. Otherwise the field set must go through the
    // same per-type resolution as the JS-scan fallback (`snapshotFieldsForType`)
    // so type-declared identity_search_fields (e.g. financial_account's
    // institution/account_name, #1495) get exact-pass coverage too — not just
    // the generic base set. When `entityType` is filtered, the type is known
    // up front and its fields are resolved once; when it is not, the fields
    // are resolved per matched row's entity_type after fetching.
    //
    // Case-insensitive match: compares `lower(snapshot->>field)` against the
    // lowercased identifier so this pre-pass has the same case-insensitive
    // contract as the JS-scan fallback (`snapshotFieldsMatch` lowercases both
    // sides). Without this, a snapshot value stored with different casing
    // than the query (e.g. `Mixed.Case@Example.com` vs a lowercase query)
    // would silently fail to resolve via the exact pass, regressing the
    // scale-safety this fix exists to provide for mixed-case data (#1981).
    const exactMatchIds = new Set<string>();
    if (explicitFields) {
      for (const field of explicitFields) {
        let exactQuery = db
          .from("entity_snapshots")
          .select("entity_id, entity_type, snapshot")
          .eq("user_id", userId)
          .eq(`lower(snapshot->>${field})`, needleLower);
        if (entityType) {
          exactQuery = exactQuery.eq("entity_type", entityType);
        }
        const { data: exactRows } = await exactQuery.limit(limit);
        for (const row of (exactRows as SnapshotRow[] | null) || []) {
          if (exactMatchIds.has(row.entity_id)) continue;
          exactMatchIds.add(row.entity_id);
          snapshotMatches.push(row);
        }
      }
    } else if (entityType) {
      // Known type up front: resolve its identity_search_fields once and
      // query only those fields, exactly like the JS-scan fallback does.
      // Defence in depth: these come from the schema registry rather than the
      // caller, but they still become SQL column paths, so any name that isn't
      // a plain identifier is skipped here and left to the JS-scan fallback
      // (which does a safe in-memory property lookup) rather than interpolated.
      const fields = (await snapshotFieldsForType(entityType)).filter(isSafeSnapshotFieldName);
      for (const field of fields) {
        const { data: exactRows } = await db
          .from("entity_snapshots")
          .select("entity_id, entity_type, snapshot")
          .eq("user_id", userId)
          .eq("entity_type", entityType)
          .eq(`lower(snapshot->>${field})`, needleLower)
          .limit(limit);
        for (const row of (exactRows as SnapshotRow[] | null) || []) {
          if (exactMatchIds.has(row.entity_id)) continue;
          exactMatchIds.add(row.entity_id);
          snapshotMatches.push(row);
        }
      }
    } else {
      // No `by`, no entityType filter: the base set is queried directly
      // (cheap, index-friendly), but any row that only matches on a
      // type-declared field (not in the base set) is picked up by the
      // bounded JS-scan fallback below via snapshotFieldsForType per row.
      for (const field of BASE_SNAPSHOT_SEARCH_FIELDS) {
        const { data: exactRows } = await db
          .from("entity_snapshots")
          .select("entity_id, entity_type, snapshot")
          .eq("user_id", userId)
          .eq(`lower(snapshot->>${field})`, needleLower)
          .limit(limit);
        for (const row of (exactRows as SnapshotRow[] | null) || []) {
          if (exactMatchIds.has(row.entity_id)) continue;
          exactMatchIds.add(row.entity_id);
          snapshotMatches.push(row);
        }
      }
    }

    // Bounded JS scan for fuzzy/substring/token matches the exact pre-pass
    // can't express. Still capped, but now it only needs to catch the
    // non-exact cases — exact identifiers are already resolved above.
    let snapshotQuery = db
      .from("entity_snapshots")
      .select("entity_id, entity_type, snapshot")
      .eq("user_id", userId);
    if (entityType) {
      snapshotQuery = snapshotQuery.eq("entity_type", entityType);
    }
    const { data: snapshotRows } = await snapshotQuery.limit(500);
    for (const row of (snapshotRows as SnapshotRow[] | null) || []) {
      if (exactMatchIds.has(row.entity_id)) continue;
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

/**
 * Maximum identifiers accepted in one batch call (#1967).
 *
 * Each identifier runs the full resolution ladder (direct → snapshot-field →
 * semantic), and the semantic leg can hit the embedding backend, so the batch
 * is bounded to keep a single call's worst case predictable. Callers with more
 * than this should chunk. Exceeding the cap is a hard validation error rather
 * than a silent truncation — a silently dropped identifier would read as
 * "not found" and cause an agent to create a duplicate entity.
 */
export const MAX_BATCH_IDENTIFIERS = 100;

/**
 * Per-input outcome of a batch resolution (#1967).
 * - `resolved`  — exactly one entity matched.
 * - `ambiguous` — several entities matched; caller must disambiguate.
 * - `not_found` — nothing matched.
 * - `error`     — resolution threw for this identifier alone.
 *
 * `ambiguous` is deliberately distinct from `resolved`: an agent that treats a
 * multi-match as a hit silently picks an arbitrary entity.
 */
export type BatchResolutionStatus = "resolved" | "ambiguous" | "not_found" | "error";

export interface BatchIdentifierResult {
  /** Echoed input, so callers can zip results back to their source list. */
  identifier: string;
  /** Position in the caller's input array; stable even though order is preserved. */
  index: number;
  status: BatchResolutionStatus;
  /** The single match when status is "resolved"; otherwise null. */
  entity: RetrievedEntity | null;
  /** All matches when status is "ambiguous"; capped by `limit`. */
  candidates?: RetrievedEntity[];
  match_count: number;
  match_mode: IdentifierMatchMode;
  hint?: string;
  /** Present only when status is "error". */
  error?: string;
}

export interface BatchRetrieveByIdentifierResult {
  results: BatchIdentifierResult[];
  summary: {
    requested: number;
    resolved: number;
    ambiguous: number;
    not_found: number;
    errors: number;
  };
}

export interface BatchRetrieveByIdentifierParams extends Omit<
  RetrieveEntityByIdentifierParams,
  "identifier"
> {
  identifiers: string[];
}

/**
 * Resolve many identifiers in one call (#1967).
 *
 * Delegates each identifier to {@link retrieveEntityByIdentifierWithFallback},
 * so single- and batch-resolution semantics cannot drift: the batch form is a
 * strict fan-out over the existing, unchanged path.
 *
 * A failure for one identifier is captured as that entry's `error` status and
 * never aborts the batch — the point of the call is to learn the fate of every
 * input. Duplicate identifiers are resolved once and the result fanned back
 * out to each position.
 */
export async function retrieveEntitiesByIdentifiers(
  params: BatchRetrieveByIdentifierParams
): Promise<BatchRetrieveByIdentifierResult> {
  const { identifiers, ...rest } = params;

  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    throw new Error("identifiers must be a non-empty array");
  }
  if (identifiers.length > MAX_BATCH_IDENTIFIERS) {
    throw new Error(
      `Too many identifiers: ${identifiers.length} exceeds the ${MAX_BATCH_IDENTIFIERS} cap; ` +
        `split the request into chunks of at most ${MAX_BATCH_IDENTIFIERS}`
    );
  }

  // Resolve each distinct identifier once. Agents building a batch from a
  // document routinely repeat the same name.
  const distinct = [...new Set(identifiers)];
  const byIdentifier = new Map<string, Omit<BatchIdentifierResult, "index" | "identifier">>();

  for (const identifier of distinct) {
    try {
      const { entities, match_mode, hint } = await retrieveEntityByIdentifierWithFallback({
        ...rest,
        identifier,
      });

      const matches = entities ?? [];
      let status: BatchResolutionStatus;
      if (matches.length === 1) {
        status = "resolved";
      } else if (matches.length > 1) {
        status = "ambiguous";
      } else {
        status = "not_found";
      }

      byIdentifier.set(identifier, {
        status,
        entity: status === "resolved" ? matches[0] : null,
        ...(status === "ambiguous" ? { candidates: matches } : {}),
        match_count: matches.length,
        match_mode,
        ...(hint ? { hint } : {}),
      });
    } catch (error) {
      byIdentifier.set(identifier, {
        status: "error",
        entity: null,
        match_count: 0,
        match_mode: "none",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const results: BatchIdentifierResult[] = identifiers.map((identifier, index) => ({
    identifier,
    index,
    ...byIdentifier.get(identifier)!,
  }));

  return {
    results,
    summary: {
      requested: results.length,
      resolved: results.filter((r) => r.status === "resolved").length,
      ambiguous: results.filter((r) => r.status === "ambiguous").length,
      not_found: results.filter((r) => r.status === "not_found").length,
      errors: results.filter((r) => r.status === "error").length,
    },
  };
}
