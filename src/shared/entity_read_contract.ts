import { createHash } from "node:crypto";
import type { components } from "./openapi_types.js";

export type EntityReadContract = components["schemas"]["EntityReadContract"];
export type EntityFallbackReason = Exclude<EntityReadContract["mode"]["fallback_reason"], null>;

/** Acquisition evidence belongs to the executing path, never a request-schema guess. */
export interface EntityReadTrace {
  reasons: Set<string>;
  candidate_capped?: boolean;
  count_capped?: boolean;
  ordering?: { field: string; direction: "asc" | "desc"; tie_breaker: string | null };
  continuation_supported?: boolean;
  count_exact?: boolean;
  effective_types?: string[];
  distance_threshold_applied?: boolean;
}
export interface EntityReadRequest {
  raw: Record<string, unknown>;
  surface: "service" | "mcp" | "http_post" | "http_get";
  consumed?: string[];
}
/** Internal service callers use camel-case options, but acquisition evidence
 * speaks the same canonical option names as the public facades. Unknown names
 * remain observable before any caller-specific projection or stripping. */
export function serviceEntityReadRequest(params: Record<string, unknown>): EntityReadRequest {
  const aliases: Record<string, string> = {
    userId: "user_id",
    entityType: "entity_type",
    entityTypes: "entity_types",
    includeMerged: "include_merged",
    includeSnapshots: "include_snapshots",
    sortBy: "sort_by",
    sortOrder: "sort_order",
    publishedAfter: "published_after",
    publishedBefore: "published_before",
    similarityThreshold: "similarity_threshold",
    updatedSince: "updated_since",
    createdSince: "created_since",
    identityBasis: "identity_basis",
    snapshotFilters: "snapshot_filters",
    excludeBookkeeping: "exclude_bookkeeping",
  };
  return {
    surface: "service",
    raw: Object.fromEntries(
      Object.entries(params)
        .filter(([name]) => name !== "readRequest")
        .map(([name, value]) => [aliases[name] ?? name, value])
    ),
  };
}

type IgnoredOption = { name: string; reason: string };
const KNOWN = new Set([
  "user_id",
  "entity_type",
  "entity_types",
  "search",
  "query",
  "search_query",
  "similarity_threshold",
  "limit",
  "offset",
  "cursor",
  "sort_by",
  "sort_order",
  "published",
  "published_after",
  "published_before",
  "include_snapshots",
  "include_merged",
  "updated_since",
  "created_since",
  "identity_basis",
  "snapshot_filters",
  "exclude_bookkeeping",
  "collapse_by",
]);
const safeName = (key: string) => (/^[a-zA-Z0-9_]{1,128}$/.test(key) ? key : "unrecognized_option");
/** Predicate values can contain private text or tokens. Names and typed digests suffice for scope evidence. */
export function predicateValue(value: unknown) {
  return {
    kind: "sha256" as const,
    value: createHash("sha256")
      .update(JSON.stringify(value) ?? "undefined")
      .digest("hex"),
  };
}

