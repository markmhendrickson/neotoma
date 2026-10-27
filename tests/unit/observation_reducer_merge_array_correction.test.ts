/**
 * Regression tests for issue #1541:
 * correct() on an array-typed (merge_array) field must fully REPLACE the
 * array, not union the correction's array into the prior observations'.
 *
 * The gate is `source_priority`-based and applies to ANY higher-priority
 * write — corrections are merely the motivating case (correct() hard-codes
 * source_priority 1000). The reducer's merge_array strategy restricts the
 * union to observations at the maximum source_priority present, so:
 *   - all-equal-priority observations still union (normal behavior), and
 *   - a strictly higher-priority write (e.g. a correction, or a sensor)
 *     replaces lower-priority arrays.
 *
 * Hermetic: mocks schemaRegistry.loadActiveSchema (no DB, no global schema
 * registration) — consistent with tests/unit/observation_reducer_projection.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObservationReducer, type Observation } from "../../src/reducers/observation_reducer.js";

vi.mock("../../src/services/schema_registry.js", () => ({
  DEFAULT_OBSERVATION_SOURCE_PRIORITY: [
    "sensor",
    "workflow_state",
    "llm_summary",
    "human",
    "import",
  ] as const,
  schemaRegistry: {
    loadActiveSchema: vi.fn(),
  },
}));

vi.mock("../../src/services/schema_definitions.js", () => ({
  getSchemaDefinition: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/services/field_validation.js", () => ({
  validateFieldWithConverters: vi
    .fn()
    .mockImplementation((_field: string, value: unknown, _fieldDef: unknown) => ({
      isValid: true,
      value,
      shouldRouteToRawFragments: false,
    })),
}));

import { schemaRegistry } from "../../src/services/schema_registry.js";

const testEntityId = "ent_test_merge_array_1541";
const testEntityType = "merge_array_fixture_1541";
const testUserId = "00000000-0000-0000-0000-000000000000";

function makeObs(
  overrides: Partial<Observation> & { fields: Record<string, unknown> }
): Observation {
  return {
    id: "obs_default",
    entity_id: testEntityId,
    entity_type: testEntityType,
    schema_version: "1.0.0",
    source_id: "src_default",
    observed_at: "2026-01-01T00:00:00Z",
    specificity_score: 1.0,
    source_priority: 100,
    created_at: "2026-01-01T00:00:00Z",
    user_id: testUserId,
    ...overrides,
  };
}

describe("ObservationReducer - merge_array correction replacement (#1541)", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-merge-array-1541",
      entity_type: testEntityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: {
          items: { type: "array", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          items: { strategy: "merge_array" },
        },
      },
      active: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces the array when a higher-priority correction is present (no union with old values)", async () => {
    const base = makeObs({
      id: "obs_base",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: { items: ["a", "b", "c"] },
    });
    const correction = makeObs({
      id: "obs_correction",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000, // correction tier
      fields: { items: ["x", "y"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [base, correction]);
    const items = snapshot!.snapshot.items as unknown[];

    // The correction fully replaces — old elements must NOT survive.
    expect(new Set(items)).toEqual(new Set(["x", "y"]));
    expect(items).not.toContain("a");
    expect(items).not.toContain("b");
    expect(items).not.toContain("c");
  });

  it("still unions arrays when all observations share the same (non-correction) priority", async () => {
    const obs1 = makeObs({
      id: "obs_1",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: { items: ["a", "b"] },
    });
    const obs2 = makeObs({
      id: "obs_2",
      source_id: "src_2",
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 100,
      fields: { items: ["b", "c"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [obs1, obs2]);
    const items = snapshot!.snapshot.items as unknown[];

    // Same priority -> union (deduped) preserved.
    expect(new Set(items)).toEqual(new Set(["a", "b", "c"]));
  });

  it("a higher-priority correction supersedes an earlier malformed lower-priority write", async () => {
    // Simulates the original #1541 artifact: a lower-priority observation left
    // a stringified-array element; a higher-priority correction must win and
    // the malformed lower-priority element must be dropped by the priority gate.
    const malformed = makeObs({
      id: "obs_malformed",
      source_id: "src_malformed",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: { items: ['["nested","stringified","array"]', "leftover"] },
    });
    const cleanCorrection = makeObs({
      id: "obs_clean",
      source_id: null,
      observed_at: "2026-01-03T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["one", "two", "three"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [malformed, cleanCorrection]);
    const items = snapshot!.snapshot.items as unknown[];

    expect(new Set(items)).toEqual(new Set(["one", "two", "three"]));
    expect(items).not.toContain('["nested","stringified","array"]');
    expect(items).not.toContain("leftover");
  });

  it("a later correction replaces an earlier one at the same priority (#2341)", async () => {
    // Every correction is written at priority 1000, so the priority gate keeps
    // all of them. Before #2341 they were unioned, which meant a correction
    // could add array members but never remove one. The later correction now
    // sets the array to exactly its members.
    const corrA = makeObs({
      id: "obs_corr_a",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["p", "q"] },
    });
    const corrB = makeObs({
      id: "obs_corr_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["q", "r"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [corrA, corrB]);
    const items = snapshot!.snapshot.items as unknown[];

    expect([...items].sort()).toEqual(["q", "r"]);
    expect(items).not.toContain("p");
  });

  it("a shorter correction removes items a larger earlier correction added (the reported case)", async () => {
    const wide = Array.from({ length: 34 }, (_, i) => `type_${i}`);
    const narrow = wide.slice(0, 10);
    const original = makeObs({
      id: "obs_original_store",
      source_id: "src_original",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: { items: wide },
    });
    const firstCorrection = makeObs({
      id: "obs_first_correction",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: wide },
    });
    const secondCorrection = makeObs({
      id: "obs_second_correction",
      source_id: null,
      observed_at: "2026-01-03T00:00:00Z",
      source_priority: 1000,
      fields: { items: narrow },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [
      original,
      firstCorrection,
      secondCorrection,
    ]);
    const items = snapshot!.snapshot.items as unknown[];

    expect(items).toHaveLength(10);
    expect([...items].sort()).toEqual([...narrow].sort());
    expect(snapshot!.provenance.items).toBe("obs_second_correction");
  });

  it("gives the same answer whatever order the observations arrive in", async () => {
    const corrA = makeObs({
      id: "obs_corr_a",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["p", "q", "z"] },
    });
    const corrB = makeObs({
      id: "obs_corr_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["q"] },
    });
    const base = makeObs({
      id: "obs_base_order",
      observed_at: "2025-12-31T00:00:00Z",
      source_priority: 100,
      fields: { items: ["old"] },
    });

    const forward = await reducer.computeSnapshot(testEntityId, [base, corrA, corrB]);
    const reversed = await reducer.computeSnapshot(testEntityId, [corrB, corrA, base]);

    expect(forward!.snapshot.items).toEqual(["q"]);
    expect(reversed!.snapshot.items).toEqual(["q"]);
  });

  it("breaks an observed_at tie between corrections by created_at, then id", async () => {
    const earlier = makeObs({
      id: "obs_tie_a",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-02T00:00:00.001Z",
      source_priority: 1000,
      fields: { items: ["first"] },
    });
    const later = makeObs({
      id: "obs_tie_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-02T00:00:00.002Z",
      source_priority: 1000,
      fields: { items: ["second"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [later, earlier]);
    expect(snapshot!.snapshot.items).toEqual(["second"]);
  });

  it("an empty-array correction after a prior correction clears the field to []", async () => {
    const corrA = makeObs({
      id: "obs_corr_clear_a",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["a"] },
    });
    const corrEmpty = makeObs({
      id: "obs_corr_clear_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: [] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [corrA, corrEmpty]);
    expect(snapshot!.snapshot.items).toEqual([]);
  });

  it("a null correction after a prior correction clears the field to []", async () => {
    const corrA = makeObs({
      id: "obs_corr_null_a",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["a"] },
    });
    const corrNull = makeObs({
      id: "obs_corr_null_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: null },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [corrA, corrNull]);
    expect(snapshot!.snapshot.items).toEqual([]);
  });

  it("a later non-empty correction after a null correction sets the array again", async () => {
    const corrNull = makeObs({
      id: "obs_corr_renull_a",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      fields: { items: null },
    });
    const corrB = makeObs({
      id: "obs_corr_renull_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["b"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [corrNull, corrB]);
    expect(snapshot!.snapshot.items).toEqual(["b"]);
  });

  it("still unions ordinary writes that merely carry priority 1000 (a request cannot forge a correction)", async () => {
    // A write that goes through a public path carries a source_id and an
    // observation_source, so it does not have the correction shape even at
    // priority 1000. Those keep the documented same-priority union.
    const writeA = makeObs({
      id: "obs_plain_a",
      source_id: "src_plain_a",
      observation_source: "human",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["p", "q"] },
    });
    const writeB = makeObs({
      id: "obs_plain_b",
      source_id: "src_plain_b",
      observation_source: "human",
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["q", "r"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [writeA, writeB]);
    expect(new Set(snapshot!.snapshot.items as unknown[])).toEqual(new Set(["p", "q", "r"]));
  });

  it("an ordinary write at priority 1000 does not union into a correction at the same priority", async () => {
    const correction = makeObs({
      id: "obs_corr_mixed",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["kept"] },
    });
    const plain = makeObs({
      id: "obs_plain_mixed",
      source_id: "src_plain_mixed",
      observation_source: "human",
      observed_at: "2026-01-03T00:00:00Z",
      source_priority: 1000,
      fields: { items: ["other"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [correction, plain]);
    expect(snapshot!.snapshot.items).toEqual(["kept"]);
  });

  it("a top-priority null correction clears the array to [] (lower-priority arrays are gated out)", async () => {
    // After the priority gate, a strictly-higher-priority null correction
    // excludes the lower-priority array contributions; the only remaining
    // (top-priority) observation is the null one, which is skipped by the
    // inner null guard, so merge_array writes [] — consistent with §4.3 of
    // docs/subsystems/reducer.md.
    const base = makeObs({
      id: "obs_base_for_null",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: { items: ["a", "b"] },
    });
    const nullCorrection = makeObs({
      id: "obs_null_correction",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { items: null },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [base, nullCorrection]);

    // Snapshot value is an empty array (not the accumulated ["a","b"]).
    expect(snapshot!.snapshot.items).toEqual([]);
  });
});
