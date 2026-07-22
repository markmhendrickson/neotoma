/**
 * #1967: field-level aggregation over snapshot fields.
 *
 * The central claim under test is the PERFORMANCE one: aggregation is a SQL
 * GROUP BY, not an app-side scan. `execution.strategy` and
 * `execution.scanned_rows` are asserted alongside the counts so a future
 * refactor that quietly reintroduces a scan fails here rather than in
 * production (#1943 / #1945).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../db.js";
import {
  aggregateEntityField,
  DEFAULT_BUCKET_LIMIT,
  MAX_BUCKET_LIMIT,
} from "../entity_aggregation.js";

const userId = "agg-test-user";
const entityType = "agg_contact";

/** Deterministic bucket plan: Acme×5, Globex×3, Initech×2, missing org×2. */
const FIXTURES: Array<{ id: string; organization?: string; status: string }> = [
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ent_agg_acme_${i}`,
    organization: "Acme",
    status: i < 3 ? "active" : "churned",
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `ent_agg_globex_${i}`,
    organization: "Globex",
    status: "active",
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `ent_agg_initech_${i}`,
    organization: "Initech",
    status: "churned",
  })),
  // No `organization` key at all — exercises the include_null branch.
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `ent_agg_noorg_${i}`,
    status: "active",
  })),
];

async function insertEntity(
  id: string,
  snapshot: Record<string, unknown>,
  type = entityType
): Promise<void> {
  await db.from("entities").insert({
    id,
    entity_type: type,
    canonical_name: id,
    user_id: userId,
  });
  await db.from("entity_snapshots").insert({
    entity_id: id,
    entity_type: type,
    schema_version: "1.0.0",
    canonical_name: id,
    snapshot,
    user_id: userId,
    observation_count: 1,
    computed_at: new Date().toISOString(),
  });
}

async function cleanup(): Promise<void> {
  await db.from("entity_snapshots").delete().eq("user_id", userId);
  await db.from("observations").delete().eq("user_id", userId);
  await db.from("entities").delete().eq("user_id", userId);
}

describe("aggregateEntityField (#1967)", () => {
  beforeAll(async () => {
    await cleanup();
    for (const fixture of FIXTURES) {
      const { id, ...snapshot } = fixture;
      await insertEntity(id, snapshot);
    }
  });

  afterAll(cleanup);

  describe("counts", () => {
    it("groups by a snapshot field with correct counts, largest bucket first", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
      });

      expect(result.buckets).toEqual([
        { value: "Acme", count: 5 },
        { value: "Globex", count: 3 },
        { value: "Initech", count: 2 },
      ]);
      // The 2 entities with no organization are excluded by default.
      expect(result.total_matching).toBe(10);
      expect(result.distinct_count).toBe(3);
      expect(result.has_more).toBe(false);
    });

    it("executes as a SQL GROUP BY, materializing only bucket rows", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
      });

      expect(result.execution.strategy).toBe("sql_group_by");
      // 12 entities exist, but only 3 bucket rows ever reach JS. If this were
      // an app-side scan, scanned_rows would be >= 12.
      expect(result.execution.scanned_rows).toBe(3);
      expect(result.execution.scanned_rows).toBeLessThan(FIXTURES.length);
    });

    it("counts entities missing the field into a null bucket when asked", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        includeNull: true,
      });

      const nullBucket = result.buckets.find((b) => b.value === null);
      expect(nullBucket).toEqual({ value: null, count: 2 });
      expect(result.total_matching).toBe(12);
      expect(result.distinct_count).toBe(4);
    });

    it("sorts by value when requested", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        sortBy: "value",
        sortOrder: "asc",
      });

      expect(result.buckets.map((b) => b.value)).toEqual(["Acme", "Globex", "Initech"]);
    });
  });

  describe("distinct", () => {
    it("reports the distinct values of a field", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "status",
        op: "distinct",
      });

      expect(result.op).toBe("distinct");
      expect(result.buckets.map((b) => b.value).sort()).toEqual(["active", "churned"]);
      expect(result.distinct_count).toBe(2);
    });
  });

  describe("filters", () => {
    it("applies an eq filter before grouping", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        filters: { status: { op: "eq", value: "active" } },
      });

      // active: Acme×3, Globex×3 (the 2 no-org actives are excluded as null).
      expect(result.buckets).toEqual([
        { value: "Acme", count: 3 },
        { value: "Globex", count: 3 },
      ]);
      expect(result.total_matching).toBe(6);
    });

    it("applies an in filter", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "status",
        filters: { organization: { op: "in", value: ["Globex", "Initech"] } },
      });

      expect(result.buckets.sort((a, b) => String(a.value).localeCompare(String(b.value)))).toEqual(
        [
          { value: "active", count: 3 },
          { value: "churned", count: 2 },
        ]
      );
    });

    it("applies a contains filter case-insensitively", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        // Upper-case needle against a capitalized stored value: matches only
        // if the comparison is case-insensitive.
        filters: { organization: { op: "contains", value: "CME" } },
      });

      expect(result.buckets).toEqual([{ value: "Acme", count: 5 }]);
    });

    it("returns nothing for an empty in-list rather than dropping the filter", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        filters: { status: { op: "in", value: [] } },
      });

      expect(result.buckets).toEqual([]);
      expect(result.total_matching).toBe(0);
    });
  });

  describe("bucket bounds", () => {
    it("caps buckets at the requested limit and reports has_more", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        limit: 2,
      });

      expect(result.buckets).toHaveLength(2);
      expect(result.limit).toBe(2);
      // Totals describe the WHOLE grouping, not just this page.
      expect(result.distinct_count).toBe(3);
      expect(result.has_more).toBe(true);
      expect(result.execution.truncated).toBe(true);
    });

    it("pages buckets via offset", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        limit: 2,
        offset: 2,
      });

      expect(result.buckets).toEqual([{ value: "Initech", count: 2 }]);
      expect(result.has_more).toBe(false);
    });

    it("clamps an over-large limit to MAX_BUCKET_LIMIT", async () => {
      const result = await aggregateEntityField({
        userId,
        entityType,
        field: "organization",
        limit: 999999,
      });

      expect(result.limit).toBe(MAX_BUCKET_LIMIT);
    });

    it("defaults to DEFAULT_BUCKET_LIMIT", async () => {
      const result = await aggregateEntityField({ userId, entityType, field: "organization" });
      expect(result.limit).toBe(DEFAULT_BUCKET_LIMIT);
    });
  });

  describe("safety", () => {
    it("rejects a field name that is not a plain identifier", async () => {
      await expect(
        aggregateEntityField({ userId, entityType, field: "org'; DROP TABLE entities;--" })
      ).rejects.toThrow(/Invalid field/);
    });

    it("rejects an injection attempt in a filter field name", async () => {
      await expect(
        aggregateEntityField({
          userId,
          entityType,
          field: "organization",
          filters: { "a') OR 1=1--": { op: "eq", value: "x" } },
        })
      ).rejects.toThrow(/Invalid filter field/);
    });

    /**
     * Deletion is decided by the WINNING observation (source_priority DESC,
     * then observed_at DESC), so a higher-priority restore un-deletes an
     * entity. A naive "any `_deleted: true` row exists" filter would keep a
     * restored entity hidden forever; this pins the real precedence.
     *
     * NOTE: this entity is built observation-first. Inserting an observation
     * triggers recomputeEntitySnapshot, which rebuilds the snapshot from
     * observations alone — so a directly-written snapshot (as used by the
     * other fixtures) would be erased by the first deletion observation.
     */
    it("excludes soft-deleted entities but counts restored ones", async () => {
      const delId = "ent_agg_delete_cycle";
      const observe = (
        id: string,
        fields: Record<string, unknown>,
        priority: number,
        observedAt: string
      ) =>
        db.from("observations").insert({
          id,
          entity_id: delId,
          entity_type: entityType,
          schema_version: "1.0",
          user_id: userId,
          fields,
          source_priority: priority,
          observed_at: new Date(observedAt).toISOString(),
        });

      await db.from("entities").insert({
        id: delId,
        entity_type: entityType,
        canonical_name: delId,
        user_id: userId,
      });
      // Base observation carries the aggregated field, so the recomputed
      // snapshot keeps `organization` across the delete/restore cycle.
      await observe("obs_agg_base", { organization: "Umbrella" }, 10, "2025-12-01T00:00:00Z");

      const before = await aggregateEntityField({ userId, entityType, field: "organization" });
      expect(before.buckets.find((b) => b.value === "Umbrella")?.count).toBe(1);

      await observe(
        "obs_agg_del_1",
        { organization: "Umbrella", _deleted: true },
        100,
        "2026-01-01T00:00:00Z"
      );
      const afterDelete = await aggregateEntityField({ userId, entityType, field: "organization" });
      expect(afterDelete.buckets.find((b) => b.value === "Umbrella")).toBeUndefined();

      await observe(
        "obs_agg_restore_1",
        { organization: "Umbrella", _deleted: false },
        200,
        "2026-02-01T00:00:00Z"
      );
      const afterRestore = await aggregateEntityField({ userId, entityType, field: "organization" });
      expect(afterRestore.buckets.find((b) => b.value === "Umbrella")?.count).toBe(1);

      await db.from("observations").delete().eq("entity_id", delId);
      await db.from("entity_snapshots").delete().eq("entity_id", delId);
      await db.from("entities").delete().eq("id", delId);
    });

    it("excludes entities merged into another entity", async () => {
      await db
        .from("entities")
        .update({ merged_to_entity_id: "ent_agg_acme_0" })
        .eq("id", "ent_agg_initech_0");

      try {
        const result = await aggregateEntityField({ userId, entityType, field: "organization" });
        expect(result.buckets.find((b) => b.value === "Initech")?.count).toBe(1);
      } finally {
        await db
          .from("entities")
          .update({ merged_to_entity_id: null })
          .eq("id", "ent_agg_initech_0");
      }
    });

    it("scopes results to the calling user", async () => {
      const otherUser = "agg-test-user-other";
      await db.from("entities").insert({
        id: "ent_agg_other",
        entity_type: entityType,
        canonical_name: "ent_agg_other",
        user_id: otherUser,
      });
      await db.from("entity_snapshots").insert({
        entity_id: "ent_agg_other",
        entity_type: entityType,
        schema_version: "1.0.0",
        snapshot: { organization: "Acme" },
        user_id: otherUser,
        observation_count: 1,
      });

      try {
        const result = await aggregateEntityField({ userId, entityType, field: "organization" });
        // Still 5, not 6 — the other user's Acme row must not leak in.
        expect(result.buckets.find((b) => b.value === "Acme")?.count).toBe(5);
      } finally {
        await db.from("entity_snapshots").delete().eq("user_id", otherUser);
        await db.from("entities").delete().eq("user_id", otherUser);
      }
    });
  });
});

/**
 * Scale test: the aggregation must not degrade with entity count. A
 * scan-and-count implementation would materialize every row here; the SQL
 * GROUP BY materializes only the bucket rows regardless of how many entities
 * back them. This is the regression guard for the #1943 freeze.
 */
describe("aggregateEntityField scale (#1967 / #1943)", () => {
  const scaleUser = "agg-scale-user";
  const scaleType = "agg_scale_contact";
  const ROW_COUNT = 5000;
  const ORGS = ["Acme", "Globex", "Initech", "Umbrella", "Soylent"];

  beforeAll(async () => {
    await db.from("entity_snapshots").delete().eq("user_id", scaleUser);
    await db.from("entities").delete().eq("user_id", scaleUser);

    // Bulk-insert via the adapter's array insert to keep setup fast.
    const entityRows = [];
    const snapshotRows = [];
    for (let i = 0; i < ROW_COUNT; i++) {
      const id = `ent_scale_${i}`;
      entityRows.push({
        id,
        entity_type: scaleType,
        canonical_name: id,
        user_id: scaleUser,
      });
      snapshotRows.push({
        entity_id: id,
        entity_type: scaleType,
        schema_version: "1.0.0",
        canonical_name: id,
        snapshot: { organization: ORGS[i % ORGS.length], seq: i },
        user_id: scaleUser,
        observation_count: 1,
      });
    }
    await db.from("entities").insert(entityRows);
    await db.from("entity_snapshots").insert(snapshotRows);
  }, 120000);

  afterAll(async () => {
    await db.from("entity_snapshots").delete().eq("user_id", scaleUser);
    await db.from("entities").delete().eq("user_id", scaleUser);
  });

  it(`aggregates ${ROW_COUNT} entities into 5 buckets without an app-side scan`, async () => {
    const started = Date.now();
    const result = await aggregateEntityField({
      userId: scaleUser,
      entityType: scaleType,
      field: "organization",
    });
    const elapsedMs = Date.now() - started;

    expect(result.total_matching).toBe(ROW_COUNT);
    expect(result.distinct_count).toBe(ORGS.length);
    for (const bucket of result.buckets) {
      expect(bucket.count).toBe(ROW_COUNT / ORGS.length);
    }

    // The proof it is not O(n) in application code: 5000 entities collapse to
    // 5 materialized rows.
    expect(result.execution.strategy).toBe("sql_group_by");
    expect(result.execution.scanned_rows).toBe(ORGS.length);

    // Generous ceiling — a per-entity JS pass over 5000 rows (each requiring a
    // JSON.parse) is far slower than a single grouped statement.
    expect(elapsedMs).toBeLessThan(2000);
  }, 60000);

  it("bounds buckets on a high-cardinality field over the same rows", async () => {
    // `seq` is unique per row: 5000 distinct values. Without a cap this would
    // return 5000 buckets.
    const result = await aggregateEntityField({
      userId: scaleUser,
      entityType: scaleType,
      field: "seq",
      limit: 10,
    });

    expect(result.buckets).toHaveLength(10);
    expect(result.distinct_count).toBe(ROW_COUNT);
    expect(result.has_more).toBe(true);
  }, 60000);
});
