/**
 * Snapshot export service — fleet-general write integrity layer
 * (item-3-snapshot-export).
 *
 * Dumps Neotoma entity state as a structured JSON document that any
 * fleet can diff against its own external state (MEMORY.md, a shadow
 * SQLite, a vector store, etc.). The exporter is deliberately fleet-
 * agnostic: filters accept the same classification axes the write path
 * exposes (`entity_types`, `observation_source`, attribution fields)
 * and the output preserves per-field provenance so drift reports can
 * answer "who believed this, at what trust tier, via what kind of
 * write".
 *
 * Fleet-specific projection (AIBTC MEMORY.md, LangGraph state dumps,
 * custom-adapter logs) lives in separate parsers registered with
 * `drift_comparison.ts`; this module produces the *canonical* Neotoma
 * shape.
 *
 * Design notes:
 *   * The export is append-only and does not mutate state. Reuses the
 *     same snapshot tables that power the runtime read path (no
 *     recomputation).
 *   * `attribution_fingerprint` and `observation_source_histogram` are
 *     computed per entity so downstream reports can flag "this entity
 *     is 100% unverified_client" without a second pass.
 *   * Output is a plain JSON document (no streaming); bulk exports are
 *     bounded by the caller via `limit` + `since` filters.
 */

import { db } from "../db.js";
import type { AttributionTier } from "../crypto/agent_identity.js";
import type { ObservationSource } from "../shared/action_schemas.js";

export interface SnapshotExportFilter {
  /** Restrict to these entity types (e.g. `["agent_task", "agent_attempt"]`). */
  entity_types?: string[];
  /** Restrict to a specific agent (AAuth `agent_sub`). */
  agent_sub?: string;
  /** Restrict to a specific attribution tier. */
  attribution_tier?: AttributionTier;
  /** Restrict to observations carrying this kind of write. */
  observation_source?: ObservationSource;
  /** ISO-8601 lower bound on `last_observation_at`. */
  since?: string;
  /** Hard cap on returned entities. Defaults to {@link DEFAULT_SNAPSHOT_EXPORT_LIMIT}. */
  limit?: number;
  /** User whose entities are being exported. Required. */
  user_id: string;
}

export const DEFAULT_SNAPSHOT_EXPORT_LIMIT = 500;

/** Envelope returned by {@link exportEntitySnapshots}. */
export interface SnapshotExportDocument {
  schema_version: "0.1.0";
  exported_at: string;
  filter: Omit<SnapshotExportFilter, "user_id"> & { user_id: string };
  total_entities: number;
  entities: ExportedEntitySnapshot[];
}

export interface AttributionFingerprint {
  tiers: Partial<Record<AttributionTier, number>>;
  agent_subs: string[];
  client_names: string[];
  /**
   * True if every contributing observation carries at least one
   * attribution key (agent_sub / agent_public_key / client_name /
   * connection_id). Lets drift reports flag "still anonymous".
   */
  fully_attributed: boolean;
}

export interface ExportedEntitySnapshot {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  canonical_name?: string | null;
  computed_at: string;
  last_observation_at: string;
  observation_count: number;
  snapshot: Record<string, unknown>;
  /** Map of field → observation id that produced the winning value. */
  provenance: Record<string, string>;
  /**
   * Histogram of `observation_source` values contributing to this
   * snapshot. NULL maps to the legacy "unclassified" bucket so drift
   * reports can flag pre-classification rows.
   */
  observation_source_histogram: Partial<Record<ObservationSource | "unclassified", number>>;
  /** Roll-up of attribution fields across contributing observations. */
  attribution_fingerprint: AttributionFingerprint;
}

interface ObservationRow {
  id: string;
  observation_source?: ObservationSource | null;
  provenance?: unknown;
}

interface EntityRow {
  id: string;
  entity_type: string;
  canonical_name: string | null;
}

interface SnapshotRow {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, string>;
}

/**
 * Produce a canonical JSON export of entity snapshots matching the
 * provided filter. Runs one query per stage (entities, snapshots,
 * observations) and joins in memory so callers can hook up to any
 * repository backend the `db` shim supports.
 */
