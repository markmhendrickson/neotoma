/**
 * Drift comparison service — fleet-general write integrity layer
 * (item-3-snapshot-export).
 *
 * Compares a canonical Neotoma snapshot export against any external
 * state source via a pluggable `ExternalParser` interface. v0.1 ships
 * with the identity JSON parser; fleet-specific parsers (AIBTC
 * MEMORY.md ASMR, LangGraph state dumps, internal SQLite mirrors)
 * register via {@link registerExternalParser} without touching core.
 *
 * Output contract:
 *   * `missing_in_neotoma` — entities the external source knows about
 *     but Neotoma does not (by `entity_id`).
 *   * `missing_in_external` — entities Neotoma has but the external
 *     source does not.
 *   * `field_diffs` — per-field value disagreements for entities
 *     present in both.
 *   * `provenance_gaps` — entities with concerning provenance posture
 *     (unclassified observation_source, anonymous/unverified
 *     attribution) even when values agree.
 *
 * Design notes:
 *   * Deliberately does NOT care which side is "right" — the report is
 *     symmetric and the caller decides how to reconcile.
 *   * Parsers are pure functions (raw string → normalised shape) so
 *     they're easy to unit test and swap. Core does not import any
 *     fleet-specific code.
 */

import type { ExportedEntitySnapshot, SnapshotExportDocument } from "./snapshot_export.js";

/** Normalised shape every parser must return. */
export interface NormalizedExternalSnapshot {
  source_label: string;
  exported_at?: string;
  entities: NormalizedExternalEntity[];
}

export interface NormalizedExternalEntity {
  entity_id: string;
  entity_type?: string;
  canonical_name?: string | null;
  snapshot: Record<string, unknown>;
}

export interface ExternalParser {
  /** Short identifier used by the CLI flag and the registry. */
  name: string;
  /** Human-readable description for docs / help output. */
  description: string;
  /** Pure transform from raw payload string to normalised shape. */
  parse(raw: string): NormalizedExternalSnapshot;
}

export interface DriftReport {
  schema_version: "0.1.0";
  generated_at: string;
  neotoma_source: string;
  external_source: string;
  summary: {
    total_neotoma: number;
    total_external: number;
    in_common: number;
    missing_in_neotoma: number;
    missing_in_external: number;
    field_diffs: number;
    provenance_gaps: number;
  };
  missing_in_neotoma: NormalizedExternalEntity[];
  missing_in_external: ExportedEntitySnapshot[];
  field_diffs: FieldDiff[];
  provenance_gaps: ProvenanceGap[];
}

export interface FieldDiff {
  entity_id: string;
  entity_type?: string;
  field: string;
  neotoma_value: unknown;
  external_value: unknown;
  neotoma_source_observation_id?: string;
}

export interface ProvenanceGap {
  entity_id: string;
  entity_type: string;
  reasons: ProvenanceGapReason[];
}

export type ProvenanceGapReason =
  | "unclassified_observation_source"
  | "anonymous_attribution"
  | "unverified_client_attribution";

// ---------------------------------------------------------------------
// Parser registry
// ---------------------------------------------------------------------

const parserRegistry = new Map<string, ExternalParser>();

export function registerExternalParser(parser: ExternalParser): void {
  parserRegistry.set(parser.name, parser);
}

export function getExternalParser(name: string): ExternalParser | undefined {
  return parserRegistry.get(name);
}

export function listExternalParsers(): ExternalParser[] {
  return [...parserRegistry.values()];
}

/**
 * Built-in identity JSON parser. Accepts either a bare array of
 * {@link NormalizedExternalEntity} or an object `{ entities: [...] }`.
 * Keeps the exporter round-trip-safe: calling `diff(export, export)`
 * with this parser produces an empty report.
 */
