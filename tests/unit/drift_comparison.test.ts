/**
 * Unit tests for the drift comparison service (item-3-snapshot-export).
 *
 * These tests cover the pure comparison + parser-registry surface.
 * Full round-trips through the live export path are exercised via the
 * snapshot-export + CLI behavioural tests; here we focus on the
 * contract callers rely on:
 *   - Identity parser is registered by default.
 *   - Symmetric diff (missing on either side, field diffs).
 *   - Provenance-gap reasons are emitted for unclassified writes and
 *     anonymous / unverified_client tiers, even when field values agree.
 *   - Self-diff of the same export yields an empty report.
 */

import { describe, it, expect } from "vitest";

import {
  compareSnapshots,
  getExternalParser,
  identityJsonParser,
  listExternalParsers,
  registerExternalParser,
  type ExternalParser,
  type NormalizedExternalSnapshot,
} from "../../src/services/drift_comparison.js";
import type {
  ExportedEntitySnapshot,
  SnapshotExportDocument,
} from "../../src/services/snapshot_export.js";

function makeNeotomaEntity(
  overrides: Partial<ExportedEntitySnapshot> = {}
): ExportedEntitySnapshot {
  return {
    entity_id: "ent_test",
    entity_type: "agent_task",
    schema_version: "0.1.0",
    canonical_name: "task-1",
    computed_at: "2026-04-01T00:00:00Z",
    last_observation_at: "2026-04-01T00:00:00Z",
    observation_count: 1,
    snapshot: { status: "pending" },
    provenance: { status: "obs_1" },
    observation_source_histogram: { sensor: 1 },
    attribution_fingerprint: {
      tiers: { hardware: 1 },
      agent_subs: ["agent:hw"],
      client_names: [],
      fully_attributed: true,
    },
    ...overrides,
  };
}

function makeNeotomaDoc(
  entities: ExportedEntitySnapshot[]
): SnapshotExportDocument {
  return {
    schema_version: "0.1.0",
    exported_at: "2026-04-01T00:00:00Z",
    filter: { user_id: "user_test" },
    total_entities: entities.length,
    entities,
  };
}

function makeExternal(
  entities: NormalizedExternalSnapshot["entities"],
  source_label = "external-fixture"
): NormalizedExternalSnapshot {
  return { source_label, entities };
}

describe("drift_comparison.identityJsonParser", () => {
  it("is registered under the name `json` by default", () => {
    expect(getExternalParser("json")).toBe(identityJsonParser);
    expect(listExternalParsers().some((p) => p.name === "json")).toBe(true);
  });

  it("accepts both a bare array and an object-wrapped shape", () => {
    const bare = identityJsonParser.parse(
      JSON.stringify([{ entity_id: "ent_1", snapshot: { k: "v" } }])
    );
    expect(bare.entities).toHaveLength(1);
    expect(bare.entities[0]!.entity_id).toBe("ent_1");

    const wrapped = identityJsonParser.parse(
      JSON.stringify({
        entities: [
          { entity_id: "ent_2", snapshot: { k: "v" } },
          { entity_id: "", snapshot: {} }, // dropped: no id
        ],
        exported_at: "2026-04-02T00:00:00Z",
      })
    );
    expect(wrapped.entities).toHaveLength(1);
    expect(wrapped.entities[0]!.entity_id).toBe("ent_2");
    expect(wrapped.exported_at).toBe("2026-04-02T00:00:00Z");
  });
});

describe("drift_comparison.registerExternalParser", () => {
  it("allows fleet-specific parsers to register without touching core", () => {
    const stub: ExternalParser = {
      name: "stub-fleet",
      description: "test stub",
      parse(): NormalizedExternalSnapshot {
        return { source_label: "stub", entities: [] };
      },
    };
    registerExternalParser(stub);
    expect(getExternalParser("stub-fleet")).toBe(stub);
  });
});

