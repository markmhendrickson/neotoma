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
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ObservationReducer, type Observation } from "../../src/reducers/observation_reducer.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { db } from "../../src/db.js";

describe("ObservationReducer - merge_array correction replacement (#1541)", () => {
  const reducer = new ObservationReducer();
  const testEntityId = "ent_test_merge_array_1541";
  const testEntityType = "merge_array_fixture_1541";
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeEach(async () => {
    await db.from("observations").delete().eq("entity_id", testEntityId);
    await db.from("entity_snapshots").delete().eq("entity_id", testEntityId);

    await schemaRegistry.register({
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
      activate: true,
    });
  });

  it(
    "replaces the array when a higher-priority correction is present (no union with old values)",
    async () => {
      const base: Observation = {
        id: "obs_base",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_base",
        observed_at: "2026-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: { items: ["a", "b", "c"] },
        created_at: "2026-01-01T00:00:00Z",
        user_id: testUserId,
      };
      const correction: Observation = {
        id: "obs_correction",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: null,
        observed_at: "2026-01-02T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 1000, // correction tier
        fields: { items: ["x", "y"] },
        created_at: "2026-01-02T00:00:00Z",
        user_id: testUserId,
      };

      const snapshot = await reducer.computeSnapshot(testEntityId, [base, correction]);
      const items = snapshot.snapshot.items as unknown[];

      // The correction fully replaces — old elements must NOT survive.
      expect(new Set(items)).toEqual(new Set(["x", "y"]));
      expect(items).not.toContain("a");
      expect(items).not.toContain("b");
      expect(items).not.toContain("c");
    }
  );

  it(
    "still unions arrays when all observations share the same (non-correction) priority",
    async () => {
      const obs1: Observation = {
        id: "obs_1",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_1",
        observed_at: "2026-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: { items: ["a", "b"] },
        created_at: "2026-01-01T00:00:00Z",
        user_id: testUserId,
      };
      const obs2: Observation = {
        id: "obs_2",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_2",
        observed_at: "2026-01-02T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: { items: ["b", "c"] },
        created_at: "2026-01-02T00:00:00Z",
        user_id: testUserId,
      };

      const snapshot = await reducer.computeSnapshot(testEntityId, [obs1, obs2]);
      const items = snapshot.snapshot.items as unknown[];

      // Same priority -> union (deduped) preserved.
      expect(new Set(items)).toEqual(new Set(["a", "b", "c"]));
    }
  );

  it(
    "a higher-priority correction supersedes an earlier malformed lower-priority write",
    async () => {
      // Simulates the original #1541 artifact: a lower-priority observation
      // left a stringified-array element; a higher-priority correction must
      // win and the malformed lower-priority element must be dropped by the
      // priority gate.
      const malformed: Observation = {
        id: "obs_malformed",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_malformed",
        observed_at: "2026-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: { items: ['["nested","stringified","array"]', "leftover"] },
        created_at: "2026-01-01T00:00:00Z",
        user_id: testUserId,
      };
      const cleanCorrection: Observation = {
        id: "obs_clean",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: null,
        observed_at: "2026-01-03T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 1000,
        fields: { items: ["one", "two", "three"] },
        created_at: "2026-01-03T00:00:00Z",
        user_id: testUserId,
      };

      const snapshot = await reducer.computeSnapshot(testEntityId, [malformed, cleanCorrection]);
      const items = snapshot.snapshot.items as unknown[];

      expect(new Set(items)).toEqual(new Set(["one", "two", "three"]));
      expect(items).not.toContain('["nested","stringified","array"]');
      expect(items).not.toContain("leftover");
    }
  );

  it(
    "unions two corrections at the SAME (top) priority tier",
    async () => {
      // Design intent: the gate excludes only LOWER-priority observations.
      // Two writes at the same max priority still union with each other.
      const corrA: Observation = {
        id: "obs_corr_a",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: null,
        observed_at: "2026-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 1000,
        fields: { items: ["p", "q"] },
        created_at: "2026-01-01T00:00:00Z",
        user_id: testUserId,
      };
      const corrB: Observation = {
        id: "obs_corr_b",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: null,
        observed_at: "2026-01-02T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 1000,
        fields: { items: ["q", "r"] },
        created_at: "2026-01-02T00:00:00Z",
        user_id: testUserId,
      };

      const snapshot = await reducer.computeSnapshot(testEntityId, [corrA, corrB]);
      const items = snapshot.snapshot.items as unknown[];

      expect(new Set(items)).toEqual(new Set(["p", "q", "r"]));
    }
  );

  it(
    "a top-priority null correction clears the array to [] (lower-priority arrays are gated out)",
    async () => {
      // After the priority gate, a strictly-higher-priority null correction
      // excludes the lower-priority array contributions; the only remaining
      // (top-priority) observation is the null one, which is skipped by the
      // inner null guard, so merge_array writes [] — consistent with §4.3 of
      // docs/subsystems/reducer.md.
      const base: Observation = {
        id: "obs_base_for_null",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_base",
        observed_at: "2026-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: { items: ["a", "b"] },
        created_at: "2026-01-01T00:00:00Z",
        user_id: testUserId,
      };
      const nullCorrection: Observation = {
        id: "obs_null_correction",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: null,
        observed_at: "2026-01-02T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 1000,
        fields: { items: null },
        created_at: "2026-01-02T00:00:00Z",
        user_id: testUserId,
      };

      const snapshot = await reducer.computeSnapshot(testEntityId, [base, nullCorrection]);

      // Snapshot value is an empty array (not the accumulated ["a","b"]).
      expect(snapshot.snapshot.items).toEqual([]);
    }
  );
});