export const identityJsonParser: ExternalParser = {
  name: "json",
  description:
    "Identity JSON parser. Accepts `{ entities: [...] }` or a bare array matching NormalizedExternalEntity. The fleet-neutral default.",
  parse(raw: string): NormalizedExternalSnapshot {
    const parsed = JSON.parse(raw);
    const entities: NormalizedExternalEntity[] = Array.isArray(parsed)
      ? (parsed as NormalizedExternalEntity[])
      : Array.isArray((parsed as { entities?: unknown }).entities)
        ? (parsed as { entities: NormalizedExternalEntity[] }).entities
        : [];
    const typed = entities
      .filter(
        (e): e is NormalizedExternalEntity =>
          typeof e?.entity_id === "string" && e.entity_id.length > 0
      )
      .map((e) => ({
        entity_id: e.entity_id,
        entity_type: e.entity_type,
        canonical_name: e.canonical_name ?? null,
        snapshot: (e.snapshot ?? {}) as Record<string, unknown>,
      }));
    return {
      source_label: "json",
      exported_at:
        typeof (parsed as { exported_at?: unknown }).exported_at === "string"
          ? (parsed as { exported_at: string }).exported_at
          : undefined,
      entities: typed,
    };
  },
};

registerExternalParser(identityJsonParser);

// ---------------------------------------------------------------------
// Comparator
// ---------------------------------------------------------------------

export function compareSnapshots(
  neotomaExport: SnapshotExportDocument,
  externalSnapshot: NormalizedExternalSnapshot
): DriftReport {
  const neotomaById = new Map<string, ExportedEntitySnapshot>();
  for (const e of neotomaExport.entities) neotomaById.set(e.entity_id, e);

  const externalById = new Map<string, NormalizedExternalEntity>();
  for (const e of externalSnapshot.entities) externalById.set(e.entity_id, e);

  const missing_in_neotoma: NormalizedExternalEntity[] = [];
  for (const [id, ext] of externalById) {
    if (!neotomaById.has(id)) missing_in_neotoma.push(ext);
  }

  const missing_in_external: ExportedEntitySnapshot[] = [];
  for (const [id, neo] of neotomaById) {
    if (!externalById.has(id)) missing_in_external.push(neo);
  }

  const field_diffs: FieldDiff[] = [];
  const provenance_gaps: ProvenanceGap[] = [];
  let inCommon = 0;

  for (const [id, neo] of neotomaById) {
    const ext = externalById.get(id);
    if (!ext) continue;
    inCommon += 1;

    const fields = new Set<string>([
      ...Object.keys(neo.snapshot ?? {}),
      ...Object.keys(ext.snapshot ?? {}),
    ]);
    for (const field of fields) {
      const nv = neo.snapshot?.[field];
      const xv = ext.snapshot?.[field];
      if (!deepEqual(nv, xv)) {
        field_diffs.push({
          entity_id: id,
          entity_type: neo.entity_type,
          field,
          neotoma_value: nv,
          external_value: xv,
          neotoma_source_observation_id: neo.provenance?.[field],
        });
      }
    }

    const gap = diagnoseProvenanceGap(neo);
    if (gap) provenance_gaps.push(gap);
  }

  return {
    schema_version: "0.1.0",
    generated_at: new Date().toISOString(),
    neotoma_source: "neotoma",
    external_source: externalSnapshot.source_label,
    summary: {
      total_neotoma: neotomaExport.entities.length,
      total_external: externalSnapshot.entities.length,
      in_common: inCommon,
      missing_in_neotoma: missing_in_neotoma.length,
      missing_in_external: missing_in_external.length,
      field_diffs: field_diffs.length,
      provenance_gaps: provenance_gaps.length,
    },
    missing_in_neotoma,
    missing_in_external,
    field_diffs,
    provenance_gaps,
  };
}

function diagnoseProvenanceGap(entity: ExportedEntitySnapshot): ProvenanceGap | null {
  const reasons: ProvenanceGapReason[] = [];
  const unclassified = (entity.observation_source_histogram?.unclassified ?? 0) > 0;
  if (unclassified) reasons.push("unclassified_observation_source");

  const tiers = entity.attribution_fingerprint?.tiers ?? {};
  if ((tiers.anonymous ?? 0) > 0) reasons.push("anonymous_attribution");
  if ((tiers.unverified_client ?? 0) > 0) reasons.push("unverified_client_attribution");

  if (reasons.length === 0) return null;
  return {
    entity_id: entity.entity_id,
    entity_type: entity.entity_type,
    reasons,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}
