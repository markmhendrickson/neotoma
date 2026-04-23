/**
 * Reducer tie-break tests for the `observation_source` classification
 * (fleet-general write integrity layer — item-1-observation-source).
 *
 * `observation_source` is a secondary tie-breaker applied AFTER numeric
 * `source_priority` and BEFORE `observed_at`/id. It is schema-agnostic:
 * the order is declared on `reducer_config.observation_source_priority`,
 * and falls back to the registry-wide default
 * `sensor > workflow_state > llm_summary > human > import`.
 *
 * These tests lock the contract so a future refactor cannot silently
 * reintroduce per-type branching or flip the default priority.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ObservationReducer,
  type Observation,
} from "../../src/reducers/observation_reducer.js";
import { DEFAULT_OBSERVATION_SOURCE_PRIORITY } from "../../src/services/schema_registry.js";

vi.mock("../../src/services/schema_registry.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/schema_registry.js")
  >("../../src/services/schema_registry.js");
  return {
    ...actual,
    schemaRegistry: {
      loadActiveSchema: vi.fn(),
    },
  };
});

vi.mock("../../src/services/schema_definitions.js", () => ({
  getSchemaDefinition: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/services/field_validation.js", () => ({
  validateFieldWithConverters: vi
    .fn()
    .mockImplementation((_field: string, value: unknown) => ({
      isValid: true,
      value,
      shouldRouteToRawFragments: false,
    })),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { schemaRegistry } from "../../src/services/schema_registry.js";

function makeObs(
  overrides: Partial<Observation> & {
    id: string;
    fields: Record<string, unknown>;
    observed_at: string;
  },
): Observation {
  return {
    entity_id: "ent_test",
    entity_type: "test_entity",
    schema_version: "1.0",
    source_id: "src_1",
    specificity_score: 1.0,
    source_priority: 100,
    created_at: overrides.observed_at,
    user_id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

const BASE_SCHEMA = {
  id: "schema-1",
  entity_type: "test_entity",
  schema_version: "1.0.0",
  schema_definition: {
    fields: {
      name: { type: "string" as const, required: false },
      value: { type: "string" as const, required: false },
    },
    identity_opt_out: "heuristic_canonical_name",
  },
  reducer_config: {
    merge_policies: {
      name: { strategy: "last_write" as const },
      value: {
        strategy: "highest_priority" as const,
        tie_breaker: "observed_at" as const,
      },
    },
  },
  active: true,
};

describe("ObservationReducer - observation_source tie-break", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses default priority order (sensor > workflow_state > llm_summary > human > import) when reducer_config omits observation_source_priority", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue(BASE_SCHEMA);

    // Sanity-check the registry default stays locked to the documented
    // order. Changing this ordering requires a deliberate schema-level
    // override and a changelog entry.
    expect([...DEFAULT_OBSERVATION_SOURCE_PRIORITY]).toEqual([
      "sensor",
      "workflow_state",
      "llm_summary",
      "human",
      "import",
    ]);

    // Four observations with identical numeric `source_priority` (100).
    // After numeric priority they differ only by `observation_source`.
    // With the default order, `sensor` must win.
    const obs: Observation[] = [
      makeObs({
        id: "obs_human",
        observed_at: "2025-03-01T00:00:00Z",
        fields: { value: "from_human" },
        observation_source: "human",
      }),
      makeObs({
        id: "obs_llm",
        observed_at: "2025-03-02T00:00:00Z",
        fields: { value: "from_llm" },
        observation_source: "llm_summary",
      }),
      makeObs({
        id: "obs_sensor",
        observed_at: "2025-01-01T00:00:00Z", // oldest
        fields: { value: "from_sensor" },
        observation_source: "sensor",
      }),
      makeObs({
        id: "obs_import",
        observed_at: "2025-04-01T00:00:00Z", // newest
        fields: { value: "from_import" },
        observation_source: "import",
      }),
    ];

    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(snap!.snapshot.value).toBe("from_sensor");
    expect(snap!.provenance.value).toBe("obs_sensor");
  });

  it("numeric source_priority still dominates observation_source", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue(BASE_SCHEMA);

    // A high-priority `import` write must beat a low-priority `sensor`
    // write — `observation_source` is a SECONDARY tie-break only.
    const obs: Observation[] = [
      makeObs({
        id: "obs_import_high",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { value: "import_wins" },
        source_priority: 200,
        observation_source: "import",
      }),
      makeObs({
        id: "obs_sensor_low",
        observed_at: "2025-02-01T00:00:00Z",
        fields: { value: "sensor_loses" },
        source_priority: 100,
        observation_source: "sensor",
      }),
    ];

    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(snap!.snapshot.value).toBe("import_wins");
    expect(snap!.provenance.value).toBe("obs_import_high");
  });

  it("respects schema-declared observation_source_priority override", async () => {
    // A schema can flip the default order. Here we declare human as the
    // highest-ranked source — simulating a fleet that trusts manual
    // acceptances over automated sensors for this entity type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      ...BASE_SCHEMA,
      reducer_config: {
        merge_policies: BASE_SCHEMA.reducer_config.merge_policies,
        observation_source_priority: [
          "human",
          "sensor",
          "workflow_state",
          "llm_summary",
          "import",
        ] as const,
      },
    });

    const obs: Observation[] = [
      makeObs({
        id: "obs_sensor",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { value: "from_sensor" },
        observation_source: "sensor",
      }),
      makeObs({
        id: "obs_human",
        observed_at: "2025-01-02T00:00:00Z",
        fields: { value: "from_human" },
        observation_source: "human",
      }),
    ];

    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(snap!.snapshot.value).toBe("from_human");
    expect(snap!.provenance.value).toBe("obs_human");
  });

  it("sorts NULL / unknown observation_source last", async () => {
    // Legacy rows with NULL observation_source (soft-migrated SQLite
    // databases) and writes with an out-of-schema kind must sort AFTER
    // every declared rank so historical data cannot beat classified
    // writes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue(BASE_SCHEMA);

    const obs: Observation[] = [
      makeObs({
        id: "obs_legacy_null",
        observed_at: "2025-04-01T00:00:00Z",
        fields: { value: "legacy_null" },
        observation_source: null,
      }),
      makeObs({
        id: "obs_llm",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { value: "from_llm" },
        observation_source: "llm_summary",
      }),
    ];

    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(snap!.snapshot.value).toBe("from_llm");
    expect(snap!.provenance.value).toBe("obs_llm");
  });

  it("falls back to observed_at tie-breaker when both source_priority and observation_source match", async () => {
    // Two writes with identical priority AND identical observation_source
    // must fall through to observed_at (for `observed_at` tie-breaker
    // policy), preserving legacy behavior when the classification carries
    // no signal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue(BASE_SCHEMA);

    const obs: Observation[] = [
      makeObs({
        id: "obs_early",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { value: "early" },
        observation_source: "sensor",
      }),
      makeObs({
        id: "obs_late",
        observed_at: "2025-02-01T00:00:00Z",
        fields: { value: "late" },
        observation_source: "sensor",
      }),
    ];

    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(snap!.snapshot.value).toBe("late");
    expect(snap!.provenance.value).toBe("obs_late");
  });
});
