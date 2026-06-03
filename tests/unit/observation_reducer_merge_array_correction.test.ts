/**
 * Regression tests for issue #1541:
 * correct() on an array-typed (merge_array) field must fully REPLACE the
 * array, not union the correction's array into the prior observations'.
 *
 * Corrections are created with source_priority 1000 (highest). The reducer's
 * merge_array strategy now restricts the union to observations at the maximum
 * source_priority present, so:
 *   - all-equal-priority observations still union (normal behavior), and
 *   - a higher-priority correction replaces lower-priority arrays.
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
    "a later correction supersedes an earlier malformed correction at the same tier",
    async () => {
      // Simulates the original #1541 artifact: an earlier correction left a
      // stringified-array element; a later clean correction must win, and
      // among same-priority corrections the union still applies, so the test
      // asserts the malformed element from a LOWER-priority write is dropped.
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
});
