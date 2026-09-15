/**
 * Regression tests for issue #2033:
 * a correct() observation (`is_correction: true`) on a `last_write` field
 * must survive a later, non-correction write — the "corrections always win"
 * contract (#1541) already honoured by `merge_array`, extended here to
 * `last_write`, the default merge policy for every auto-discovered field.
 *
 * The reducer partitions `last_write` candidates on the `is_correction`
 * marker (stamped only by `createCorrection`, never client-settable): when
 * any candidate is correction-marked, only correction-marked candidates are
 * considered. Corrections remain mutually last-write among themselves via
 * the existing observed_at DESC sort. Ordinary numeric `source_priority` is
 * NOT read by this partition — #1755 intentionally left source_priority
 * inert for last_write fields, and this fix must not reintroduce that for
 * non-correction writes.
 *
 * Hermetic: mocks schemaRegistry.loadActiveSchema (no DB), consistent with
 * tests/unit/observation_reducer_merge_array_correction.test.ts.
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

const testEntityId = "ent_test_last_write_correction_2033";
const testEntityType = "auto_discovered_fixture_2033";
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

describe("ObservationReducer - last_write correction durability (#2033)", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-2033",
      entity_type: testEntityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: {
          field: { type: "string", required: false },
          other_field: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      // Auto-discovered schemas default every field to last_write — the
      // exact policy shape buildSchemaFromExtractedFields produces.
      reducer_config: {
        merge_policies: {
          field: { strategy: "last_write" },
          other_field: { strategy: "last_write" },
        },
      },
      active: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("P0 repro: a correction survives a later lower-priority write with a later observed_at", async () => {
    const original = makeObs({
      id: "obs_a",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      observation_source: "import",
      fields: { field: "A" },
    });
    const correction = makeObs({
      id: "obs_correction_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      is_correction: true,
      fields: { field: "B" },
    });
    // Routine re-ingest AFTER the correction, default priority, non-correction.
    const reIngest = makeObs({
      id: "obs_reingest_a_again",
      observed_at: "2026-01-03T00:00:00Z",
      source_priority: 100,
      observation_source: "import",
      fields: { field: "A" },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [
      original,
      correction,
      reIngest,
    ]);

    expect(snapshot!.snapshot.field).toBe("B");
    expect(snapshot!.provenance.field).toBe("obs_correction_b");
  });

  it("corrections remain mutually last-write among themselves", async () => {
    const firstCorrection = makeObs({
      id: "obs_correction_1",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      is_correction: true,
      fields: { field: "first-correction" },
    });
    const secondCorrection = makeObs({
      id: "obs_correction_2",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      is_correction: true,
      fields: { field: "second-correction" },
    });
    const laterLowerPriorityWrite = makeObs({
      id: "obs_reingest",
      observed_at: "2026-01-03T00:00:00Z",
      source_priority: 100,
      observation_source: "import",
      fields: { field: "reingest-should-not-win" },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [
      firstCorrection,
      secondCorrection,
      laterLowerPriorityWrite,
    ]);

    // Second (more recent) correction wins over the first.
    expect(snapshot!.snapshot.field).toBe("second-correction");
    expect(snapshot!.provenance.field).toBe("obs_correction_2");
  });

  it("ordinary source_priority on last_write fields is unchanged for non-correction writes (#1755)", async () => {
    // A non-correction write with an elevated (non-default) source_priority
    // must NOT be treated as load-bearing on a last_write field — only
    // observed_at governs when no observation is correction-marked. This
    // locks #1755's standing decision so this fix cannot reintroduce
    // priority-based resolution for the general case.
    const higherPriorityButOlder = makeObs({
      id: "obs_high_priority_old",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 500,
      observation_source: "import",
      fields: { field: "high-priority-old" },
    });
    const lowerPriorityButNewer = makeObs({
      id: "obs_low_priority_new",
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 100,
      observation_source: "import",
      fields: { field: "low-priority-new" },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [
      higherPriorityButOlder,
      lowerPriorityButNewer,
    ]);

    // Pure observed_at DESC — the newer, lower-priority write wins, exactly
    // as before this change (source_priority is not read on this path).
    expect(snapshot!.snapshot.field).toBe("low-priority-new");
    expect(snapshot!.provenance.field).toBe("obs_low_priority_new");
  });

  it("empty/never-corrected field resolves exactly as pure last_write (partition is a no-op)", async () => {
    const obs1 = makeObs({
      id: "obs_never_corrected_1",
      observed_at: "2026-01-01T00:00:00Z",
      fields: { field: "first" },
    });
    const obs2 = makeObs({
      id: "obs_never_corrected_2",
      observed_at: "2026-01-02T00:00:00Z",
      fields: { field: "second" },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [obs1, obs2]);

    expect(snapshot!.snapshot.field).toBe("second");
    expect(snapshot!.provenance.field).toBe("obs_never_corrected_2");
  });

  it("multi-field independence: correcting field A does not affect sibling field B's last_write resolution", async () => {
    const fieldACorrection = makeObs({
      id: "obs_field_a_correction",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      is_correction: true,
      fields: { field: "corrected-a" },
    });
    const fieldALaterReingest = makeObs({
      id: "obs_field_a_reingest",
      observed_at: "2026-01-05T00:00:00Z",
      source_priority: 100,
      observation_source: "import",
      fields: { field: "reingested-a" },
    });
    const fieldBEarlier = makeObs({
      id: "obs_field_b_early",
      observed_at: "2026-01-02T00:00:00Z",
      fields: { other_field: "b-early" },
    });
    const fieldBLater = makeObs({
      id: "obs_field_b_late",
      observed_at: "2026-01-03T00:00:00Z",
      fields: { other_field: "b-late" },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [
      fieldACorrection,
      fieldALaterReingest,
      fieldBEarlier,
      fieldBLater,
    ]);

    // field stays corrected (survives the later reingest)...
    expect(snapshot!.snapshot.field).toBe("corrected-a");
    // ...while other_field resolves by plain last_write, uncorrected.
    expect(snapshot!.snapshot.other_field).toBe("b-late");
  });

  it("computeSnapshotWithDefaults (unseeded type, no schema) also honours the correction marker", async () => {
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue(null);

    const original = makeObs({
      id: "obs_unseeded_a",
      entity_type: "unseeded_entity_2033",
      observed_at: "2026-01-01T00:00:00Z",
      fields: { field: "A" },
    });
    const correction = makeObs({
      id: "obs_unseeded_correction",
      entity_type: "unseeded_entity_2033",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      is_correction: true,
      fields: { field: "B" },
    });
    const reIngest = makeObs({
      id: "obs_unseeded_reingest",
      entity_type: "unseeded_entity_2033",
      observed_at: "2026-01-03T00:00:00Z",
      fields: { field: "A" },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [
      original,
      correction,
      reIngest,
    ]);

    expect(snapshot!.snapshot.field).toBe("B");
  });
});
