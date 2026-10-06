/**
 * Pins the reducer's own observation ordering as an exported function.
 *
 * `ObservationReducer.sortObservations` used to be private, so code that must
 * agree with the reducer about "which observation is first" (for example a
 * conditional write that compares against the entity's current winner) had no
 * way to call the reducer's comparator and could only copy it. The ordering is
 * now exported as `compareObservationsByReducerOrder` /
 * `sortObservationsInReducerOrder`, and the reducer itself calls them.
 *
 * The ordering is `observed_at` descending, then `id` ascending (locale
 * comparison). It is deliberately NOT `created_at`-aware, which is what
 * distinguishes it from the module-private recency comparator used for
 * deletion handling; the tests below fail if the two are conflated.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ObservationReducer,
  compareObservationsByReducerOrder,
  sortObservationsInReducerOrder,
  type Observation,
} from "../../src/reducers/observation_reducer.js";

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
  validateFieldWithConverters: vi.fn().mockImplementation((_field: string, value: unknown) => ({
    isValid: true,
    value,
    shouldRouteToRawFragments: false,
  })),
}));

import { schemaRegistry } from "../../src/services/schema_registry.js";

function makeObs(
  overrides: Partial<Observation> & { id: string; observed_at: string }
): Observation {
  return {
    entity_id: "ent_cmp",
    entity_type: "cmp_entity",
    schema_version: "1.0",
    source_id: "src_1",
    specificity_score: 1,
    source_priority: 100,
    fields: { name: overrides.id },
    created_at: overrides.observed_at,
    user_id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

const SCHEMA = {
  id: "schema-cmp",
  entity_type: "cmp_entity",
  schema_version: "1.0.0",
  schema_definition: {
    fields: { name: { type: "string" as const, required: true } },
    identity_opt_out: "heuristic_canonical_name",
  },
  reducer_config: { merge_policies: { name: { strategy: "last_write" as const } } },
  active: true,
};

/** Deterministic PRNG so the generated fixtures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("compareObservationsByReducerOrder", () => {
  it("orders by observed_at descending", () => {
    const older = makeObs({ id: "obs_a", observed_at: "2025-01-01T00:00:00Z" });
    const newer = makeObs({ id: "obs_b", observed_at: "2025-01-02T00:00:00Z" });
    expect(compareObservationsByReducerOrder(older, newer)).toBeGreaterThan(0);
    expect(compareObservationsByReducerOrder(newer, older)).toBeLessThan(0);
  });

  it("breaks an observed_at tie by id ascending, across equal-instant spellings", () => {
    const a = makeObs({ id: "obs_a", observed_at: "2025-01-01T00:00:00Z" });
    const b = makeObs({ id: "obs_b", observed_at: "2025-01-01T00:00:00.000Z" });
    expect(compareObservationsByReducerOrder(a, b)).toBeLessThan(0);
    expect(compareObservationsByReducerOrder(b, a)).toBeGreaterThan(0);
    expect(compareObservationsByReducerOrder(a, a)).toBe(0);
  });

  it("ignores created_at (it is not the recency-then-id comparator)", () => {
    // Same observed_at; `obs_z` was created later. A created_at-aware
    // comparator would rank it first. The reducer order ranks by id.
    const early = makeObs({
      id: "obs_a",
      observed_at: "2025-01-01T00:00:00Z",
      created_at: "2025-01-01T00:00:00Z",
    });
    const lateCreated = makeObs({
      id: "obs_z",
      observed_at: "2025-01-01T00:00:00Z",
      created_at: "2025-06-01T00:00:00Z",
    });
    expect(sortObservationsInReducerOrder([lateCreated, early]).map((o) => o.id)).toEqual([
      "obs_a",
      "obs_z",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      makeObs({ id: "obs_b", observed_at: "2025-01-01T00:00:00Z" }),
      makeObs({ id: "obs_a", observed_at: "2025-01-02T00:00:00Z" }),
    ];
    const before = input.map((o) => o.id);
    sortObservationsInReducerOrder(input);
    expect(input.map((o) => o.id)).toEqual(before);
  });
});

describe("the reducer and the exported comparator agree", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue(SCHEMA);
  });

  it("the reducer's own sort is exactly the exported sort, on generated tied input", () => {
    const rand = mulberry32(20261006);
    // Few distinct instants and ids drawn from a small alphabet force many
    // observed_at ties, so the id tie-break is exercised heavily.
    const instants = [
      "2025-03-01T00:00:00Z",
      "2025-03-01T00:00:00.000Z",
      "2025-03-02T12:30:00Z",
      "2025-03-03T00:00:00Z",
    ];
    const observations: Observation[] = [];
    for (let i = 0; i < 200; i++) {
      observations.push(
        makeObs({
          id: `obs_${Math.floor(rand() * 5000).toString(36)}_${i}`,
          observed_at: instants[Math.floor(rand() * instants.length)],
          created_at: new Date(Math.floor(rand() * 1e12)).toISOString(),
        })
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viaReducer = (reducer as any).sortObservations(observations) as Observation[];
    const viaExport = sortObservationsInReducerOrder(observations);
    expect(viaReducer.map((o) => o.id)).toEqual(viaExport.map((o) => o.id));
  });

  it("the last_write winner of computeSnapshot is the head of the exported order, for any input order", async () => {
    const rand = mulberry32(7);
    const base: Observation[] = [
      makeObs({ id: "obs_c", observed_at: "2025-02-01T00:00:00Z" }),
      makeObs({ id: "obs_a", observed_at: "2025-02-01T00:00:00Z" }),
      makeObs({ id: "obs_b", observed_at: "2025-02-01T00:00:00.000Z" }),
      makeObs({ id: "obs_old", observed_at: "2025-01-01T00:00:00Z" }),
    ];
    const expectedHead = sortObservationsInReducerOrder(base)[0];
    expect(expectedHead.id).toBe("obs_a");

    for (let round = 0; round < 12; round++) {
      const snap = await reducer.computeSnapshot("ent_cmp", shuffled(base, rand));
      expect(snap).not.toBeNull();
      expect(snap!.provenance.name).toBe(expectedHead.id);
      expect(snap!.snapshot.name).toBe(expectedHead.fields.name);
      expect(snap!.last_observation_at).toBe(expectedHead.observed_at);
    }
  });
});
