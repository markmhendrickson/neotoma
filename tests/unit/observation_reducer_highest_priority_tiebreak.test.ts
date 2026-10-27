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

  it("uses id ASC only after both timestamps tie and is stable across input order", async () => {
    const firstById = obs({
      id: "obs_000_wins_final_tie",
      fields: { notes: "stable winner" },
    });
    const secondById = obs({
      id: "obs_zzz_loses_final_tie",
      fields: { notes: "stable loser" },
    });

    for (const observations of [
      [firstById, secondById],
      [secondById, firstById],
    ]) {
      const snapshot = await reducer.computeSnapshot(entityId, observations);
      expect(snapshot!.snapshot.notes).toBe("stable winner");
      expect(snapshot!.provenance.notes).toBe("obs_000_wins_final_tie");
    }
  });

  it("falls through malformed timestamps deterministically instead of returning NaN", async () => {
    const older = obs({
      id: "obs_000_older_created",
      observed_at: "not-a-date",
      created_at: "2026-01-01T00:00:00.000Z",
      fields: { description: "older" },
    });
    const newer = obs({
      id: "obs_zzz_newer_created",
      observed_at: "also-not-a-date",
      created_at: "2026-01-02T00:00:00.000Z",
      fields: { description: "newer" },
    });

    for (const observations of [
      [older, newer],
      [newer, older],
    ]) {
      const snapshot = await reducer.computeSnapshot(entityId, observations);
      expect(snapshot!.snapshot.description).toBe("newer");
      expect(snapshot!.provenance.description).toBe("obs_zzz_newer_created");
    }
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

describe("invoice example: explicit priority versus default recency", () => {
  for (const strategy of ["last_write", "highest_priority"] as const) {
    it(`${strategy} keeps its declared winner when a later unsupported date disagrees`, async () => {
      vi.mocked(schemaRegistry.loadActiveSchema).mockResolvedValue({
        id: "invoice-policy-fixture",
        entity_type: entityType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            date_due: { type: "date", required: false },
            amount_due: { type: "number", required: false },
          },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: {
          merge_policies: { date_due: { strategy }, amount_due: { strategy: "last_write" } },
        },
        active: true,
      } as Awaited<ReturnType<typeof schemaRegistry.loadActiveSchema>>);
      const pdf = obs({
        id: "obs_invoice_pdf",
        source_priority: 100,
        observation_source: "import",
        fields: { date_due: "2026-10-22", amount_due: 3200 },
        observed_at: "2026-10-01T00:00:00Z",
      });
      const email = obs({
        id: "obs_vendor_email",
        source_priority: 200,
        observation_source: "import",
        fields: { date_due: "2026-10-29" },
        observed_at: "2026-10-02T00:00:00Z",
      });
      const unsupported = obs({
        id: "obs_unsupported_claim",
        source_priority: 50,
        observation_source: "llm_summary",
        fields: { date_due: "2026-11-05" },
        observed_at: "2026-10-03T00:00:00Z",
      });
      const observations = [unsupported, pdf, email];
      const original = JSON.stringify(observations);
      const snapshot = await new ObservationReducer().computeSnapshot(entityId, observations);
      expect(snapshot!.snapshot.date_due).toBe(
        strategy === "highest_priority" ? "2026-10-29" : "2026-11-05"
      );
      expect(snapshot!.provenance.date_due).toBe(
        strategy === "highest_priority" ? email.id : unsupported.id
      );
      expect(snapshot!.snapshot.amount_due).toBe(3200);
      expect(snapshot!.provenance.amount_due).toBe(pdf.id);
      expect(JSON.stringify(observations)).toBe(original);
    });
  }
});
