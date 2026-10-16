/**
 * "Corrections always win" must hold on every field, whatever the field's
 * declared merge rule (issue #2033).
 *
 * A correction (the row `createCorrection` writes: no source, no
 * interpretation, no `observation_source`, priority 1000, specificity 1.0) is
 * authoritative until a LATER CORRECTION for the same field replaces it. An
 * ordinary write that arrives afterwards, with a newer `observed_at` or a
 * higher `source_priority` or both, must not displace it, under
 * `last_write` (the default for every auto-discovered field), `most_specific`,
 * `highest_priority`, `merge_array` and `merge_array_by_key` alike, and
 * whatever `source_priority` (including 5000) or ranked `observation_source`
 * the other write carries. Arrays still combine among corrections themselves
 * until #2341.
 *
 * Determinism: the reduction is a pure function of the stored observation
 * set. The permutation tests below feed every ordering of the same set and
 * require one identical snapshot and provenance.
 *
 * Hermetic: mocks `schemaRegistry.loadActiveSchema` (no database), the same way
 * tests/unit/observation_reducer_highest_priority_tiebreak.test.ts does. The
 * observation shapes used here are what the real write paths store; the
 * integration suite (tests/integration/correction_wins_every_field.test.ts)
 * pins them against real rows.
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

const entityId = "ent_test_corrections_win";
const entityType = "corrections_win_fixture";
const userId = "00000000-0000-0000-0000-000000000000";

type ObsInput = Partial<Observation> & { id: string; fields: Record<string, unknown> };

/** An ordinary write: it has a source and a declared kind, as every public write path stamps. */
function ordinary(input: ObsInput): Observation {
  return {
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0",
    source_id: "src_ordinary",
    observed_at: "2026-01-01T00:00:00.000Z",
    specificity_score: 1.0,
    source_priority: 100,
    observation_source: "import",
    created_at: "2026-01-01T00:00:00.000Z",
    user_id: userId,
    ...input,
  } as Observation;
}

/** The row `createCorrection` stores. */
function correction(input: ObsInput): Observation {
  return {
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0",
    source_id: null,
    interpretation_id: null,
    observed_at: "2026-01-01T00:00:00.000Z",
    specificity_score: 1.0,
    source_priority: 1000,
    observation_source: null,
    created_at: "2026-01-01T00:00:00.000Z",
    user_id: userId,
    ...input,
  } as unknown as Observation;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ])
  );
}