export async function exportEntitySnapshots(
  filter: SnapshotExportFilter
): Promise<SnapshotExportDocument> {
  const limit = filter.limit ?? DEFAULT_SNAPSHOT_EXPORT_LIMIT;

  let snapshotQuery = db.from("entity_snapshots").select("*").eq("user_id", filter.user_id);

  if (filter.entity_types && filter.entity_types.length > 0) {
    snapshotQuery = snapshotQuery.in("entity_type", filter.entity_types);
  }
  if (filter.since) {
    snapshotQuery = snapshotQuery.gte("last_observation_at", filter.since);
  }
  snapshotQuery = snapshotQuery.order("last_observation_at", { ascending: false }).limit(limit);

  const { data: snapshotsRaw, error: snapErr } = await snapshotQuery;
  if (snapErr) {
    throw new Error(`Failed to read entity_snapshots: ${snapErr.message}`);
  }

  const snapshots = (snapshotsRaw ?? []) as SnapshotRow[];
  if (snapshots.length === 0) {
    return buildDocument(filter, []);
  }

  const entityIds = snapshots.map((s) => s.entity_id);

  const { data: entitiesRaw, error: entityErr } = await db
    .from("entities")
    .select("id, entity_type, canonical_name")
    .in("id", entityIds);
  if (entityErr) {
    throw new Error(`Failed to read entities: ${entityErr.message}`);
  }
  const entityById = new Map<string, EntityRow>(
    ((entitiesRaw ?? []) as EntityRow[]).map((e) => [e.id, e])
  );

  const { data: observationsRaw, error: obsErr } = await db
    .from("observations")
    .select("id, entity_id, observation_source, provenance")
    .in("entity_id", entityIds)
    .eq("user_id", filter.user_id);
  if (obsErr) {
    throw new Error(`Failed to read observations: ${obsErr.message}`);
  }
  const observations = (observationsRaw ?? []) as (ObservationRow & {
    entity_id: string;
  })[];

  // The observation-level filters (observation_source / agent_sub /
  // attribution_tier) restrict which ENTITIES appear in the output:
  // an entity survives iff at least one of its observations matches.
  const obsByEntity = new Map<string, (ObservationRow & { entity_id: string })[]>();
  for (const row of observations) {
    const bucket = obsByEntity.get(row.entity_id) ?? [];
    bucket.push(row);
    obsByEntity.set(row.entity_id, bucket);
  }

  const keep = (entityId: string): boolean => {
    if (!filter.observation_source && !filter.agent_sub && !filter.attribution_tier) {
      return true;
    }
    const rows = obsByEntity.get(entityId) ?? [];
    return rows.some((row) => {
      if (filter.observation_source && row.observation_source !== filter.observation_source) {
        return false;
      }
      if (filter.agent_sub || filter.attribution_tier) {
        const prov = coerceProvenance(row.provenance);
        if (filter.agent_sub && prov.agent_sub !== filter.agent_sub) return false;
        if (filter.attribution_tier && prov.attribution_tier !== filter.attribution_tier) {
          return false;
        }
      }
      return true;
    });
  };

  const exported: ExportedEntitySnapshot[] = snapshots
    .filter((snap) => keep(snap.entity_id))
    .map((snap) => {
      const entity = entityById.get(snap.entity_id);
      const contributingObs = obsByEntity.get(snap.entity_id) ?? [];
      return {
        entity_id: snap.entity_id,
        entity_type: entity?.entity_type ?? snap.entity_type,
        schema_version: snap.schema_version,
        canonical_name: entity?.canonical_name ?? null,
        computed_at: snap.computed_at,
        last_observation_at: snap.last_observation_at,
        observation_count: snap.observation_count,
        snapshot: snap.snapshot,
        provenance: snap.provenance ?? {},
        observation_source_histogram: buildObservationSourceHistogram(contributingObs),
        attribution_fingerprint: buildAttributionFingerprint(contributingObs),
      } satisfies ExportedEntitySnapshot;
    });

  return buildDocument(filter, exported);
}

function buildDocument(
  filter: SnapshotExportFilter,
  entities: ExportedEntitySnapshot[]
): SnapshotExportDocument {
  return {
    schema_version: "0.1.0",
    exported_at: new Date().toISOString(),
    filter: { ...filter },
    total_entities: entities.length,
    entities,
  };
}

function coerceProvenance(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // Malformed provenance blobs are treated as empty — better to
      // surface "no attribution" than crash the whole export.
      return {};
    }
  }
  return {};
}

function buildObservationSourceHistogram(
  rows: Array<{ observation_source?: ObservationSource | null }>
): Partial<Record<ObservationSource | "unclassified", number>> {
  const out: Partial<Record<ObservationSource | "unclassified", number>> = {};
  for (const row of rows) {
    const key: ObservationSource | "unclassified" =
      (row.observation_source as ObservationSource | null | undefined) ?? "unclassified";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function buildAttributionFingerprint(
  rows: Array<{ provenance?: unknown }>
): AttributionFingerprint {
  const tiers: Partial<Record<AttributionTier, number>> = {};
  const agentSubs = new Set<string>();
  const clientNames = new Set<string>();
  let attributedCount = 0;

  for (const row of rows) {
    const prov = coerceProvenance(row.provenance);
    const tier = prov.attribution_tier as AttributionTier | undefined;
    if (tier) {
      tiers[tier] = (tiers[tier] ?? 0) + 1;
    }
    if (typeof prov.agent_sub === "string" && prov.agent_sub.length > 0) {
      agentSubs.add(prov.agent_sub);
    }
    if (typeof prov.client_name === "string" && prov.client_name.length > 0) {
      clientNames.add(prov.client_name);
    }
    const hasAttribution =
      typeof prov.agent_sub === "string" ||
      typeof prov.agent_public_key === "string" ||
      typeof prov.client_name === "string" ||
      typeof prov.connection_id === "string";
    if (hasAttribution) attributedCount += 1;
  }

  return {
    tiers,
    agent_subs: [...agentSubs].sort(),
    client_names: [...clientNames].sort(),
    fully_attributed: rows.length > 0 && attributedCount === rows.length,
  };
}
