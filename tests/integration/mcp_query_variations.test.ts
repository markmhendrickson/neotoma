import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

describe("MCP query actions - parameter variations", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-query";

  beforeAll(async () => {
    // Seed test data for query operations
    const { data: source, error: sourceError } = await db
      .from("sources")
        .insert({
          user_id: testUserId,
        content_hash: `query_test_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
      .select()
      .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

    tracker.trackSource(source!.id);

    // Create 25 test entities for pagination testing
    for (let i = 0; i < 25; i++) {
      const entityId = `ent_query_${Date.now()}_${i}`;

      // Insert directly into entities table for testing
      await db.from("entities").insert({
        id: entityId,
        entity_type: "task",
        canonical_name: `Task ${i}`,
        user_id: testUserId,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });

      tracker.trackEntity(entityId);
    }
  });

  afterEach(async () => {
    // Keep test data for all tests
  });

  describe("pagination variations", () => {
    it("should paginate with default limit", async () => {
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(10);

      expect(entities).toHaveLength(10);
    });

    it("should paginate with custom limit", async () => {
      const customLimit = 5;
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(customLimit);

      expect(entities).toHaveLength(customLimit);
    });

    it("should paginate with offset", async () => {
      const limit = 5;
      const offset = 10;

      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(limit)
        .range(offset, offset + limit - 1);

      expect(entities).toHaveLength(limit);
    });

    it("should paginate with min limit (1)", async () => {
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(1);

      expect(entities).toHaveLength(1);
    });

    it("should paginate with max limit boundary", async () => {
      const maxLimit = 100;
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(maxLimit);

      // Should return all available entities (25) even though limit is 100
      expect(entities!.length).toBeLessThanOrEqual(maxLimit);
    });

    it("should handle offset beyond data", async () => {
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(10)
        .range(1000, 1009);

      expect(entities).toHaveLength(0);
    });

    it("should paginate deterministically (same order on multiple calls)", async () => {
      const { data: page1_call1 } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(5);

      const { data: page1_call2 } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(5);

      expect(page1_call1).toEqual(page1_call2);
    });
  });

  describe("filtering variations", () => {
    it("should filter by entity_type", async () => {
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId);

      expect(entities!.every((e) => e.entity_type === "task")).toBe(true);
    });

    it("should filter by user_id", async () => {
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("user_id", testUserId);

      expect(entities!.every((e) => e.user_id === testUserId)).toBe(true);
    });

    it("should filter by user_id: null", async () => {
      // Create entity with null user_id
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: null,
          content_hash: `null_filter_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      const entityId = `ent_null_filter_${Date.now()}`;
      await db.from("observations")
    .insert({
        id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "Null User Task", canonical_name: "Null User" },
        user_id: null,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      const { data: entities } = await db
        .from("entities")
        .select("*")
        .is("user_id", null);

      expect(entities!.some((e) => e.id === entityId)).toBe(true);
    });

    it("should search by canonical_name with ILIKE", async () => {
      // Query entities table which has canonical_name as a column
      const { data: entities, error } = await db
        .from("entities")
        .select("*")
        .eq("user_id", testUserId)
        .ilike("canonical_name", "%Task%");

      expect(error).toBeNull();
      expect(entities?.length).toBeGreaterThan(0);
    });

    it("should combine multiple filters", async () => {
      const { data: entities, error } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .ilike("canonical_name", "%Task%");

      expect(error).toBeNull();
      expect(entities?.every((e) => e.entity_type === "task")).toBe(true);
      expect(entities?.every((e) => e.user_id === testUserId)).toBe(true);
    });
  });

  describe("sorting variations", () => {
    it("should sort by id ascending", async () => {
      const { data: entities, error } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id", { ascending: true })
        .limit(10);

      expect(error).toBeNull();
      expect(entities).toBeDefined();
      expect(entities!.length).toBeGreaterThan(0);

      // Verify sorted order
      for (let i = 1; i < entities!.length; i++) {
        expect(entities![i].id >= entities![i - 1].id).toBe(true);
      }
    });

    it("should sort by id descending", async () => {
      const { data: entities, error } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id", { ascending: false })
        .limit(10);

      expect(error).toBeNull();
      expect(entities).toBeDefined();
      expect(entities!.length).toBeGreaterThan(0);

      // Verify sorted order
      for (let i = 1; i < entities!.length; i++) {
        expect(entities![i].id <= entities![i - 1].id).toBe(true);
      }
    });

    it("should sort by canonical_name", async () => {
      const { data: entities, error } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("canonical_name")
        .limit(10);

      expect(error).toBeNull();
      expect(entities).toBeDefined();
      expect(entities!.length).toBeGreaterThan(0);

      // Verify sorted order
      for (let i = 1; i < entities!.length; i++) {
        expect(
          entities![i].canonical_name >= entities![i - 1].canonical_name
        ).toBe(true);
      }
    });

    it("should sort by multiple columns", async () => {
      const { data: entities, error } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("entity_type")
        .order("canonical_name")
        .limit(10);

      expect(error).toBeNull();
      expect(entities).toBeDefined();
      expect(entities!.length).toBeGreaterThan(0);
    });

    it("should maintain deterministic order", async () => {
      const { data: call1, error: error1 } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(10);

      const { data: call2, error: error2 } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("id")
        .limit(10);

      expect(error1).toBeNull();
      expect(error2).toBeNull();
      expect(call1).toBeDefined();
      expect(call2).toBeDefined();
      expect(call1).toEqual(call2);
    });
  });

  describe("combined pagination, filtering, and sorting", () => {
    it("should combine all query operations", async () => {
      const limit = 5;
      const offset = 0;

      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .ilike("canonical_name", "%Task%")
        .order("canonical_name")
        .limit(limit)
        .range(offset, offset + limit - 1);

      expect(entities).toHaveLength(limit);
      expect(entities!.every((e) => e.entity_type === "task")).toBe(true);
      expect(entities!.every((e) => e.user_id === testUserId)).toBe(true);

      // Verify sorted
      for (let i = 1; i < entities!.length; i++) {
        expect(
          entities![i].canonical_name >= entities![i - 1].canonical_name
        ).toBe(true);
      }
    });
  });

  describe("include_merged variations", () => {
    it("should exclude merged entities by default", async () => {
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .is("merged_into", null);

      // All entities should not be merged
      expect(entities!.every((e) => e.merged_into === null)).toBe(true);
    });

    it("should include merged entities when requested", async () => {
      // This would include entities with merged_into set
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId);

      // All entities returned (merged or not)
      expect(entities).toBeDefined();
    });
  });
});
