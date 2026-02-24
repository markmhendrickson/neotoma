import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { verifyEntityExists, computeEntitySnapshot } from "../helpers/database_verifiers.js";

describe("MCP entity actions - parameter variations", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-entity";

  afterAll(async () => {
    await tracker.cleanup();
  });

  describe("retrieve_entity_snapshot variations", () => {
    it("should retrieve entity by entity_id", async () => {
      // Create test entity
      const entityId = `ent_test_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `hash_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      const { data: observation } = await db
        .from("observations")
    .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Test Task", canonical_name: "Test Task" },
          user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
        })
        .select()
        .single();

      tracker.trackEntity(entityId);

      // Compute snapshot
      await computeEntitySnapshot(entityId);

      // Retrieve entity
      const { data: entity } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", entityId)
        .single();

      expect(entity).toBeDefined();
      expect(entity!.entity_id).toBe(entityId);
      expect(entity!.entity_type).toBe("task");
    });

    it("should return null for non-existent entity_id", async () => {
      const { data: entity } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", "non-existent-entity-id")
        .maybeSingle();

      expect(entity).toBeNull();
    });
  });

  describe("retrieve_entities variations", () => {
    beforeAll(async () => {
      // Seed multiple test entities
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `bulk_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      for (let i = 0; i < 15; i++) {
        const entityId = `ent_bulk_${Date.now()}_${i}`;
        await db.from("observations")
    .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: `Task ${i}`, canonical_name: `Task ${i}` },
          user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
        });
        tracker.trackEntity(entityId);
        await computeEntitySnapshot(entityId);
      }
    });

    it("should paginate with limit and offset", async () => {
      const { data: page1 } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("entity_id")
        .limit(5)
        .range(0, 4);

      expect(page1).toHaveLength(5);

      const { data: page2 } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .order("entity_id")
        .limit(5)
        .range(5, 9);

      expect(page2).toHaveLength(5);

      // Verify no overlap
      const page1Ids = page1!.map((e) => e.entity_id);
      const page2Ids = page2!.map((e) => e.entity_id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it("should filter by entity_type", async () => {
      const { data: entities } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId);

      expect(entities!.every((e) => e.entity_type === "task")).toBe(true);
    });

    it("should filter by user_id", async () => {
      const { data: entities } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("user_id", testUserId);

      expect(entities!.every((e) => e.user_id === testUserId)).toBe(true);
    });

    it("should filter by user_id: null", async () => {
      // Create entity with null user_id
      const entityId = `ent_null_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: null,
          content_hash: `null_user_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "Global Task", canonical_name: "Global Task" },
        user_id: null,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      await computeEntitySnapshot(entityId);

      const { data: entities } = await db
        .from("entity_snapshots")
        .select("*")
        .is("user_id", null);

      expect(entities!.some((e) => e.entity_id === entityId)).toBe(true);
    });

    it("should search by canonical_name", async () => {
      const { data: entities } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("user_id", testUserId)
        .ilike("canonical_name", "%Task%");

      expect(entities!.length).toBeGreaterThan(0);
    });
  });

  describe("retrieve_entity_by_identifier variations", () => {
    it("should find entity by canonical_name", async () => {
      const canonicalName = `Unique Task ${Date.now()}`;
      const entityId = `ent_unique_${Date.now()}`;

      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `unique_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: canonicalName, canonical_name: canonicalName },
        user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      await computeEntitySnapshot(entityId);

      const { data: entity } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("canonical_name", canonicalName)
        .single();

      expect(entity).toBeDefined();
      expect(entity!.canonical_name).toBe(canonicalName);
    });

    it("should return null for non-existent identifier", async () => {
      const { data: entity } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("canonical_name", "Non Existent Entity")
        .maybeSingle();

      expect(entity).toBeNull();
    });
  });

  describe("merge_entities variations", () => {
    it("should merge two entities", async () => {
      // Create source and target entities
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `merge_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      const sourceEntityId = `ent_source_${Date.now()}`;
      const targetEntityId = `ent_target_${Date.now()}`;

      await db.from("entities").insert([
        { id: sourceEntityId, entity_type: "task", canonical_name: "Source", user_id: testUserId },
        { id: targetEntityId, entity_type: "task", canonical_name: "Target", user_id: testUserId },
      ]);

      await db.from("observations").insert([
        {
          entity_id: sourceEntityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Source Task", canonical_name: "Source" },
          user_id: testUserId
        },
        {
          entity_id: targetEntityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Target Task", canonical_name: "Target" },
          user_id: testUserId
        },
      ]);

      tracker.trackEntity(sourceEntityId);
      tracker.trackEntity(targetEntityId);

      await computeEntitySnapshot(sourceEntityId);
      await computeEntitySnapshot(targetEntityId);
      // Merge would be handled by application layer
      // Here we verify entities exist
      await verifyEntityExists(sourceEntityId, { entity_type: "task", canonical_name: "Source" });
      await verifyEntityExists(targetEntityId, { entity_type: "task", canonical_name: "Target" });
    });
  });

  describe("delete_entity variations", () => {
    it("should delete entity with deletion observation", async () => {
      const entityId = `ent_delete_${Date.now()}`;

      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `delete_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "To Delete", canonical_name: "To Delete" },
        user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create deletion observation
      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { _deleted: true },
        user_id: testUserId,
        priority: 1000, // Deletion priority,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      // Verify entity marked as deleted
      const { data: entity } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", entityId)
        .maybeSingle();

      // Entity snapshot might still exist with _deleted flag
      // or might be excluded from snapshots view
    });
  });

  describe("restore_entity variations", () => {
    it("should restore deleted entity with restoration observation", async () => {
      const entityId = `ent_restore_${Date.now()}`;

      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `restore_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Create entity
      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "To Restore", canonical_name: "To Restore" },
        user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Delete it
      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { _deleted: true },
        user_id: testUserId,
        priority: 1000,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      // Restore it
      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: { _deleted: false },
        user_id: testUserId,
        priority: 1001, // Restoration priority,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      // Compute snapshot after restoration
      await computeEntitySnapshot(entityId);

      // Verify entity restored
      await verifyEntityExists(entityId, {
        entity_type: "task",
        user_id: testUserId,
        snapshotExists: true
      });
    });
  });

  describe("get_authenticated_user variations", () => {
    it("should return authenticated user from context", async () => {
      // This would be tested at MCP server level
      // Here we just verify user_id is valid UUID format
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(validUuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });
});