export function createEntityReadContract(input: {
  request?: EntityReadRequest;
  mode: "none" | "semantic" | "lexical_typed" | "lexical_fallback";
  fallbackReason?: EntityFallbackReason;
  types: string[];
  includeMerged: boolean;
  includeSnapshots: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
  limit: number;
  offset: number;
  cursor?: string;
  nextCursor?: string;
  predicates: EntityReadContract["applied_scope"]["predicates"];
  total: number;
  returned: number;
  trace: EntityReadTrace;
  startedAt: string;
  diagnostics?: EntityReadContract["diagnostics"];
  bookkeepingOverride?: boolean;
}): EntityReadContract {
  const raw = input.request?.raw ?? {};
  const consumed = new Set(input.request?.consumed ?? Object.keys(raw));
  const ignored: IgnoredOption[] = [];
  const applied: string[] = [];
  const normalized: Array<{ name: string; canonical_name: string; reason: string }> = [];
  const selectedSearch = ["search", "search_query", "query"].find((key) => raw[key] != null);
  for (const key of Object.keys(raw).sort()) {
    if (!KNOWN.has(key)) ignored.push({ name: safeName(key), reason: "unknown_option" });
    else if (!consumed.has(key)) ignored.push({ name: key, reason: "unsupported_on_surface" });
    else if ((key === "query" || key === "search_query") && key !== selectedSearch)
      ignored.push({ name: key, reason: "superseded_alias" });
    else if (key === "collapse_by" && input.request?.surface !== "mcp")
      ignored.push({ name: key, reason: "unsupported_on_surface" });
    else if (key === "snapshot_filters" && input.mode !== "none")
      ignored.push({ name: key, reason: "inapplicable_mode" });
    else if (
      key === "similarity_threshold" &&
      (input.mode !== "semantic" || !input.trace.distance_threshold_applied)
    )
      ignored.push({ name: key, reason: "inapplicable_mode" });
    else if (key === "exclude_bookkeeping" && raw[key] === true && input.mode === "none")
      ignored.push({ name: key, reason: "inapplicable_mode" });
    else {
      applied.push(key);
      if (key === "query" || key === "search_query")
        normalized.push({ name: key, canonical_name: "search", reason: "alias" });
    }
  }
  if (input.bookkeepingOverride)
    normalized.push({
      name: "exclude_bookkeeping",
      canonical_name: "exclude_bookkeeping",
      reason: "explicit_bookkeeping_type_override",
    });
  const reasons = new Set(input.trace.reasons);
  if (ignored.some((option) => option.reason !== "superseded_alias"))
    reasons.add("ignored_scope_option");
  const structured = input.mode === "none";
  const ordering = input.trace.ordering ?? {
    field: input.sortBy,
    direction: input.sortOrder,
    tie_breaker: input.sortBy === "entity_id" ? "entity_id" : null,
  };
  const keyset =
    structured && ordering.field === "entity_id" && input.trace.continuation_supported !== false;
  const pageExhausted = input.returned < input.limit;
  const scopeExhausted = structured && keyset ? pageExhausted : null;
  const capped = input.trace.candidate_capped || input.trace.count_capped;
  if (input.trace.candidate_capped) reasons.add("candidate_cap");
  if (input.trace.count_capped) reasons.add("count_cap");
  if (!structured) reasons.add("ranked_candidates");
  if (!keyset) reasons.add("unsupported_continuation");
  if (input.total < input.returned) reasons.add("count_contradiction");
  const state = reasons.has("ignored_scope_option")
    ? "partial"
    : capped
      ? "truncated"
      : reasons.size
        ? "unknown"
        : pageExhausted
          ? "complete"
          : "paginated";
  return {
    version: "1" as const,
    surface: "entity_collection" as const,
    mode: {
      actual: structured ? "structured" : (input.mode as Exclude<typeof input.mode, "none">),
      fallback_reason:
        input.mode === "lexical_fallback" ? (input.fallbackReason ?? "unknown") : null,
    },
    applied_scope: {
      owner: "authenticated" as const,
      entity_types: input.types,
      include_merged: input.includeMerged,
      include_deleted: false,
      include_snapshots: input.includeSnapshots,
      predicates: input.predicates,
      ordering,
      pagination: { kind: keyset ? "keyset" : "offset", limit: input.limit, offset: input.offset },
    },
    request_options: { applied, normalized, ignored },
    coverage: {
      kind: structured
        ? "predicate_population"
        : input.mode === "semantic"
          ? "semantic_candidates"
          : "lexical_candidates",
      state,
      reasons: [...reasons].sort(),
      returned_count: input.returned,
      total: {
        value: input.total,
        relation: input.trace.count_capped
          ? "lower_bound"
          : structured
            ? input.trace.count_exact === false || reasons.has("count_contradiction")
              ? "unknown"
              : "exact"
            : "candidate_count",
        unit: structured ? "entities" : "candidates",
      },
      page_exhausted: pageExhausted,
      scope_exhausted: reasons.size || capped ? null : scopeExhausted,
      continuation: {
        kind: keyset ? (input.nextCursor ? "cursor" : "none") : "unsupported",
        next_cursor: input.nextCursor ?? null,
        next_offset: null,
      },
    },
    coherence: {
      kind: "read_interval" as const,
      started_at: input.startedAt,
      completed_at: new Date().toISOString(),
      common_view: false,
      collection_and_total: structured ? "separate_acquisitions" : "candidate_derived",
    },
    diagnostics: input.diagnostics ?? [],
  };
}

export function collapsedEntityReadContract(
  contract: EntityReadContract,
  returned: number
): EntityReadContract {
  return {
    ...contract,
    coverage: {
      ...contract.coverage,
      kind: "synthesized_groups",
      state: "unknown",
      scope_exhausted: null,
      returned_count: returned,
      reasons: [...new Set([...contract.coverage.reasons, "synthesized_groups"])].sort(),
    },
  };
}
