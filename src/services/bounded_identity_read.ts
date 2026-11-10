import type { DbConnection } from "../repositories/db/driver.js";
import { observationReducer, type Observation } from "../reducers/observation_reducer.js";
import { isValidSnapshotFieldName } from "./entity_queries.js";
import { acquireEntityLifecycleContext } from "./entity_lifecycle_storage.js";
import { validateFieldWithConverters } from "./field_validation.js";
import { SchemaRegistryService } from "./schema_registry.js";
import { stableSerialize } from "./stable_serialize.js";

const ENTITY_LIMIT = 2500;
const FACT_LIMIT = 10_000;
const CANDIDATE_LIMIT = 16;
const HISTORY_LIMIT = 128;

export function isBoundedIdentityValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const points = [...value];
  return (
    points.length > 0 &&
    points.length <= 256 &&
    points.every((character) => {
      const point = character.codePointAt(0)!;
      return point >= 32 && (point < 127 || point > 159);
    })
  );
}

interface ScopedIdentity {
  id: string;
  field: string | null;
}

interface IdentityFact {
  entity_id: string;
  value: string | null;
}

interface RawSnapshot {
  schema_version: string;
  snapshot: string;
  provenance: string;
  observation_count: number;
  last_observation_at: string;
}

interface IdentitySnapshot {
  entity_id: string;
  entity_type: string;
  snapshot: Record<string, unknown>;
  provenance: Record<string, string>;
}

type BoundedIdentityResult =
  | { state: "unproved" | "absent" | "ambiguous" }
  | { state: "singleton"; entity: IdentitySnapshot };

function object<T>(json: unknown): T {
  const value: unknown = typeof json === "string" ? JSON.parse(json) : json;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid stored object");
  return value as T;
}

/**
 * Internal prototype. The caller must hold one pinned read-only transaction
 * for the entire invocation. Never call with the normal pooled connection.
 *
 * The candidates are the union of materialized and observed field values.
 * Looking only in snapshots would let a damaged materialization conceal a
 * duplicate. A string selector without array merges can only pick a value
 * from one observation, possibly through the existing field converter.
 */
