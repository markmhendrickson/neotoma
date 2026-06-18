import { db } from "../../db.js";
import { queryEntities, normalizeEntityTypeFilter } from "../../services/entity_queries.js";
import { BOOKKEEPING_ENTITY_TYPES } from "../../services/memory_export.js";
import { suggestSingular } from "../../services/entity_type_guard.js";
import { logger } from "../../utils/logger.js";
import { semanticSearchEntities } from "../../services/entity_semantic_search.js";
import { loadConceptTypeSynonyms } from "../../services/schema_registry.js";
import type { EntityWithProvenance } from "../../services/entity_queries.js";

// Shared, dependency-free normalizer (#1572). Imported (and re-exported below
// for back-compat) so the schema registry can use the same function without an
// import cycle. See src/shared/search_normalization.ts.
import { normalizeSearchText } from "../search_normalization.js";

export interface SnapshotFilter {
  op: "eq" | "in" | "gt" | "lt" | "gte" | "lte" | "contains";
  value?: unknown;
}

interface QueryEntitiesParams {
  userId: string;
  entityType?: string;
  /**
   * Multi-type filter. When non-empty, results are restricted to entities whose
   * `entity_type` is in this list (an IN filter), OR-combined with the singular
   * `entityType`. Honored on the plain-listing, lexical, and semantic search
   * paths so a non-empty value is never silently ignored (#1562).
   */
  entityTypes?: string[];
  includeMerged?: boolean;
  includeSnapshots?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  published?: boolean;
  publishedAfter?: string;
  publishedBefore?: string;
  search?: string;
  similarityThreshold?: number;
  limit?: number;
  offset?: number;
  updatedSince?: string;
  createdSince?: string;
  /** R3: filter entities by the identity_basis carried on their observations. */
  identityBasis?:
    | "schema_rule"
    | "schema_lookup"
    | "heuristic_name"
    | "heuristic_fallback"
    | "target_id";
  snapshotFilters?: Record<string, SnapshotFilter>;
  /**
   * When true, omit chat bookkeeping types (`conversation`, `conversation_message`,
   * etc.) from results. Default false — bookkeeping is included unless the caller
   * opts in. Has no effect when `entityType` already filters to a bookkeeping type.
   */
  excludeBookkeeping?: boolean;
}

const MAX_LEXICAL_CANDIDATES = 5000;

/** Extra lexical/semantic rank when a query token equals the row's entity_type (e.g. "plan" → plan). */
export const ENTITY_TYPE_KEYWORD_BOOST = 280;

/**
 * Generic English stopwords that carry no identity signal in a descriptive
 * multi-term query. Used only by the partial-token fallback (#1551) to avoid
 * letting filler words inflate overlap scores; strict all-token matching is
 * unaffected. Intentionally limited to domain-agnostic function words — no
 * site- or fixture-specific noise tokens (#1573): precision on descriptive
 * queries is the job of PARTIAL_MATCH_MIN_OVERLAP_RATIO, not an ad-hoc
 * denylist that would accrete a new entry every time a query trips the gate.
 */
const PARTIAL_MATCH_STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "of",
  "for",
  "with",
]);

/**
 * Minimum fraction of meaningful query tokens an entity must contain for the
 * partial-token fallback to surface it (#1551). Keeps precision reasonable on
 * long descriptive queries while still recovering rows that overlap most terms.
 */
const PARTIAL_MATCH_MIN_OVERLAP_RATIO = 0.5;

/**
 * Concept tokens / phrases present in a query that bridge to entity types.
 * Scans single tokens and adjacent token pairs (e.g. "bank account"). The
 * concept → entity_type map is supplied by the caller from schema
 * `query_synonyms` declarations (see {@link loadConceptTypeSynonyms}); this
 * function holds no hardcoded type knowledge per
 * docs/foundation/schema_agnostic_design_rules.md.
 */
export function conceptEntityTypeHints(
  searchTokens: string[],
  conceptSynonyms: Map<string, string>
): Set<string> {
  const hints = new Set<string>();
  if (conceptSynonyms.size === 0) {
    return hints;
  }
  for (let i = 0; i < searchTokens.length; i++) {
    const single = searchTokens[i];
    const singleHit = single ? conceptSynonyms.get(single) : undefined;
    if (singleHit) {
      hints.add(singleHit);
    }
    if (i + 1 < searchTokens.length) {
      const pair = `${searchTokens[i]} ${searchTokens[i + 1]}`;
      const pairHit = conceptSynonyms.get(pair);
      if (pairHit) {
        hints.add(pairHit);
      }
    }
  }
  return hints;
}

