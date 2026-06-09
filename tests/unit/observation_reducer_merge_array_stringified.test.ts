/**
 * Regression tests for issue #1595:
 * a merge_array field may receive a JSON-array-shaped *string* (e.g. '["a","b"]')
 * from a transport/client that stringified the array. The reducer must recover
 * it into real elements rather than adding the whole blob as one literal-string
 * element. A non-JSON string stays a literal element.
 *
 * Hermetic: mocks schemaRegistry.loadActiveSchema (no DB), consistent with
 * tests/unit/observation_reducer_projection.test.ts.
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
  schemaRegistry: { loadActiveSchema: vi.fn() },
}));

vi.mock("../../src/services/schema_definitions.js", () => ({
  getSchemaDefinition: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/services/field_validation.js", () => ({
  validateFieldWithConverters: vi.fn().mockImplementation(
    (_field: string, value: unknown) => ({
      isValid: true,
      value,
      shouldRouteToRawFragments: false,
    }),
  ),
}));

import { schemaRegistry } from "../../src/services/schema_registry.js";

const entityId = "ent_test_merge_array_1595";
const entityType = "merge_array_fixture_1595";
const userId = "00000000-0000-0000-0000-000000000000";

function makeObs(
  overrides: Partial<Observation> & { fields: Record<string, unknown> },
): Observation {
  return {
    id: "obs_default",
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0.0",
    source_id: "src_default",
    observed_at: "2026-01-01T00:00:00Z",
    specificity_score: 1.0,
    source_priority: 1000,
    created_at: "2026-01-01T00:00:00Z",
    user_id: userId,
    ...overrides,
  };
}

describe("ObservationReducer - merge_array stringified-array recovery (#1595)", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-1595",
      entity_type: entityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: { items: { type: "array", required: false } },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: { merge_policies: { items: { strategy: "merge_array" } } },
      active: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recovers a JSON-array-shaped string into real elements (not one literal blob)", async () => {
    const obs = makeObs({
      id: "obs_stringified",
      fields: { items: '["a","b","c"]' },
    });

    const snapshot = await reducer.computeSnapshot(entityId, [obs]);
    const items = snapshot!.snapshot.items as unknown[];

    expect(new Set(items)).toEqual(new Set(["a", "b", "c"]));
    expect(items).not.toContain('["a","b","c"]');
  });

  it("keeps a genuine non-JSON string as a single literal element", async () => {
    const obs = makeObs({
      id: "obs_plain",
      fields: { items: "just a normal control string" },
    });

    const snapshot = await reducer.computeSnapshot(entityId, [obs]);
    const items = snapshot!.snapshot.items as unknown[];

    expect(items).toEqual(["just a normal control string"]);
  });

  it("still handles a real array normally (no regression)", async () => {
    const obs = makeObs({
      id: "obs_real",
      fields: { items: ["x", "y"] },
    });

    const snapshot = await reducer.computeSnapshot(entityId, [obs]);
    const items = snapshot!.snapshot.items as unknown[];

    expect(new Set(items)).toEqual(new Set(["x", "y"]));
  });
});