describe("ObservationReducer: a correction wins on every field until a later correction replaces it (#2033)", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-corrections-win",
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          lw: { type: "string", required: false },
          hp: { type: "string", required: false },
          ms: { type: "string", required: false },
          ma: { type: "array", required: false },
          mk: { type: "array", required: false },
          undeclared_policy: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          lw: { strategy: "last_write" },
          hp: { strategy: "highest_priority", tie_breaker: "source_priority" },
          ms: { strategy: "most_specific", tie_breaker: "observed_at" },
          ma: { strategy: "merge_array" },
          mk: { strategy: "merge_array_by_key", key_field: "k" },
          // `undeclared_policy` has no policy: the reducer defaults it to last_write.
        },
      },
      active: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("last_write", () => {
    it("keeps a correction when a later ordinary write arrives", async () => {
      const original = ordinary({
        id: "obs_1_original",
        observed_at: "2026-01-01T00:00:00.000Z",
        fields: { lw: "A" },
      });
      const fix = correction({
        id: "obs_2_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { lw: "B" },
      });
      const reingest = ordinary({
        id: "obs_3_reingest",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { lw: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [original, fix, reingest]);

      expect(snapshot!.snapshot.lw).toBe("B");
      expect(snapshot!.provenance.lw).toBe("obs_2_correction");
    });

    it("keeps a correction against a later ordinary write at a higher source_priority", async () => {
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { lw: "B" },
      });
      const later = ordinary({
        id: "obs_later_high_priority",
        observed_at: "2026-01-03T00:00:00.000Z",
        source_priority: 5000,
        observation_source: "human",
        fields: { lw: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [fix, later]);

      expect(snapshot!.snapshot.lw).toBe("B");
    });

    it("lets a later correction replace an earlier one, whatever ordinary writes sit between them", async () => {
      const first = correction({
        id: "obs_zzz_first_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.000Z",
        fields: { lw: "B" },
      });
      const between = ordinary({
        id: "obs_between",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { lw: "A" },
      });
      const second = correction({
        id: "obs_aaa_second_correction",
        observed_at: "2026-01-04T00:00:00.000Z",
        created_at: "2026-01-04T00:00:00.000Z",
        fields: { lw: "C" },
      });
      const after = ordinary({
        id: "obs_after",
        observed_at: "2026-01-05T00:00:00.000Z",
        fields: { lw: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [first, between, second, after]);

      expect(snapshot!.snapshot.lw).toBe("C");
      expect(snapshot!.provenance.lw).toBe("obs_aaa_second_correction");
    });

    it("breaks a same-observed_at tie between corrections on created_at, then id", async () => {
      const a = correction({
        id: "obs_000_older_insert",
        observed_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.001Z",
        fields: { lw: "first" },
      });
      const b = correction({
        id: "obs_zzz_newer_insert",
        observed_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.002Z",
        fields: { lw: "second" },
      });

      for (const order of [
        [a, b],
        [b, a],
      ]) {
        const snapshot = await reducer.computeSnapshot(entityId, order);
        expect(snapshot!.snapshot.lw).toBe("second");
      }
    });

    it("honours a correction to null: a later ordinary write does not revive the field", async () => {
      const original = ordinary({ id: "obs_1", fields: { lw: "A" } });
      const clear = correction({
        id: "obs_2_clear",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { lw: null },
      });
      const reingest = ordinary({
        id: "obs_3",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { lw: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [original, clear, reingest]);

      expect(snapshot!.snapshot).not.toHaveProperty("lw");
    });

    it("applies to a field with no declared policy, which defaults to last_write", async () => {
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { undeclared_policy: "B" },
      });
      const later = ordinary({
        id: "obs_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { undeclared_policy: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [fix, later]);

      expect(snapshot!.snapshot.undeclared_policy).toBe("B");
    });

    it("applies when the entity type has no schema and the reducer falls back to defaults", async () => {
      (schemaRegistry.loadActiveSchema as any).mockResolvedValue(null);
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { lw: "B" },
      });
      const later = ordinary({
        id: "obs_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { lw: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [later, fix]);

      expect(snapshot!.snapshot.lw).toBe("B");
    });
  });

  describe("highest_priority", () => {
    it("is unchanged where it already held: a correction beats a lower-priority write, and the later of two corrections wins", async () => {
      const lower = ordinary({
        id: "obs_lower",
        observed_at: "2026-01-04T00:00:00.000Z",
        source_priority: 100,
        fields: { hp: "lower" },
      });
      const first = correction({
        id: "obs_first",
        observed_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        fields: { hp: "first" },
      });
      const second = correction({
        id: "obs_second",
        observed_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.000Z",
        fields: { hp: "second" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [lower, first, second]);

      expect(snapshot!.snapshot.hp).toBe("second");
      expect(snapshot!.provenance.hp).toBe("obs_second");
    });

    it("keeps a correction against a later ordinary write, as it always did, because 1000 outranks the default 100", async () => {
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { hp: "B" },
      });
      const later = ordinary({
        id: "obs_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        source_priority: 100,
        fields: { hp: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [fix, later]);

      expect(snapshot!.snapshot.hp).toBe("B");
    });

    // This replaces a case that pinned the opposite for a write at 1500
    // (tests/integration/correction_scalar_tiebreak_surfaces.test.ts, #2394).
    // That ordering was an undecided by-product of the priority comparator,
    // not a ruling; the rule is now that a correction wins on every strategy.
    it.each([
      ["a write at priority 1500", { source_priority: 1500 }],
      ["a write at priority 5000", { source_priority: 5000 }],
      [
        "a write at exactly 1000 whose declared source kind outranks a correction",
        { source_priority: 1000, observation_source: "human" as const },
      ],
    ])("loses %s to a correction, however recent", async (_label, overrides) => {
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { hp: "B" },
      });
      const explicit = ordinary({
        id: "obs_explicit",
        observed_at: "2026-01-03T00:00:00.000Z",
        ...overrides,
        fields: { hp: "A" },
      });

      for (const order of [
        [fix, explicit],
        [explicit, fix],
      ]) {
        const snapshot = await reducer.computeSnapshot(entityId, order);
        expect(snapshot!.snapshot.hp).toBe("B");
        expect(snapshot!.provenance.hp).toBe("obs_correction");
      }
    });

    it("still lets a later correction replace an earlier one when a high-priority write sits between", async () => {
      const first = correction({
        id: "obs_first",
        observed_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        fields: { hp: "first" },
      });
      const between = ordinary({
        id: "obs_between_5000",
        observed_at: "2026-01-02T00:00:00.000Z",
        source_priority: 5000,
        fields: { hp: "assertive" },
      });
      const second = correction({
        id: "obs_second",
        observed_at: "2026-01-03T00:00:00.000Z",
        created_at: "2026-01-03T00:00:00.000Z",
        fields: { hp: "second" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [between, first, second]);

      expect(snapshot!.snapshot.hp).toBe("second");
    });
  });

  describe("most_specific", () => {
    it("keeps a correction against a later write of equal specificity", async () => {
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { ms: "B" },
      });
      const later = ordinary({
        id: "obs_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        specificity_score: 1.0,
        fields: { ms: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [fix, later]);

      expect(snapshot!.snapshot.ms).toBe("B");
    });
  });

  describe("merge_array and merge_array_by_key", () => {
    it.each([
      ["a write at priority 5000", { source_priority: 5000 }],
      [
        "a write at exactly 1000 whose declared source kind outranks a correction",
        { source_priority: 1000, observation_source: "human" as const },
      ],
    ])("%s neither replaces nor unions into a correction's array", async (_label, overrides) => {
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { ma: ["z"], mk: [{ k: "row", v: "corrected" }] },
      });
      const explicit = ordinary({
        id: "obs_explicit",
        observed_at: "2026-01-03T00:00:00.000Z",
        ...overrides,
        fields: {
          ma: ["w"],
          mk: [
            { k: "row", v: "other" },
            { k: "extra", v: "x" },
          ],
        },
      });

      for (const order of [
        [fix, explicit],
        [explicit, fix],
      ]) {
        const snapshot = await reducer.computeSnapshot(entityId, order);
        expect(snapshot!.snapshot.ma).toEqual(["z"]);
        expect(snapshot!.snapshot.mk).toEqual([{ k: "row", v: "corrected" }]);
      }
    });

    it("still combines two corrections at the same tier (until #2341 changes array replacement)", async () => {
      const first = correction({
        id: "obs_first",
        observed_at: "2026-01-01T00:00:00.000Z",
        fields: { ma: ["a"] },
      });
      const second = correction({
        id: "obs_second",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { ma: ["b"] },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [first, second]);

      expect([...(snapshot!.snapshot.ma as string[])].sort()).toEqual(["a", "b"]);
    });

    it("keeps a correction's array replacing a lower-priority array, as it always did", async () => {
      const original = ordinary({ id: "obs_1", fields: { ma: ["x", "y"] } });
      const fix = correction({
        id: "obs_2_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        fields: { ma: ["z"] },
      });
      const later = ordinary({
        id: "obs_3_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { ma: ["w"] },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [original, fix, later]);

      expect(snapshot!.snapshot.ma).toEqual(["z"]);
    });
  });

  describe("what is not a correction", () => {
    it("treats a priority-1000 write that carries a source as ordinary", async () => {
      const original = ordinary({ id: "obs_1", fields: { lw: "A" } });
      const lookalike = ordinary({
        id: "obs_2_lookalike",
        observed_at: "2026-01-02T00:00:00.000Z",
        source_priority: 1000,
        source_id: "src_real",
        fields: { lw: "forged" },
      });
      const later = ordinary({
        id: "obs_3_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { lw: "latest" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [original, lookalike, later]);

      expect(snapshot!.snapshot.lw).toBe("latest");
    });

    it("treats a priority-1000 write that declares an observation_source as ordinary", async () => {
      const lookalike = correction({
        id: "obs_lookalike",
        observed_at: "2026-01-02T00:00:00.000Z",
        observation_source: "human",
        fields: { lw: "declared human" },
      });
      const later = ordinary({
        id: "obs_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { lw: "latest" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [lookalike, later]);

      expect(snapshot!.snapshot.lw).toBe("latest");
    });

    it("still reads a correction when a loader flattens its null source to an empty string", async () => {
      const fix = correction({
        id: "obs_correction",
        observed_at: "2026-01-02T00:00:00.000Z",
        source_id: "" as unknown as null,
        interpretation_id: undefined,
        observation_source: undefined,
        fields: { lw: "B" },
      } as ObsInput);
      const later = ordinary({
        id: "obs_later",
        observed_at: "2026-01-03T00:00:00.000Z",
        fields: { lw: "A" },
      });

      const snapshot = await reducer.computeSnapshot(entityId, [fix, later]);

      expect(snapshot!.snapshot.lw).toBe("B");
    });
  });

  describe("determinism", () => {
    it("reduces every arrival order of the same observation set to the same snapshot", async () => {
      const set: Observation[] = [
        ordinary({
          id: "obs_a_original",
          observed_at: "2026-01-01T00:00:00.000Z",
          fields: { lw: "A", hp: "A", ms: "A", ma: ["a"] },
        }),
        correction({
          id: "obs_b_correction_one",
          observed_at: "2026-01-02T00:00:00.000Z",
          created_at: "2026-01-02T00:00:00.000Z",
          fields: { lw: "B" },
        }),
        ordinary({
          id: "obs_c_reingest",
          observed_at: "2026-01-03T00:00:00.000Z",
          fields: { lw: "A", hp: "A", ms: "A", ma: ["c"] },
        }),
        correction({
          id: "obs_d_correction_two",
          observed_at: "2026-01-04T00:00:00.000Z",
          created_at: "2026-01-04T00:00:00.000Z",
          fields: { lw: "D", hp: "D", ms: "D", ma: ["d"], mk: [{ k: "row", v: "D" }] },
        }),
        ordinary({
          id: "obs_e_latest_ordinary",
          observed_at: "2026-01-05T00:00:00.000Z",
          fields: { lw: "E", hp: "E", ms: "E", ma: ["e"], mk: [{ k: "row", v: "E" }] },
        }),
        ordinary({
          id: "obs_f_priority_5000",
          observed_at: "2026-01-06T00:00:00.000Z",
          source_priority: 5000,
          fields: { lw: "F", hp: "F", ms: "F", ma: ["f"], mk: [{ k: "row", v: "F" }] },
        }),
        ordinary({
          id: "obs_g_ranked_source_at_1000",
          observed_at: "2026-01-07T00:00:00.000Z",
          source_priority: 1000,
          observation_source: "human",
          fields: { lw: "G", hp: "G", ms: "G", ma: ["g"], mk: [{ k: "row", v: "G" }] },
        }),
      ];

      const outcomes = new Set<string>();
      for (const order of permutations(set)) {
        const snapshot = await reducer.computeSnapshot(entityId, order);
        outcomes.add(JSON.stringify({ s: snapshot!.snapshot, p: snapshot!.provenance }));
      }

      expect(outcomes.size).toBe(1);
      const only = JSON.parse([...outcomes][0]);
      expect(permutations(set)).toHaveLength(5040);
      expect(only.s).toMatchObject({
        lw: "D",
        hp: "D",
        ms: "D",
        ma: ["d"],
        mk: [{ k: "row", v: "D" }],
      });
    });
  });
});