interface LexicalSearchEntityIdsParams {
  userId: string;
  entityType?: string;
  /** Multi-type filter, OR-combined with `entityType` (#1562). */
  entityTypes?: string[];
  includeMerged?: boolean;
  search: string;
  /** Omit chat bookkeeping rows from product search (Inspector header, /search). */
  excludeBookkeeping?: boolean;
}

export function shouldExcludeBookkeepingFromSearch(entityType?: string): boolean {
  if (!entityType) {
    return true;
  }
  return !BOOKKEEPING_ENTITY_TYPES.has(entityType);
}

type SnapshotRow = {
  entity_id: string;
  snapshot?: unknown;
};

type LexicalMatch = {
  entityId: string;
  canonicalName: string;
  score: number;
};

// Re-export the shared normalizer (imported above) so existing references to
// `normalizeSearchText` from this module keep resolving (#1572).
export { normalizeSearchText };

export function matchesSearchTokens(searchableText: string, searchTokens: string[]): boolean {
  if (searchTokens.length === 0) return false;
  const normalized = normalizeSearchText(searchableText);
  return searchTokens.every((token) => normalized.includes(token));
}

/** True when a token matches entity_type exactly or as a conventional plural (plans → plan). */
export function searchTokenMatchesEntityType(token: string, entityType: string): boolean {
  const normalizedType = normalizeSearchText(entityType);
  const normalizedToken = normalizeSearchText(token);
  if (!normalizedType || !normalizedToken) {
    return false;
  }
  if (normalizedToken === normalizedType) {
    return true;
  }
  const singularToken = suggestSingular(normalizedToken);
  return singularToken === normalizedType;
}

export function entityTypeKeywordBoost(entityType: string, searchTokens: string[]): number {
  for (const token of searchTokens) {
    if (searchTokenMatchesEntityType(token, entityType)) {
      return ENTITY_TYPE_KEYWORD_BOOST;
    }
  }
  return 0;
}

function tokenIsEntityTypeFilter(token: string, typeFilterTokens: Set<string>): boolean {
  for (const typeToken of typeFilterTokens) {
    if (searchTokenMatchesEntityType(token, typeToken)) {
      return true;
    }
  }
  return false;
}

export function buildEntityTypeFilterTokens(
  searchTokens: string[],
  knownEntityTypes: Set<string>
): Set<string> {
  const filters = new Set<string>();
  for (const token of searchTokens) {
    const normalizedToken = normalizeSearchText(token);
    if (knownEntityTypes.has(normalizedToken)) {
      filters.add(normalizedToken);
      continue;
    }
    const singularToken = suggestSingular(normalizedToken);
    if (singularToken && knownEntityTypes.has(singularToken)) {
      filters.add(singularToken);
    }
  }
  return filters;
}

/**
 * Multi-word queries often include registered entity type names in titles
 * (e.g. "Schema Packs Strategy" should match a plan, not filter to strategy rows).
 * Drop type-filter tokens when removing them still leaves two or more text tokens.
 */
export function refineTypeFilterTokens(
  searchTokens: string[],
  typeFilterTokens: Set<string>
): Set<string> {
  if (typeFilterTokens.size === 0 || searchTokens.length <= 1) {
    return typeFilterTokens;
  }
  const textTokens = searchTokens.filter(
    (token) => !tokenIsEntityTypeFilter(token, typeFilterTokens)
  );
  if (textTokens.length >= 2) {
    return new Set();
  }
  return typeFilterTokens;
}

/** When the query names an entity type, that token filters by type instead of snapshot text. */
export function textTokensForEntityMatch(
  searchTokens: string[],
  entityType: string,
  typeFilterTokens: Set<string>
): string[] {
  if (typeFilterTokens.size === 0) {
    return searchTokens;
  }
  const normalizedEntityType = normalizeSearchText(entityType);
  const satisfiesTypeFilter = [...typeFilterTokens].some(
    (typeToken) =>
      normalizedEntityType === typeToken || searchTokenMatchesEntityType(typeToken, entityType)
  );
  if (!satisfiesTypeFilter) {
    return searchTokens;
  }
  return searchTokens.filter((token) => !tokenIsEntityTypeFilter(token, typeFilterTokens));
}