export async function readBoundedIdentityInView(
  view: DbConnection,
  owner: string,
  type: string,
  field: string,
  wanted: string
): Promise<BoundedIdentityResult> {
  if (!owner || !type || !isValidSnapshotFieldName(field) || !isBoundedIdentityValue(wanted))
    return { state: "unproved" };
  try {
    const schema = await new SchemaRegistryService().loadActiveSchemaInTransaction(
      view,
      type,
      owner
    );
    const definition = Object.hasOwn(schema.schema_definition.fields, field)
      ? schema.schema_definition.fields[field]
      : undefined;
    const strategy = schema.reducer_config.merge_policies[field]?.strategy ?? "last_write";
    const identity = schema.schema_definition.canonical_name_fields;
    const rule = identity?.length === 1 ? identity[0] : undefined;
    const declared =
      typeof rule === "string"
        ? rule === field
        : rule?.composite.length === 1 && rule.composite[0] === field;
    if (
      !declared ||
      definition?.type !== "string" ||
      !["last_write", "highest_priority", "most_specific"].includes(strategy)
    )
      return { state: "unproved" };

    const path = `$.${field}`;
    const scope = (await view
      .prepare(
        `SELECT e.id, json_extract(s.snapshot, ?) AS field
         FROM entities e
         LEFT JOIN entity_snapshots s ON
           s.entity_id=e.id AND s.user_id=e.user_id AND s.entity_type=e.entity_type
         WHERE e.user_id=? AND e.entity_type=? AND e.merged_to_entity_id IS NULL
         ORDER BY e.id LIMIT ?`
      )
      .all(path, owner, type, ENTITY_LIMIT + 1)) as ScopedIdentity[];
    if (scope.length > ENTITY_LIMIT) return { state: "unproved" };

    const orphan = await view
      .prepare(
        `SELECT 1 AS invalid FROM entity_snapshots s
         LEFT JOIN entities e ON e.id=s.entity_id AND e.user_id=s.user_id AND e.entity_type=s.entity_type
         WHERE s.user_id=? AND s.entity_type=? AND e.id IS NULL LIMIT 1`
      )
      .get(owner, type);
    if (orphan) return { state: "unproved" };

    // Candidate membership depends only on (entity, raw JSON value) under the
    // pinned schema's pure converter. Repeated identical facts add no candidate.
    // Keep raw JSON types and entity IDs distinct; replay candidate histories
    // in full below, under the unchanged history and candidate limits.
    // The deadline bounds response/evidence validity, not scan cardinality or
    // immediate native CPU cancellation; existing worker retirement still applies.
    const facts = (await view
      .prepare(
        `SELECT DISTINCT e.id COLLATE BINARY AS entity_id,
           (o.fields -> ?) COLLATE BINARY AS value
         FROM entities e CROSS JOIN observations o ON o.entity_id=e.id AND o.user_id=e.user_id
         WHERE e.user_id=? AND e.entity_type=? AND e.merged_to_entity_id IS NULL
         AND json_type(o.fields, ?) IS NOT NULL LIMIT ?`
      )
      .all(path, owner, type, path, FACT_LIMIT + 1)) as IdentityFact[];
    if (facts.length > FACT_LIMIT) return { state: "unproved" };

    const candidates = new Set(scope.filter((row) => row.field === wanted).map((row) => row.id));
    for (const fact of facts) {
      if (typeof fact.value !== "string") return { state: "unproved" };
      const raw: unknown = JSON.parse(fact.value);
      const converted = validateFieldWithConverters(field, raw, definition);
      if (raw === wanted || (!converted.shouldRouteToRawFragments && converted.value === wanted))
        candidates.add(fact.entity_id);
    }
    if (candidates.size > CANDIDATE_LIMIT) return { state: "unproved" };

    let match: IdentitySnapshot | undefined;
    for (const id of [...candidates].sort()) {
      const history = (await view
        .prepare("SELECT * FROM observations WHERE entity_id=? AND user_id=? ORDER BY id LIMIT ?")
        .all(id, owner, HISTORY_LIMIT + 1)) as (Omit<Observation, "fields"> & {
        fields: unknown;
        entity_lifecycle_target_id?: string | null;
      })[];
      if (
        history.length === 0 ||
        history.length > HISTORY_LIMIT ||
        history.some(
          (row) =>
            row.entity_type !== type ||
            !Number.isFinite(Date.parse(row.observed_at)) ||
            !Number.isFinite(row.source_priority) ||
            (row.entity_lifecycle_target_id != null && row.entity_lifecycle_target_id !== id)
        )
      )
        return { state: "unproved" };

      const observations = history.map((row) => ({
        ...row,
        fields: object<Record<string, unknown>>(row.fields),
      }));
      const target = { id, user_id: owner, entity_type: type };
      const context = await acquireEntityLifecycleContext(view, target, observations);
      // Merged-away attachments need their own historical authority budget.
      if (
        context.mode !== "pre_migration" &&
        (context.authority_targets.length !== 1 ||
          context.legacy_memberships.some((certificate) => certificate.count > HISTORY_LIMIT))
      )
        return { state: "unproved" };

      const projected = await observationReducer.computeSnapshot(id, observations, schema, context);
      const raw = (await view
        .prepare(
          `SELECT schema_version, snapshot, provenance, observation_count, last_observation_at
           FROM entity_snapshots WHERE entity_id=? AND user_id=? AND entity_type=?`
        )
        .get(id, owner, type)) as RawSnapshot | undefined;
      if (!projected) {
        if (raw) return { state: "unproved" };
        continue;
      }
      if (
        !raw ||
        raw.schema_version !== projected.schema_version ||
        raw.observation_count !== projected.observation_count ||
        raw.last_observation_at !== projected.last_observation_at
      )
        return { state: "unproved" };
      const snapshot = object<Record<string, unknown>>(raw.snapshot);
      const provenance = object<Record<string, string>>(raw.provenance);
      if (
        stableSerialize(snapshot) !== stableSerialize(projected.snapshot) ||
        stableSerialize(provenance) !== stableSerialize(projected.provenance)
      )
        return { state: "unproved" };
      if (snapshot[field] !== wanted) continue;
      if (match) return { state: "ambiguous" };
      match = { entity_id: id, entity_type: type, snapshot, provenance };
    }
    return match ? { state: "singleton", entity: match } : { state: "absent" };
  } catch {
    return { state: "unproved" };
  }
}
