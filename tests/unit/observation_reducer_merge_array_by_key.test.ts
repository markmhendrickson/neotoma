/**
 * Unit tests for the `merge_array_by_key` reducer strategy (Waxwing ADR,
 * ent_4b41bb83a4faf4428a73bfc8 — "Prevent lost updates when concurrent
 * sessions refresh session_digest workboards").
 *
 * `merge_array_by_key` is a sibling of `merge_array` (see
 * observation_reducer_merge_array_correction.test.ts for that strategy's
 * priority-gating coverage, which this strategy preserves unchanged) that
 * additionally reconciles items WITHIN the top-priority tier by a declared
 * `key_field` instead of Set-union: distinct keys all survive, and same-key
 * items resolve by latest observed_at.
 *
 * Hermetic: mocks schemaRegistry.loadActiveSchema (no DB), consistent with
 * observation_reducer_merge_array_correction.test.ts.
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

const testEntityId = "ent_test_merge_array_by_key";
const testEntityType = "session_digest_fixture";
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

describe("ObservationReducer - merge_array_by_key", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-merge-array-by-key",
      entity_type: testEntityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: {
          tasks_claimed: { type: "array", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          tasks_claimed: { strategy: "merge_array_by_key", key_field: "claim_id" },
        },
      },
      active: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves concurrent disjoint-key writes at the same priority tier (the reported bug)", async () => {
    // This is the literal reproduction: writer A patches row "pr-1320", writer
    // B (concurrently) patches a distinct row "vocab-review". A naive
    // full-array-replace at equal priority would still union under
    // merge_array's Set semantics only because the two rows are objects
    // (never equal), but a REAL full-array-replace CALLER (not the reducer)
    // that read stale state and wrote back its own full array would drop the
    // other row before the reducer ever saw it. This test locks the reducer's
    // half of the contract: distinct keys within the top-priority tier always
    // both survive, regardless of which observation carried them.
    const writerA = makeObs({
      id: "obs_writer_a",
      observed_at: "2026-09-27T10:00:00Z",
      source_priority: 100,
      fields: {
        tasks_claimed: [{ claim_id: "pr-1320", claim: "review PR #1320", status: "in_review" }],
      },
    });
    const writerB = makeObs({
      id: "obs_writer_b",
      source_id: "src_writer_b",
      observed_at: "2026-09-27T10:05:00Z",
      source_priority: 100,
      fields: {
        tasks_claimed: [
          { claim_id: "vocab-review", claim: "vocabulary review", status: "in_progress" },
        ],
      },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [writerA, writerB]);
    const rows = snapshot!.snapshot.tasks_claimed as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(2);
    const byId = Object.fromEntries(rows.map((r) => [r.claim_id, r]));
    expect(byId["pr-1320"]).toMatchObject({ status: "in_review" });
    expect(byId["vocab-review"]).toMatchObject({ status: "in_progress" });
  });

  it("resolves a same-key race by latest observed_at (last write wins on that row only)", async () => {
    const earlier = makeObs({
      id: "obs_earlier",
      observed_at: "2026-09-27T10:00:00Z",
      source_priority: 100,
      fields: {
        tasks_claimed: [{ claim_id: "pr-1320", status: "in_review" }],
      },
    });
    const later = makeObs({
      id: "obs_later",
      source_id: "src_later",
      observed_at: "2026-09-27T10:10:00Z",
      source_priority: 100,
      fields: {
        tasks_claimed: [{ claim_id: "pr-1320", status: "merged" }],
      },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [earlier, later]);
    const rows = snapshot!.snapshot.tasks_claimed as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ claim_id: "pr-1320", status: "merged" });
  });

  it("uses ascending observation id as the deterministic same-timestamp tie-break", async () => {
    const higherId = makeObs({
      id: "obs_z",
      observed_at: "2026-09-27T10:00:00Z",
      source_priority: 100,
      fields: { tasks_claimed: [{ claim_id: "row", status: "higher-id" }] },
    });
    const lowerId = makeObs({
      id: "obs_a",
      source_id: "src_a",
      observed_at: "2026-09-27T10:00:00Z",
      source_priority: 100,
      fields: { tasks_claimed: [{ claim_id: "row", status: "lower-id" }] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [higherId, lowerId]);
    const rows = snapshot!.snapshot.tasks_claimed as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ claim_id: "row", status: "lower-id" }]);
  });

  it("preserves correction priority-gating per key (a top-priority correction replaces lower-priority rows)", async () => {
    const base = makeObs({
      id: "obs_base",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: {
        tasks_claimed: [
          { claim_id: "row-a", status: "stale" },
          { claim_id: "row-b", status: "stale" },
        ],
      },
    });
    const correction = makeObs({
      id: "obs_correction",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: {
        tasks_claimed: [{ claim_id: "row-a", status: "corrected" }],
      },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [base, correction]);
    const rows = snapshot!.snapshot.tasks_claimed as Array<Record<string, unknown>>;

    // Priority gate excludes the lower-priority tier entirely (matches
    // merge_array's #1541 semantics) — only the correction's row survives.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ claim_id: "row-a", status: "corrected" });
  });

  it("two corrections at the SAME top priority still reconcile by key (disjoint rows both survive)", async () => {
    const corrA = makeObs({
      id: "obs_corr_a",
      source_id: null,
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 1000,
      fields: { tasks_claimed: [{ claim_id: "row-a", status: "done" }] },
    });
    const corrB = makeObs({
      id: "obs_corr_b",
      source_id: null,
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 1000,
      fields: { tasks_claimed: [{ claim_id: "row-b", status: "done" }] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [corrA, corrB]);
    const rows = snapshot!.snapshot.tasks_claimed as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.claim_id).sort();
    expect(ids).toEqual(["row-a", "row-b"]);
  });

  it("falls back to Set-union (mergeArray) behavior when key_field is missing from the policy", async () => {
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-missing-key-field",
      entity_type: testEntityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: { tasks_claimed: { type: "array", required: false } },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        // Misconfigured: merge_array_by_key without key_field.
        merge_policies: { tasks_claimed: { strategy: "merge_array_by_key" } },
      },
      active: true,
    });

    const obs1 = makeObs({
      id: "obs_1",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: { tasks_claimed: ["a", "b"] },
    });
    const obs2 = makeObs({
      id: "obs_2",
      source_id: "src_2",
      observed_at: "2026-01-02T00:00:00Z",
      source_priority: 100,
      fields: { tasks_claimed: ["b", "c"] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [obs1, obs2]);
    const items = snapshot!.snapshot.tasks_claimed as unknown[];

    expect(new Set(items)).toEqual(new Set(["a", "b", "c"]));
  });

  it("carries through an item missing the key field unkeyed, rather than dropping it", async () => {
    const obs = makeObs({
      id: "obs_malformed_item",
      observed_at: "2026-01-01T00:00:00Z",
      source_priority: 100,
      fields: {
        tasks_claimed: [{ claim_id: "row-a", status: "ok" }, { status: "no_claim_id" }],
      },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [obs]);
    const rows = snapshot!.snapshot.tasks_claimed as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.status === "no_claim_id")).toBe(true);
  });

  it("deduplicates identical unkeyed historical items across observations", async () => {
    const item = { status: "legacy-unkeyed" };
    const first = makeObs({
      id: "obs_unkeyed_1",
      observed_at: "2026-01-01T00:00:00Z",
      fields: { tasks_claimed: [item] },
    });
    const second = makeObs({
      id: "obs_unkeyed_2",
      source_id: "src_unkeyed_2",
      observed_at: "2026-01-02T00:00:00Z",
      fields: { tasks_claimed: [item] },
    });

    const snapshot = await reducer.computeSnapshot(testEntityId, [first, second]);
    expect(snapshot!.snapshot.tasks_claimed).toEqual([item]);
  });
});