describe("drift_comparison.compareSnapshots", () => {
  it("produces an empty report when Neotoma and external are identical", () => {
    const neo = makeNeotomaDoc([makeNeotomaEntity()]);
    const ext = makeExternal([
      {
        entity_id: "ent_test",
        entity_type: "agent_task",
        canonical_name: "task-1",
        snapshot: { status: "pending" },
      },
    ]);
    const report = compareSnapshots(neo, ext);
    expect(report.summary.in_common).toBe(1);
    expect(report.summary.missing_in_neotoma).toBe(0);
    expect(report.summary.missing_in_external).toBe(0);
    expect(report.field_diffs).toEqual([]);
    expect(report.provenance_gaps).toEqual([]);
  });

  it("detects missing entities on each side", () => {
    const neo = makeNeotomaDoc([
      makeNeotomaEntity({ entity_id: "ent_only_neo" }),
    ]);
    const ext = makeExternal([
      {
        entity_id: "ent_only_ext",
        snapshot: { status: "done" },
      },
    ]);
    const report = compareSnapshots(neo, ext);
    expect(report.summary.missing_in_external).toBe(1);
    expect(report.missing_in_external[0]!.entity_id).toBe("ent_only_neo");
    expect(report.summary.missing_in_neotoma).toBe(1);
    expect(report.missing_in_neotoma[0]!.entity_id).toBe("ent_only_ext");
    expect(report.summary.in_common).toBe(0);
  });

  it("reports per-field diffs with neotoma provenance pointer", () => {
    const neo = makeNeotomaDoc([
      makeNeotomaEntity({
        entity_id: "ent_shared",
        snapshot: { status: "pending", summary: "N view" },
        provenance: { status: "obs_N1", summary: "obs_N2" },
      }),
    ]);
    const ext = makeExternal([
      {
        entity_id: "ent_shared",
        snapshot: { status: "running", summary: "N view" },
      },
    ]);
    const report = compareSnapshots(neo, ext);
    expect(report.summary.field_diffs).toBe(1);
    const diff = report.field_diffs[0]!;
    expect(diff.field).toBe("status");
    expect(diff.neotoma_value).toBe("pending");
    expect(diff.external_value).toBe("running");
    expect(diff.neotoma_source_observation_id).toBe("obs_N1");
  });

  it("flags unclassified observation_source as a provenance gap", () => {
    const neo = makeNeotomaDoc([
      makeNeotomaEntity({
        entity_id: "ent_gap_source",
        observation_source_histogram: { unclassified: 2, llm_summary: 1 },
      }),
    ]);
    const ext = makeExternal([
      {
        entity_id: "ent_gap_source",
        snapshot: { status: "pending" },
      },
    ]);
    const report = compareSnapshots(neo, ext);
    expect(report.provenance_gaps).toHaveLength(1);
    expect(report.provenance_gaps[0]!.reasons).toContain(
      "unclassified_observation_source"
    );
  });

  it("flags anonymous and unverified_client attribution as provenance gaps", () => {
    const neo = makeNeotomaDoc([
      makeNeotomaEntity({
        entity_id: "ent_gap_anon",
        attribution_fingerprint: {
          tiers: { anonymous: 3 },
          agent_subs: [],
          client_names: [],
          fully_attributed: false,
        },
      }),
      makeNeotomaEntity({
        entity_id: "ent_gap_unverified",
        attribution_fingerprint: {
          tiers: { unverified_client: 1, hardware: 2 },
          agent_subs: ["agent:hw"],
          client_names: ["legacy-client"],
          fully_attributed: true,
        },
      }),
    ]);
    const ext = makeExternal([
      { entity_id: "ent_gap_anon", snapshot: { status: "pending" } },
      { entity_id: "ent_gap_unverified", snapshot: { status: "pending" } },
    ]);
    const report = compareSnapshots(neo, ext);
    expect(report.provenance_gaps).toHaveLength(2);
    const reasonsById = new Map(
      report.provenance_gaps.map((g) => [g.entity_id, g.reasons])
    );
    expect(reasonsById.get("ent_gap_anon")).toContain("anonymous_attribution");
    expect(reasonsById.get("ent_gap_unverified")).toContain(
      "unverified_client_attribution"
    );
  });

  it("returns zero gaps when every contributing observation is classified + hardware-attributed", () => {
    const neo = makeNeotomaDoc([makeNeotomaEntity()]);
    const ext = makeExternal([
      {
        entity_id: "ent_test",
        snapshot: { status: "pending" },
      },
    ]);
    const report = compareSnapshots(neo, ext);
    expect(report.provenance_gaps).toEqual([]);
  });

  it("summary.total_* match input cardinalities", () => {
    const neo = makeNeotomaDoc([
      makeNeotomaEntity({ entity_id: "a" }),
      makeNeotomaEntity({ entity_id: "b" }),
      makeNeotomaEntity({ entity_id: "c" }),
    ]);
    const ext = makeExternal([
      { entity_id: "b", snapshot: { status: "pending" } },
      { entity_id: "c", snapshot: { status: "pending" } },
      { entity_id: "d", snapshot: { status: "pending" } },
    ]);
    const report = compareSnapshots(neo, ext);
    expect(report.summary.total_neotoma).toBe(3);
    expect(report.summary.total_external).toBe(3);
    expect(report.summary.in_common).toBe(2);
  });
});
