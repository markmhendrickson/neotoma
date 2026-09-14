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

const entityId = "ent_test_scalar_tiebreak_2394";
const entityType = "scalar_tiebreak_fixture_2394";
const userId = "00000000-0000-0000-0000-000000000000";

function obs(overrides: Partial<Observation> & { fields: Record<string, unknown> }): Observation {
  return {
    id: "obs_default",
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0.0",
    source_id: null,
    observed_at: "2026-01-01T00:00:00.000Z",
    specificity_score: 1.0,
    source_priority: 1000,
    observation_source: "human",
    created_at: "2026-01-01T00:00:00.000Z",
    user_id: userId,
    ...overrides,
  };
}

describe("ObservationReducer highest_priority same-tier scalar ordering (#2394)", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-scalar-tiebreak-2394",
      entity_type: entityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: {
          notes: { type: "string", required: false },
          description: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          notes: { strategy: "highest_priority", tie_breaker: "source_priority" },
          description: { strategy: "highest_priority", tie_breaker: "source_priority" },
        },
      },
      active: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets the later same-priority correction win even when its id sorts after the older correction", async () => {
    const first = obs({
      id: "obs_000_first_sorts_first",
      observed_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      fields: { notes: "checkpoint one" },
    });
    const second = obs({
      id: "obs_zzz_second_sorts_last",
      observed_at: "2026-01-02T00:00:00.000Z",
      created_at: "2026-01-02T00:00:00.000Z",
      fields: { notes: "checkpoint two" },
    });

    const snapshot = await reducer.computeSnapshot(entityId, [second, first]);

    expect(snapshot!.snapshot.notes).toBe("checkpoint two");
    expect(snapshot!.provenance.notes).toBe("obs_zzz_second_sorts_last");
  });

  it("uses created_at as the deterministic same-timestamp fallback before id", async () => {
    const first = obs({
      id: "obs_000_first_sorts_first",
      observed_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      fields: { description: "old same observed_at" },
    });
    const second = obs({
      id: "obs_zzz_second_sorts_last",
      observed_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:01.000Z",
      fields: { description: "new same observed_at" },
    });

    const snapshot = await reducer.computeSnapshot(entityId, [first, second]);

    expect(snapshot!.snapshot.description).toBe("new same observed_at");
    expect(snapshot!.provenance.description).toBe("obs_zzz_second_sorts_last");
  });

  it("still lets higher numeric source_priority beat a newer lower-priority correction", async () => {
    const trusted = obs({
      id: "obs_trusted_priority",
      observed_at: "2026-01-01T00:00:00.000Z",
      source_priority: 1500,
      fields: { notes: "trusted higher priority" },
    });
    const laterLower = obs({
      id: "obs_later_lower_priority",
      observed_at: "2026-01-02T00:00:00.000Z",
      source_priority: 1000,
      fields: { notes: "later lower priority" },
    });

    const snapshot = await reducer.computeSnapshot(entityId, [laterLower, trusted]);

    expect(snapshot!.snapshot.notes).toBe("trusted higher priority");
    expect(snapshot!.provenance.notes).toBe("obs_trusted_priority");
  });

  it("still applies configured observation_source precedence before same-tier recency", async () => {
    const sensor = obs({
      id: "obs_sensor_older",
      observed_at: "2026-01-01T00:00:00.000Z",
      observation_source: "sensor",
      fields: { notes: "sensor value" },
    });
    const human = obs({
      id: "obs_human_newer",
      observed_at: "2026-01-02T00:00:00.000Z",
      observation_source: "human",
      fields: { notes: "human value" },
    });

    const snapshot = await reducer.computeSnapshot(entityId, [human, sensor]);

    expect(snapshot!.snapshot.notes).toBe("sensor value");
    expect(snapshot!.provenance.notes).toBe("obs_sensor_older");
  });
});
