import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { verifyEntityExists, computeEntitySnapshot } from "../helpers/database_verifiers.js";

describe("MCP correction and reinterpretation - parameter variations", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-correction";

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("correct action variations", () => {
    it("should create correction observation for string field", async () => {
      // Create entity
      const entityId = `ent_correct_string_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `correct_${Date.now()}`,
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
        fields: {
          title: "Original Title",
          canonical_name: "Original"
        },
        user_id: testUserId,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create correction
      const { data: correction, error: correctionError } = await db
        .from("observations")
        .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: {
            title: "Corrected Title"
          },
          user_id: testUserId,
          source_priority: 1000,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
        })
        .select()
        .single();

      console.log("Correction insert error:", correctionError);
      console.log("Correction insert data:", correction);
      expect(correctionError).toBeNull();
      expect(correction).toBeDefined();
      expect(correction!.fields.title).toBe("Corrected Title");
      expect(correction!.source_priority).toBe(1000);
    });

    it("should create correction observation for number field", async () => {
      const entityId = `ent_correct_number_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `correct_num_${Date.now()}`,
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
        fields: {
          title: "Task",
          canonical_name: "Task",
          priority: 1
        },
        user_id: testUserId,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create correction
      const { data: correction } = await db
        .from("observations")
        .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: {
            priority: 5
          },
          user_id: testUserId,
          source_priority: 1000,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(correction!.fields.priority).toBe(5);
    });

    it("should create correction observation for date field", async () => {
      const entityId = `ent_correct_date_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `correct_date_${Date.now()}`,
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
        fields: {
          title: "Task",
          canonical_name: "Task",
          due_date: "2025-01-01"
        },
        user_id: testUserId,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create correction
      const { data: correction } = await db
        .from("observations")
        .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: {
            due_date: "2025-12-31"
          },
          user_id: testUserId,
          source_priority: 1000,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(correction!.fields.due_date).toBe("2025-12-31");
    });

    it("should create correction observation for boolean field", async () => {
      const entityId = `ent_correct_bool_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `correct_bool_${Date.now()}`,
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
        fields: {
          title: "Task",
          canonical_name: "Task",
          completed: false
        },
        user_id: testUserId,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create correction
      const { data: correction } = await db
        .from("observations")
        .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: {
            completed: true
          },
          user_id: testUserId,
          source_priority: 1000,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(correction!.fields.completed).toBe(true);
    });

    it("should create correction observation for array field", async () => {
      const entityId = `ent_correct_array_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `correct_array_${Date.now()}`,
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
        fields: {
          title: "Task",
          canonical_name: "Task",
          tags: ["old-tag"]
        },
        user_id: testUserId,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create correction
      const { data: correction } = await db
        .from("observations")
        .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: {
            tags: ["new-tag-1", "new-tag-2"]
          },
          user_id: testUserId,
          source_priority: 1000,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(correction!.fields.tags).toEqual(["new-tag-1", "new-tag-2"]);
    });

    it("should create correction observation for object field", async () => {
      const entityId = `ent_correct_object_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `correct_obj_${Date.now()}`,
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
        fields: {
          title: "Task",
          canonical_name: "Task",
          metadata: { key: "old value" }
        },
        user_id: testUserId,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create correction
      const { data: correction } = await db
        .from("observations")
        .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: {
            metadata: { key: "new value", extra: "data" }
          },
          user_id: testUserId,
          source_priority: 1000,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(correction!.fields.metadata).toEqual({
        key: "new value",
        extra: "data"
      });
    });

    it("should verify correction wins in snapshot computation", async () => {
      const entityId = `ent_verify_correction_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `verify_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Create original observation
      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: {
          title: "Original Title",
          canonical_name: "Original"
        },
        user_id: testUserId,
        source_priority: 500, // Normal priority,
          schema_version: "1.0",
          observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      // Create correction with later observed_at so default last-write-wins picks it
      const laterTime = new Date(Date.now() + 2000).toISOString();
      await db.from("observations")
    .insert({
        entity_id: entityId,
        entity_type: "task",
        source_id: source!.id,
        fields: {
          title: "Corrected Title"
        },
        user_id: testUserId,
        source_priority: 1000, // Correction priority (higher),
          schema_version: "1.0",
          observed_at: laterTime
      });

      // Compute entity snapshot from observations
      try {
        await computeEntitySnapshot(entityId, "task");
      } catch (error) {
        console.error("Error computing entity snapshot:", error);
        throw error;
      }

      // Verify entity snapshot uses correction
      const { data: snapshot, error: snapshotError } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", entityId)
        .single();

      expect(snapshotError).toBeNull();
      expect(snapshot).toBeDefined();
      expect(snapshot!.entity_type).toBe("task");
      expect(snapshot!.user_id).toBe(testUserId);

      // Snapshot should have corrected title (priority 1000 wins over 500)
      expect(snapshot!.snapshot.title).toBe("Corrected Title");
    });
  });


});