async function loadKnownEntityTypes(
  userId: string,
  candidateEntityTypes: Iterable<string>
): Promise<Set<string>> {
  const known = new Set<string>();
  for (const entityType of candidateEntityTypes) {
    const normalized = normalizeSearchText(entityType);
    if (normalized) {
      known.add(normalized);
    }
  }

  const { data, error } = await db.from("schema_registry").select("entity_type").eq("active", true);
  if (error) {
    logger.warn(`[lexicalSearch] Failed to load schema entity types: ${error.message}`);
    return known;
  }

  for (const row of (data ?? []) as Array<{ entity_type: string }>) {
    const normalized = normalizeSearchText(row.entity_type);
    if (normalized) {
      known.add(normalized);
    }
  }

  return known;
}

/** Map type-filter tokens to schema `entity_type` strings for a narrow candidate query. */
async function resolveEntityTypesForTypeFilters(typeFilterTokens: Set<string>): Promise<string[]> {
  if (typeFilterTokens.size === 0) {
    return [];
  }

  const { data, error } = await db.from("schema_registry").select("entity_type").eq("active", true);
  if (error) {
    // Degrade gracefully: a transient schema_registry hiccup should not 500
    // the entire search request. Returning an empty set falls back to the
    // unfiltered candidate query (capped at MAX_LEXICAL_CANDIDATES), matching
    // the symmetric loadKnownEntityTypes behavior just above.
    logger.warn(
      `[lexicalSearch] Failed to resolve entity types for search filters: ${error.message}`
    );
    return [];
  }

  const matched = new Set<string>();
  for (const row of (data ?? []) as Array<{ entity_type: string }>) {
    for (const token of typeFilterTokens) {
      if (searchTokenMatchesEntityType(token, row.entity_type)) {
        matched.add(row.entity_type);
        break;
      }
    }
  }

  return [...matched];
}

function compareSearchRank(
  aEntityId: string,
  aEntityType: string,
  bEntityId: string,
  bEntityType: string,
  orderMap: Map<string, number>,
  searchTokens: string[],
  orderedIds: string[]
): number {
  const ai = orderMap.get(aEntityId) ?? 9999;
  const bi = orderMap.get(bEntityId) ?? 9999;
  const aRank = orderedIds.length - ai + entityTypeKeywordBoost(aEntityType, searchTokens);
  const bRank = orderedIds.length - bi + entityTypeKeywordBoost(bEntityType, searchTokens);
  if (bRank !== aRank) {
    return bRank - aRank;
  }
  return ai - bi;
}

function stringifySnapshot(snapshot: unknown): string {
  if (typeof snapshot === "string") {
    return snapshot;
  }
  if (snapshot == null) {
    return "";
  }
  try {
    return JSON.stringify(snapshot);
  } catch {
    return "";
  }
}

/** Canonical lexical haystack: canonical_name + snapshot + optional raw_fragments text. */
export function buildEntityLexicalSearchText(
  canonicalName: string,
  snapshot: unknown,
  rawFragmentText?: string
): string {
  const normalizedCanonical = normalizeSearchText(canonicalName);
  const normalizedSnapshot = normalizeSearchText(stringifySnapshot(snapshot));
  const normalizedFragments = normalizeSearchText(rawFragmentText ?? "");
  return `${normalizedCanonical} ${normalizedSnapshot} ${normalizedFragments}`.trim();
}

