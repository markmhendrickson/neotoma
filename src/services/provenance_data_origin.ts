/**
 * Data origin provenance (#2242).
 *
 * `data_origin` answers "where did this data come from?" — the file, sheet row,
 * URL, message, or API endpoint an entity was read from. It is a provenance
 * facet parallel to (and never merged into) server-written attribution
 * (`client_name`, `attribution_tier`, AAuth `agent_*`) and `external_actor`.
 *
 * Contract:
 *   - Caller-supplied on `store` at request level (`data_origin`) with a
 *     per-entity override (`entities[i].data_origin`). Precedence: entity →
 *     request → absent.
 *   - Persisted on each created observation as `provenance.data_origin`.
 *   - Materialized into the structured source's stored JSON so the source
 *     record carries the claim and the idempotency content hash covers it:
 *     a replay with the same origin replays; a changed origin under the same
 *     key is an idempotency mismatch. With no origin the stored bytes are
 *     unchanged from before #2242.
 *   - A claim, not proof. The server never fetches, opens, or validates the
 *     locator or URL.
 *   - Absent means absent: no key is written or surfaced when the caller gave
 *     no origin (never `null`, `{}`, or a value inferred from a filename).
 */

import {
  DATA_ORIGIN_ENTITY_KEY,
  DataOriginSchema,
  type DataOrigin,
} from "../shared/action_schemas.js";

export type { DataOrigin } from "../shared/action_schemas.js";

/** Provenance key under which the origin is persisted on observations. */
export const DATA_ORIGIN_PROVENANCE_KEY = "data_origin";

/** Response key carrying observation_id → origin on snapshot reads. */
export const DATA_ORIGINS_RESPONSE_KEY = "data_origins";

export interface SplitEntityDataOrigins {
  /** Entities with the reserved `data_origin` control key removed. */
  entities: Record<string, unknown>[];
  /**
   * Effective origin per entity index (entity override → request default),
   * or `undefined` when neither was supplied. `undefined` when no entity has
   * an origin at all, so callers can skip all origin work.
   */
  origins: Array<DataOrigin | undefined> | undefined;
}

/**
 * Normalize a validated origin: re-parse through the schema (trims strings,
 * drops nothing else) so every surface persists the identical shape.
 */
export function normalizeDataOrigin(input: unknown): DataOrigin {
  return DataOriginSchema.parse(input);
}

/**
 * Peel the reserved per-entity `data_origin` key off each entity and resolve
 * the effective origin for each index. Input must already have passed schema
 * validation (`refineEntityDataOrigins`); this re-parses defensively and so
 * throws a ZodError on an invalid origin rather than persisting it.
 */
export function splitEntityDataOrigins(
  entities: Record<string, unknown>[],
  requestOrigin?: DataOrigin | null
): SplitEntityDataOrigins {
  const defaultOrigin = requestOrigin ? normalizeDataOrigin(requestOrigin) : undefined;
  let hasAnyOrigin = Boolean(defaultOrigin);
  const origins: Array<DataOrigin | undefined> = [];
  const cleaned = entities.map((entity) => {
    if (
      !entity ||
      typeof entity !== "object" ||
      !Object.prototype.hasOwnProperty.call(entity, DATA_ORIGIN_ENTITY_KEY)
    ) {
      origins.push(defaultOrigin);
      return entity;
    }
    const { [DATA_ORIGIN_ENTITY_KEY]: own, ...rest } = entity;
    const effective = normalizeDataOrigin(own);
    hasAnyOrigin = true;
    origins.push(effective);
    return rest;
  });
  return { entities: cleaned, origins: hasAnyOrigin ? origins : undefined };
}

/**
 * The entity list as persisted in the structured source's JSON: each entity
 * carries its effective origin inline. Returns the input array itself when no
 * origins apply, so pre-#2242 payloads hash and store byte-identically.
 */
export function entitiesWithStoredDataOrigins(
  entities: Record<string, unknown>[],
  origins: Array<DataOrigin | undefined> | undefined
): Record<string, unknown>[] {
  if (!origins) return entities;
  return entities.map((entity, index) => {
    const origin = origins[index];
    return origin ? { ...entity, [DATA_ORIGIN_ENTITY_KEY]: origin } : entity;
  });
}

/**
 * Add the origin facet to an observation provenance blob. Writes only under
 * `data_origin`; never spreads caller input at the provenance root, so the
 * attribution keys and `external_actor` are untouched. Returns the input
 * object unchanged when there is no origin.
 */
export function withDataOriginProvenance<T extends object>(
  provenance: T,
  origin: DataOrigin | undefined | null
): T | (T & { data_origin: DataOrigin }) {
  if (!origin) return provenance;
  return { ...provenance, [DATA_ORIGIN_PROVENANCE_KEY]: origin } as T & {
    data_origin: DataOrigin;
  };
}

/** Read `data_origin` off a stored provenance value (object or JSON string). */
export function readDataOriginFromProvenance(provenance: unknown): DataOrigin | undefined {
  let value = provenance;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object") return undefined;
  const origin = (value as Record<string, unknown>)[DATA_ORIGIN_PROVENANCE_KEY];
  return origin && typeof origin === "object" ? (origin as DataOrigin) : undefined;
}

/**
 * Collect the origins of the observations a snapshot's field provenance cites
 * (`{ field: observation_id }`, merge_array values may be comma-separated).
 * Scoped to `userId`. Returns an empty object when none carry an origin.
 */
export async function collectSnapshotDataOrigins(
  fieldProvenanceInput: unknown,
  userId: string
): Promise<Record<string, DataOrigin>> {
  let fieldProvenance = fieldProvenanceInput;
  if (typeof fieldProvenance === "string") {
    try {
      fieldProvenance = JSON.parse(fieldProvenance);
    } catch {
      return {};
    }
  }
  if (!fieldProvenance || typeof fieldProvenance !== "object") return {};
  const ids = new Set<string>();
  for (const value of Object.values(fieldProvenance as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    for (const id of value.split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.add(trimmed);
    }
  }
  if (ids.size === 0) return {};
  const { db } = await import("../db.js");
  const { data, error } = await db
    .from("observations")
    .select("id, provenance")
    .in("id", [...ids].sort())
    .eq("user_id", userId);
  if (error || !data) return {};
  const out: Record<string, DataOrigin> = {};
  for (const row of [...(data as Array<{ id: string; provenance: unknown }>)].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )) {
    const origin = readDataOriginFromProvenance(row.provenance);
    if (origin) out[row.id] = origin;
  }
  return out;
}

/** One-line compact rendering for text snapshot output. */
export function formatDataOriginCompact(origin: DataOrigin): string {
  const parts: string[] = [`kind=${origin.kind}`];
  if (origin.system) parts.push(`system=${origin.system}`);
  if (origin.locator) parts.push(`locator=${origin.locator}`);
  if (origin.part) parts.push(`part=${origin.part}`);
  if (origin.url) parts.push(`url=${origin.url}`);
  if (origin.producer) parts.push(`producer=${origin.producer}`);
  if (origin.retrieved_at) parts.push(`retrieved_at=${origin.retrieved_at}`);
  if (origin.notes) parts.push(`notes=${origin.notes}`);
  return parts.join(" ");
}
