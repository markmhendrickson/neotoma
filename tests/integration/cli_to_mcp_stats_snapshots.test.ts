/**
 * Cross-Layer Integration Tests: CLI Stats/Snapshots Commands → Database
 *
 * Validates selected operational commands across CLI → REST → DB.
 */

import { describe, it, expect, afterEach } from "vitest";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity } from "../helpers/test_data_helpers.js";
import { execCliJson } from "../helpers/cross_layer_helpers.js";

const TEST_USER_ID = "test-cross-layer-stats-snapshots";

describe("Cross-layer: CLI stats/snapshots commands → Database", () => {
  const tracker = new TestIdTracker();

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("stats entities", () => {
    it("should return internally consistent entity totals", async () => {
      const result = await execCliJson("stats entities");
      expect(result).toHaveProperty("total_entities");
      expect(result).toHaveProperty("entities_by_type");

      const totalEntities = Number(result.total_entities ?? 0);
      const byType = (result.entities_by_type ?? {}) as Record<string, number>;
      const sumByType = Object.values(byType).reduce((sum, value) => sum + Number(value || 0), 0);

      expect(totalEntities).toBeGreaterThanOrEqual(0);
      expect(sumByType).toBe(totalEntities);
    });
  });

  describe("snapshots request", () => {
    it("should report recomputation request and preserve snapshot availability", async () => {
      const entityId = await createTestEntity({
        entity_type: "task",
        canonical_name: `Cross Layer Snapshot Task ${Date.now()}`,
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(entityId);

      const dryRunResult = await execCliJson("snapshots request --dry-run");
      expect(dryRunResult).toHaveProperty("requested");
      expect(dryRunResult.requested).toBe(true);
      expect(dryRunResult).toHaveProperty("auto_fix");
      expect(dryRunResult.auto_fix).toBe(false);

      const requestResult = await execCliJson("snapshots request");
      expect(requestResult).toHaveProperty("requested");
      expect(requestResult.requested).toBe(true);
      expect(requestResult).toHaveProperty("auto_fix");
      expect(requestResult.auto_fix).toBe(true);

      const { db } = await import("../../src/db.js");
      const { data: snapshot, error } = await db
        .from("entity_snapshots")
        .select("entity_id")
        .eq("entity_id", entityId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(snapshot?.entity_id).toBe(entityId);
    });
  });
});