async function loadRawFragmentTextByEntityId(entityIds: string[]): Promise<Map<string, string>> {
  const fragmentTextByEntityId = new Map<string, string>();
  if (entityIds.length === 0) {
    return fragmentTextByEntityId;
  }

  const chunkSize = 500;
  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    const { data, error } = await db
      .from("raw_fragments")
      .select("entity_id, fragment_key, fragment_value")
      .in("entity_id", chunk);

    if (error) {
      throw new Error(`Failed lexical raw_fragments query: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{
      entity_id: string | null;
      fragment_key: string;
      fragment_value: string | null;
    }>) {
      if (!row.entity_id) {
        continue;
      }
      const piece = `${row.fragment_key} ${row.fragment_value ?? ""}`.trim();
      if (!piece) {
        continue;
      }
      const existing = fragmentTextByEntityId.get(row.entity_id);
      fragmentTextByEntityId.set(row.entity_id, existing ? `${existing} ${piece}` : piece);
    }
  }

  return fragmentTextByEntityId;
}

/**
 * Non-strict retrieval strategies that can contribute to a search result set.
 * Surfaced to callers via the `applied_search_strategies` response field so a
 * relaxed-pass match is distinguishable from an exact one (#1495/#1496/#1551
 * silent-behavior advisory).
 */
export type SearchStrategy = "strict" | "semantic" | "partial_overlap" | "concept_bridge";

async function lexicalSearchEntityIds(params: LexicalSearchEntityIdsParams): Promise<{
  entityIds: string[];
  total: number;
  strategies: Set<SearchStrategy>;
}> {
  const {
    userId,
    entityType,
    entityTypes,
    includeMerged = false,
    search,
    excludeBookkeeping = false,
  } = params;
  const typeFilter = normalizeEntityTypeFilter(entityType, entityTypes);
  const strategies = new Set<SearchStrategy>();
  const normalizedSearch = normalizeSearchText(search);
  const searchTokens = normalizedSearch.split(" ").filter(Boolean);
  if (searchTokens.length === 0) {
    return { entityIds: [], total: 0, strategies };
  }

  const registryTypes = await loadKnownEntityTypes(userId, []);
  const typeFilterTokens = refineTypeFilterTokens(
    searchTokens,
    buildEntityTypeFilterTokens(searchTokens, registryTypes)
  );
  // Concept → type hints ("bank account" → financial_account) so the partial
  // fallback can credit a type match even when the literal type name is absent
  // from the query (#1496). The concept → entity_type map comes from schema
  // `query_synonyms` declarations, not hardcoded here. Only used to boost
  // ranking, never to narrow the candidate set away from the full scan.
  const conceptSynonyms = await loadConceptTypeSynonyms(userId);
  const conceptTypeHints = conceptEntityTypeHints(searchTokens, conceptSynonyms);

  let entityQuery = db
    .from("entities")
    .select("id, canonical_name, entity_type")
    .eq("user_id", userId)
    .order("id", { ascending: true });

  if (typeFilter.length === 1) {
    entityQuery = entityQuery.eq("entity_type", typeFilter[0]);
  } else if (typeFilter.length > 1) {
    entityQuery = entityQuery.in("entity_type", typeFilter);
  } else if (typeFilterTokens.size > 0) {
    const matchingTypes = await resolveEntityTypesForTypeFilters(typeFilterTokens);
    if (matchingTypes.length > 0) {
      entityQuery = entityQuery.in("entity_type", matchingTypes);
    } else {
      entityQuery = entityQuery.limit(MAX_LEXICAL_CANDIDATES);
    }
  } else {
    entityQuery = entityQuery.limit(MAX_LEXICAL_CANDIDATES);
  }

  if (!includeMerged) {
    entityQuery = entityQuery.is("merged_to_entity_id", null);
  }

  const { data: entities, error: entitiesError } = await entityQuery;
  if (entitiesError) {
    throw new Error(`Failed lexical candidate query: ${entitiesError.message}`);
  }
  if (!entities || entities.length === 0) {
    return { entityIds: [], total: 0, strategies };
  }

  const entityIds = entities.map((entity: { id: string }) => entity.id);
  const snapshotMap = new Map<string, unknown>();
  const chunkSize = 500;

  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    const { data: snapshots, error: snapshotsError } = await db
      .from("entity_snapshots")
      .select("entity_id, snapshot")
      .in("entity_id", chunk);

    if (snapshotsError) {
      throw new Error(`Failed lexical snapshot query: ${snapshotsError.message}`);
    }

    for (const snapshot of (snapshots || []) as SnapshotRow[]) {
      snapshotMap.set(snapshot.entity_id, snapshot.snapshot);
    }
  }

  const fragmentTextByEntityId = await loadRawFragmentTextByEntityId(entityIds);

  const knownEntityTypes = await loadKnownEntityTypes(
    userId,
    (entities as Array<{ entity_type: string }>).map((entity) => entity.entity_type)
  );
  for (const token of typeFilterTokens) {
    knownEntityTypes.add(token);
  }

  type Candidate = {
    id: string;
    canonical_name: string;
    entity_type: string;
    normalizedCanonical: string;
    normalizedSnapshot: string;
    searchableText: string;
    textTokens: string[];
  };

  const candidates: Candidate[] = [];
  const lexicalMatches: LexicalMatch[] = [];
  for (const entity of entities as Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
  }>) {
    if (excludeBookkeeping && BOOKKEEPING_ENTITY_TYPES.has(entity.entity_type)) {
      continue;
    }
    const snapshot = snapshotMap.get(entity.id);
    const normalizedCanonical = normalizeSearchText(entity.canonical_name);
    const normalizedSnapshot = normalizeSearchText(stringifySnapshot(snapshot));
    const searchableText = buildEntityLexicalSearchText(
      entity.canonical_name,
      snapshot,
      fragmentTextByEntityId.get(entity.id)
    );
    const textTokens = textTokensForEntityMatch(searchTokens, entity.entity_type, typeFilterTokens);
    candidates.push({
      id: entity.id,
      canonical_name: entity.canonical_name,
      entity_type: entity.entity_type,
      normalizedCanonical,
      normalizedSnapshot,
      searchableText,
      textTokens,
    });
    if (matchesSearchTokens(searchableText, textTokens)) {
      let score = 0;
      if (normalizedCanonical.includes(normalizedSearch)) {
        score += 300;
      }
      if (normalizedSnapshot.includes(normalizedSearch)) {
        score += 180;
      }
      if (searchableText.startsWith(normalizedSearch)) {
        score += 40;
      }
      for (const token of searchTokens) {
        if (normalizedCanonical.includes(token)) {
          score += 24;
        }
        if (normalizedSnapshot.includes(token)) {
          score += 10;
        }
      }
      score += entityTypeKeywordBoost(entity.entity_type, searchTokens);
      strategies.add("strict");
      lexicalMatches.push({
        entityId: entity.id,
        canonicalName: entity.canonical_name,
        score,
      });
    }
  }

  // Partial-token fallback (#1496, #1551): strict all-token matching drops rows
  // for descriptive multi-term queries ("bank account Ibercaja Wise") and long
  // queries whose terms only partially overlap a stored title/body. When no row
  // satisfies the strict every-token gate, recover rows that contain at least
  // PARTIAL_MATCH_MIN_OVERLAP_RATIO of the *meaningful* query tokens, ranked by
  // overlap count. Concept→type hints credit a type match (financial_account
  // for "bank account"). This only runs as a fallback, so precision on queries
  // that already match exactly is unchanged.
  if (lexicalMatches.length === 0) {
    const meaningfulTokens = searchTokens.filter(
      (token) => token.length > 1 && !PARTIAL_MATCH_STOP_TOKENS.has(token)
    );
    if (meaningfulTokens.length >= 2) {
      const required = Math.max(
        2,
        Math.ceil(meaningfulTokens.length * PARTIAL_MATCH_MIN_OVERLAP_RATIO)
      );
      for (const candidate of candidates) {
        const conceptMatch = conceptTypeHints.has(candidate.entity_type);
        let overlap = 0;
        for (const token of meaningfulTokens) {
          if (candidate.searchableText.includes(token)) {
            overlap += 1;
          }
        }
        // A concept→type hint counts as one satisfied token so e.g. an
        // "Ibercaja Wise" financial_account is recovered for "bank account
        // ibercaja wise" even though "bank"/"account" are not in its text.
        const effectiveOverlap = conceptMatch ? overlap + 1 : overlap;
        if (overlap === 0) {
          continue;
        }
        if (effectiveOverlap < required) {
          continue;
        }
        let score = effectiveOverlap * 20;
        strategies.add("partial_overlap");
        if (conceptMatch) {
          score += ENTITY_TYPE_KEYWORD_BOOST;
          strategies.add("concept_bridge");
        }
        if (candidate.normalizedCanonical) {
          for (const token of meaningfulTokens) {
            if (candidate.normalizedCanonical.includes(token)) {
              score += 12;
            }
          }
        }
        lexicalMatches.push({
          entityId: candidate.id,
          canonicalName: candidate.canonical_name,
          score,
        });
      }
    }
  }

  lexicalMatches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const canonicalCompare = a.canonicalName.localeCompare(b.canonicalName);
    if (canonicalCompare !== 0) {
      return canonicalCompare;
    }
    return a.entityId.localeCompare(b.entityId);
  });

  const matchedIds = lexicalMatches.map((match) => match.entityId);

  return { entityIds: matchedIds, total: matchedIds.length, strategies };
}

async function countVisibleEntities(params: {
  userId: string;
  entityType?: string;
  entityTypes?: string[];
  includeMerged?: boolean;
  published?: boolean;
  publishedAfter?: string;
  publishedBefore?: string;
  updatedSince?: string;
  createdSince?: string;
}): Promise<number> {
  const {
    userId,
    entityType,
    entityTypes,
    includeMerged = false,
    published,
    publishedAfter,
    publishedBefore,
    updatedSince,
    createdSince,
  } = params;

  const typeFilter = normalizeEntityTypeFilter(entityType, entityTypes);
  const applyTypeFilter = <
    T extends { eq: (c: string, v: string) => T; in: (c: string, v: string[]) => T },
  >(
    query: T,
    column: string
  ): T => {
    if (typeFilter.length === 1) {
      return query.eq(column, typeFilter[0]);
    }
    if (typeFilter.length > 1) {
      return query.in(column, typeFilter);
    }
    return query;
  };

  let entityIdQuery = db.from("entities").select("id").eq("user_id", userId);
  entityIdQuery = applyTypeFilter(entityIdQuery, "entity_type");
  if (!includeMerged) {
    entityIdQuery = entityIdQuery.is("merged_to_entity_id", null);
  }
  if (updatedSince) {
    entityIdQuery = entityIdQuery.gte("updated_at", updatedSince);
  }
  if (createdSince) {
    entityIdQuery = entityIdQuery.gte("created_at", createdSince);
  }
  if (published !== undefined || publishedAfter || publishedBefore) {
    let snapshotQuery = db.from("entity_snapshots").select("entity_id").eq("user_id", userId);
    snapshotQuery = applyTypeFilter(snapshotQuery, "entity_type");
    if (published !== undefined) {
      snapshotQuery = snapshotQuery.eq("snapshot->>published", published ? "true" : "false");
    }
    if (publishedAfter) {
      snapshotQuery = snapshotQuery.gte("snapshot->>published_date", publishedAfter);
    }
    if (publishedBefore) {
      snapshotQuery = snapshotQuery.lte("snapshot->>published_date", publishedBefore);
    }
    const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
    if (snapshotError) {
      throw new Error(`Failed to query snapshot ids for count: ${snapshotError.message}`);
    }
    const snapshotEntityIds = (snapshotRows || []).map(
      (row: { entity_id: string }) => row.entity_id
    );
    if (snapshotEntityIds.length === 0) {
      return 0;
    }
    entityIdQuery = entityIdQuery.in("id", snapshotEntityIds);
  }

  const { data: entityRows, error: entityError } = await entityIdQuery;
  if (entityError) {
    throw new Error(`Failed to query entity ids for count: ${entityError.message}`);
  }
  if (!entityRows || entityRows.length === 0) {
    return 0;
  }

  const entityIds = entityRows.map((row: { id: string }) => row.id);
  const deletedEntityIds = new Set<string>();
  const chunkSize = 500;

  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    const { data: deletionObservations, error: observationsError } = await db
      .from("observations")
      .select("entity_id, source_priority, observed_at, fields")
      .in("entity_id", chunk)
      .order("source_priority", { ascending: false })
      .order("observed_at", { ascending: false });

    if (observationsError) {
      throw new Error(
        `Failed to query deletion observations for count: ${observationsError.message}`
      );
    }

    const highestByEntity = new Map<string, any>();
    for (const obs of deletionObservations || []) {
      if (!highestByEntity.has(obs.entity_id)) {
        highestByEntity.set(obs.entity_id, obs);
      }
    }

    for (const [entityId, obs] of highestByEntity.entries()) {
      if (obs.fields?._deleted === true) {
        deletedEntityIds.add(entityId);
      }
    }
  }

  return entityIds.length - deletedEntityIds.size;
}

async function queryEntitiesFromLexicalSearch(params: {
  userId: string;
  entityType?: string;
  entityTypes?: string[];
  includeMerged?: boolean;
  includeSnapshots?: boolean;
  sortBy?: QueryEntitiesParams["sortBy"];
  sortOrder?: QueryEntitiesParams["sortOrder"];
  published?: boolean;
  publishedAfter?: string;
  publishedBefore?: string;
  updatedSince?: string;
  createdSince?: string;
  identityBasis?: QueryEntitiesParams["identityBasis"];
  search: string;
  excludeBookkeeping: boolean;
  limit: number;
  offset: number;
}): Promise<{
  entities: EntityWithProvenance[];
  total: number;
  strategies: Set<SearchStrategy>;
}> {
  const {
    entityIds: lexicalIds,
    total: lexicalTotal,
    strategies,
  } = await lexicalSearchEntityIds({
    userId: params.userId,
    entityType: params.entityType,
    entityTypes: params.entityTypes,
    includeMerged: params.includeMerged,
    search: params.search,
    excludeBookkeeping: params.excludeBookkeeping,
  });

  if (lexicalIds.length === 0) {
    return { entities: [], total: 0, strategies };
  }

  const paginatedIds = lexicalIds.slice(params.offset, params.offset + params.limit);
  const entities = await queryEntities({
    userId: params.userId,
    entityType: params.entityType,
    entityTypes: params.entityTypes,
    includeMerged: params.includeMerged,
    includeSnapshots: params.includeSnapshots,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    published: params.published,
    publishedAfter: params.publishedAfter,
    publishedBefore: params.publishedBefore,
    updatedSince: params.updatedSince,
    createdSince: params.createdSince,
    limit: paginatedIds.length,
    offset: 0,
    entityIds: paginatedIds,
    identityBasis: params.identityBasis,
  });

  const orderMap = new Map(paginatedIds.map((id, i) => [id, i]));
  entities.sort((a, b) => {
    const ai = orderMap.get(a.entity_id) ?? 9999;
    const bi = orderMap.get(b.entity_id) ?? 9999;
    return ai - bi;
  });

  return { entities, total: lexicalTotal, strategies };
}

/**
 * Which retrieval strategy actually answered a query. Exposed to callers so a
 * silent semantic→lexical degradation (e.g. when the embedding provider is
 * unavailable) is observable rather than invisible. See issue #1506.
 *   - "none"            — no search text; plain listing/filter path.
 *   - "semantic"        — semantic (embedding) search answered the query.
 *   - "lexical_typed"   — entity-type token detected; typed lexical search.
 *   - "lexical_fallback"— semantic was attempted but returned nothing usable,
 *                          so lexical substring matching answered instead.
 */
export type EntitySearchMode = "none" | "semantic" | "lexical_typed" | "lexical_fallback";

export async function queryEntitiesWithCount(params: QueryEntitiesParams): Promise<{
  entities: EntityWithProvenance[];
  total: number;
  excluded_merged: boolean;
  /**
   * Non-strict retrieval strategies that contributed to a `search` result set
   * (#1495/#1496/#1551 silent-behavior signal). `undefined` for non-search
   * listings; an empty array when a search matched nothing.
   */
  applied_search_strategies?: SearchStrategy[];
  search_mode: EntitySearchMode;
}> {
  const {
    userId,
    entityType,
    entityTypes,
    includeMerged = false,
    includeSnapshots = true,
    sortBy = "entity_id",
    sortOrder = "asc",
    published,
    publishedAfter,
    publishedBefore,
    search,
    similarityThreshold,
    limit = 100,
    offset = 0,
    updatedSince,
    createdSince,
    identityBasis,
    snapshotFilters,
    excludeBookkeeping = false,
  } = params;

  // Union of singular + plural type filters, honored across all retrieval
  // paths (#1562). Empty when no type filter is requested.
  const typeFilter = normalizeEntityTypeFilter(entityType, entityTypes);

  let entities: EntityWithProvenance[];
  let total: number;
  // Collected only on the search path; left undefined for plain listings so
  // the response omits `applied_search_strategies` entirely.
  let appliedStrategies: Set<SearchStrategy> | undefined;
  let searchMode: EntitySearchMode = "none";

  if (search && search.trim()) {
    appliedStrategies = new Set<SearchStrategy>();
    const trimmedSearch = search.trim();
    const searchTokens = normalizeSearchText(trimmedSearch).split(" ").filter(Boolean);
    const registryTypes = await loadKnownEntityTypes(userId, []);
    const typeFilterTokens = refineTypeFilterTokens(
      searchTokens,
      buildEntityTypeFilterTokens(searchTokens, registryTypes)
    );
    // Bookkeeping exclusion is caller-controlled (per docs/foundation/product_principles.md
    // §10.2 Explicit Over Implicit). If the caller explicitly filters to a bookkeeping
    // entity_type, the explicit type filter wins and excludeBookkeeping is ignored.
    const effectiveExcludeBookkeeping =
      excludeBookkeeping &&
      !(typeFilter.length > 0 && typeFilter.some((t) => BOOKKEEPING_ENTITY_TYPES.has(t)));

    const lexicalParams = {
      userId,
      entityType,
      entityTypes,
      includeMerged,
      includeSnapshots,
      sortBy,
      sortOrder,
      published,
      publishedAfter,
      publishedBefore,
      updatedSince,
      createdSince,
      identityBasis,
      search: trimmedSearch,
      excludeBookkeeping: effectiveExcludeBookkeeping,
      limit,
      offset,
    };

    if (typeFilterTokens.size > 0) {
      logger.info(
        `[queryEntitiesWithCount] typed lexical search: userId=${userId} search=${trimmedSearch.slice(0, 50)} typeTokens=${[...typeFilterTokens].join(",")} entityType=${entityType ?? "(any)"}`
      );
      const lexicalResult = await queryEntitiesFromLexicalSearch(lexicalParams);
      entities = lexicalResult.entities;
      total = lexicalResult.total;
      for (const strategy of lexicalResult.strategies) appliedStrategies.add(strategy);
      searchMode = "lexical_typed";
    } else {
      logger.info(
        `[queryEntitiesWithCount] semantic search path: userId=${userId} search=${trimmedSearch.slice(0, 50)} entityType=${entityType ?? "(any)"}`
      );
      const { entityIds, total: semanticTotal } = await semanticSearchEntities({
        searchText: trimmedSearch,
        userId,
        entityType,
        entityTypes,
        includeMerged,
        similarityThreshold,
        limit,
        offset,
      });

      if (entityIds.length > 0) {
        entities = await queryEntities({
          userId,
          entityType,
          entityTypes,
          includeMerged,
          includeSnapshots,
          sortBy,
          sortOrder,
          published,
          publishedAfter,
          publishedBefore,
          limit,
          offset: 0,
          entityIds,
          updatedSince,
          createdSince,
          identityBasis,
        });
        if (effectiveExcludeBookkeeping) {
          entities = entities.filter((entity) => !BOOKKEEPING_ENTITY_TYPES.has(entity.entity_type));
        }
        if (entities.length > 0) {
          const orderMap = new Map(entityIds.map((id, i) => [id, i]));
          entities.sort((a, b) =>
            compareSearchRank(
              a.entity_id,
              a.entity_type,
              b.entity_id,
              b.entity_type,
              orderMap,
              searchTokens,
              entityIds
            )
          );
          total = semanticTotal;
          appliedStrategies.add("semantic");
          searchMode = "semantic";
        } else {
          const lexicalResult = await queryEntitiesFromLexicalSearch(lexicalParams);
          entities = lexicalResult.entities;
          total = lexicalResult.total;
          for (const strategy of lexicalResult.strategies) appliedStrategies.add(strategy);
          searchMode = "lexical_fallback";
        }
      } else {
        const lexicalResult = await queryEntitiesFromLexicalSearch(lexicalParams);
        entities = lexicalResult.entities;
        total = lexicalResult.total;
        for (const strategy of lexicalResult.strategies) appliedStrategies.add(strategy);
        searchMode = "lexical_fallback";
      }
    }
  } else {
    entities = await queryEntities({
      userId,
      entityType,
      entityTypes,
      includeMerged,
      includeSnapshots,
      sortBy,
      sortOrder,
      published,
      publishedAfter,
      publishedBefore,
      limit,
      offset,
      updatedSince,
      createdSince,
      identityBasis,
      snapshotFilters,
    });

    // R3: when filtering by identity_basis, the visible count must reflect
    // the same pre-filter, so derive the total from the non-paginated result
    // set rather than counting all entities.
    if (identityBasis || snapshotFilters) {
      const allMatches = await queryEntities({
        userId,
        entityType,
        entityTypes,
        includeMerged,
        includeSnapshots: false,
        sortBy,
        sortOrder,
        published,
        publishedAfter,
        publishedBefore,
        limit: 10000,
        offset: 0,
        updatedSince,
        createdSince,
        identityBasis,
        snapshotFilters,
      });
      total = allMatches.length;
    } else {
      total = await countVisibleEntities({
        userId,
        entityType,
        entityTypes,
        includeMerged,
        published,
        publishedAfter,
        publishedBefore,
        updatedSince,
        createdSince,
      });
    }
  }

  return {
    entities,
    total,
    excluded_merged: !includeMerged,
    applied_search_strategies: appliedStrategies ? [...appliedStrategies].sort() : undefined,
    search_mode: searchMode,
  };
}

export function filterEntitiesBySearch<T extends { canonical_name: string }>(
  entities: T[],
  search?: string
): T[] {
  if (!search) return entities;
  const normalized = search.toLowerCase();
  return entities.filter((entity) => entity.canonical_name.toLowerCase().includes(normalized));
}
