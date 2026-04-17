/**
 * Regression test for per-field provenance on snapshots built from multiple
 * observations (including correction observations).
 *
 * The audit flagged cases where the snapshot's `provenance` map did not
 * reflect the observation that actually produced each field value — so
 * downstream consumers could not trace which source owned which field. The
 * reducer must:
 *
 *   1. Emit one provenance entry per field present in the snapshot.
 *   2. Point each entry at the `id` of the observation whose value won the
 *      merge strategy for that field.
 *   3. Update the entry when a later observation (e.g. a `/correct` call)
 *      overrides the field — the provenance must move with the new winner.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ObservationReducer,
  type Observation,
} from "../../src/reducers/observation_reducer.js";

vi.mock("../../src/services/schema_registry.js", () => ({
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

const TEST_SCHEMA = {
  id: "schema-1",
  entity_type: "test_entity",
  schema_version: "1.0.0",
  schema_definition: {
    fields: {
      name: { type: "string" as const, required: true },
      amount: { type: "number" as const, required: false },
      status: { type: "string" as const, required: false },
    },
  },
  reducer_config: {
    merge_policies: {
      name: { strategy: "last_write" as const },
      amount: { strategy: "last_write" as const },
      status: { strategy: "last_write" as const },
    },
  },
  active: true,
};

describe("ObservationReducer - provenance", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue(TEST_SCHEMA);
  });

  it("emits one provenance entry per field in the snapshot", async () => {
    const obs: Observation[] = [
      makeObs({
        id: "obs_a",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { name: "Alice", amount: 10 },
      }),
    ];
    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(Object.keys(snap!.provenance).sort()).toEqual(["amount", "name"]);
    expect(snap!.provenance.name).toBe("obs_a");
    expect(snap!.provenance.amount).toBe("obs_a");
  });

  it("per-field provenance points to the observation that won each field", async () => {
    // obs_a is older; obs_b is newer and only carries `amount`. With
    // last_write strategy, `name` should stay from obs_a and `amount`
    // should switch to obs_b.
    const obs: Observation[] = [
      makeObs({
        id: "obs_a",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { name: "Alice", amount: 10 },
      }),
      makeObs({
        id: "obs_b",
        observed_at: "2025-01-02T00:00:00Z",
        fields: { amount: 99 },
      }),
    ];
    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(snap!.snapshot.name).toBe("Alice");
    expect(snap!.snapshot.amount).toBe(99);
    expect(snap!.provenance.name).toBe("obs_a");
    expect(snap!.provenance.amount).toBe("obs_b");
  });

  it("provenance follows a correction observation to the new winner", async () => {
    // obs_a sets status=active; obs_correction (later, same entity) sets
    // status=archived. Provenance must point at the correction, not the
    // original.
    const obs: Observation[] = [
      makeObs({
        id: "obs_a",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { name: "Alice", status: "active" },
      }),
      makeObs({
        id: "obs_correction",
        observed_at: "2025-02-01T00:00:00Z",
        fields: { status: "archived" },
      }),
    ];
    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(snap!.snapshot.status).toBe("archived");
    expect(snap!.provenance.status).toBe("obs_correction");
    // name was never re-observed, so its provenance stays on obs_a
    expect(snap!.provenance.name).toBe("obs_a");
  });

  it("does not surface provenance for fields removed from the schema", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      ...TEST_SCHEMA,
      schema_definition: {
        fields: { name: { type: "string" as const, required: true } },
      },
      reducer_config: {
        merge_policies: { name: { strategy: "last_write" as const } },
      },
    });

    const obs: Observation[] = [
      makeObs({
        id: "obs_a",
        observed_at: "2025-01-01T00:00:00Z",
        fields: { name: "Alice", amount: 10, status: "active" },
      }),
    ];
    const snap = await reducer.computeSnapshot("ent_test", obs);
    expect(snap).not.toBeNull();
    expect(Object.keys(snap!.provenance)).toEqual(["name"]);
    expect(Object.keys(snap!.snapshot)).toEqual(["name"]);
  });
});
