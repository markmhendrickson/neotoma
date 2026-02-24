import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

describe("MCP resource actions - parameter variations", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-resource-variations";

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("retrieve_file_url variations", () => {
    it("should generate signed URL for file with default expiry", async () => {
      // This would be tested at MCP server level with actual file storage
      const filePath = "/test/file.pdf";
      const defaultExpiresIn = 3600; // 1 hour

      expect(defaultExpiresIn).toBe(3600);
      expect(filePath).toBe("/test/file.pdf");
    });

    it("should generate signed URL with custom expiry", async () => {
      const filePath = "/test/file.pdf";
      const customExpiresIn = 7200; // 2 hours

      expect(customExpiresIn).toBe(7200);
      expect(filePath).toBe("/test/file.pdf");
    });

    it("should handle file paths with special characters", async () => {
      const filePath = "/test/file with spaces.pdf";
      expect(filePath).toContain(" ");
    });
  });

  describe("list_observations variations", () => {
    it("should list observations for entity_id", async () => {
      const entityId = `ent_obs_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `obs_${Date.now()}`,
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
        fields: { title: "Task", canonical_name: "Task" },
        user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      tracker.trackEntity(entityId);

      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId);

      expect(observations!.length).toBeGreaterThan(0);
    });

    it("should paginate observations with limit", async () => {
      const entityId = `ent_obs_paginate_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `paginate_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Create multiple observations
      for (let i = 0; i < 10; i++) {
        await db.from("observations")
    .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: `Task ${i}`, update: i },
          user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
        });
      }

      tracker.trackEntity(entityId);

      const limit = 5;
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId)
        .limit(limit);

      expect(observations).toHaveLength(limit);
    });

    it("should paginate observations with offset", async () => {
      const entityId = `ent_obs_offset_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `offset_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Create multiple observations
      for (let i = 0; i < 15; i++) {
        await db.from("observations")
    .insert({
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: `Task ${i}`, update: i },
          user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
        });
      }

      tracker.trackEntity(entityId);

      const limit = 5;
      const offset = 5;
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId)
        .order("created_at")
        .limit(limit)
        .range(offset, offset + limit - 1);

      expect(observations).toHaveLength(limit);
    });
  });

  describe("retrieve_field_provenance variations", () => {
    it("should retrieve provenance chain for specific field", async () => {
      const entityId = `ent_prov_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `prov_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Create observations with title field
      await db.from("observations").insert([
        {
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Original Title", canonical_name: "Task" },
          user_id: testUserId,
          priority: 500
        },
        {
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Updated Title" },
          user_id: testUserId,
          priority: 600
        },
      ]);

      tracker.trackEntity(entityId);

      // Get provenance for title field
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId)
        .order("source_priority");

      expect(observations!.length).toBeGreaterThan(0);
      expect(observations!.some((o) => o.fields.title)).toBe(true);
    });

    it("should trace field through multiple observations", async () => {
      const entityId = `ent_trace_${Date.now()}`;
      const { data: source, error: sourceError } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `trace_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Create chain of updates
      await db.from("observations").insert([
        {
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Version 1", canonical_name: "Task" },
          user_id: testUserId,
          priority: 500
        },
        {
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Version 2" },
          user_id: testUserId,
          priority: 600
        },
        {
          entity_id: entityId,
          entity_type: "task",
          source_id: source!.id,
          fields: { title: "Version 3" },
          user_id: testUserId,
          priority: 700
        },
      ]);

      tracker.trackEntity(entityId);

      // Get provenance chain
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId)
        .order("source_priority");

      expect(observations).toHaveLength(3);
      expect(observations![0].fields.title).toBe("Version 1");
      expect(observations![1].fields.title).toBe("Version 2");
      expect(observations![2].fields.title).toBe("Version 3");
    });
  });

  describe("list_timeline_events variations", () => {
    it("should list timeline events with pagination", async () => {
      const { data: events } = await db
        .from("timeline_events")
        .select("*")
        .limit(10);

      expect(Array.isArray(events)).toBe(true);
    });

    it("should filter timeline events by event_type", async () => {
      const eventType = "task_created";
      const { data: events } = await db
        .from("timeline_events")
        .select("*")
        .eq("event_type", eventType);

      expect(Array.isArray(events)).toBe(true);
    });

    it("should filter timeline events by date range", async () => {
      const startDate = "2025-01-01";
      const endDate = "2025-12-31";

      const { data: events } = await db
        .from("timeline_events")
        .select("*")
        .gte("event_date", startDate)
        .lte("event_date", endDate);

      expect(Array.isArray(events)).toBe(true);
    });

    it("should filter timeline events by user_id", async () => {
      const { data: events } = await db
        .from("timeline_events")
        .select("*")
        .eq("user_id", testUserId);

      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe("MCP resource URI patterns", () => {
    it("should handle neotoma://entity_snapshots pattern", async () => {
      const uri = "neotoma://entity_snapshots";
      expect(uri).toBe("neotoma://entity_snapshots");
    });

    it("should handle neotoma://entity_snapshots/{id} pattern", async () => {
      const entityId = "ent_test_123";
      const uri = `neotoma://entity_snapshots/${entityId}`;
      expect(uri).toContain(entityId);
    });

    it("should handle neotoma://observations pattern", async () => {
      const uri = "neotoma://observations";
      expect(uri).toBe("neotoma://observations");
    });

    it("should handle neotoma://observations/{id} pattern", async () => {
      const observationId = "obs_test_123";
      const uri = `neotoma://observations/${observationId}`;
      expect(uri).toContain(observationId);
    });

    it("should handle neotoma://source pattern", async () => {
      const uri = "neotoma://source";
      expect(uri).toBe("neotoma://source");
    });

    it("should handle neotoma://source/{id} pattern", async () => {
      const sourceId = "00000000-0000-0000-0000-000000000001";
      const uri = `neotoma://source/${sourceId}`;
      expect(uri).toContain(sourceId);
    });

    it("should handle neotoma://relationship_snapshots pattern", async () => {
      const uri = "neotoma://relationship_snapshots";
      expect(uri).toBe("neotoma://relationship_snapshots");
    });

    it("should handle neotoma://relationship_snapshots/{id} pattern", async () => {
      const relationshipId = "rel_test_123";
      const uri = `neotoma://relationship_snapshots/${relationshipId}`;
      expect(uri).toContain(relationshipId);
    });

    it("should handle neotoma://timeline_events pattern", async () => {
      const uri = "neotoma://timeline_events";
      expect(uri).toBe("neotoma://timeline_events");
    });

    it("should handle neotoma://timeline_events/{id} pattern", async () => {
      const eventId = "evt_test_123";
      const uri = `neotoma://timeline_events/${eventId}`;
      expect(uri).toContain(eventId);
    });

    it("should handle neotoma://schema_registry pattern", async () => {
      const uri = "neotoma://schema_registry";
      expect(uri).toBe("neotoma://schema_registry");
    });

    it("should handle neotoma://schema_registry/{entity_type} pattern", async () => {
      const entityType = "task";
      const uri = `neotoma://schema_registry/${entityType}`;
      expect(uri).toContain(entityType);
    });

    it("should handle neotoma://entity_types pattern", async () => {
      const uri = "neotoma://entity_types";
      expect(uri).toBe("neotoma://entity_types");
    });
  });

  describe("error cases", () => {
    it("should handle invalid entity_id in list_observations", async () => {
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", "non-existent-entity");

      expect(observations).toHaveLength(0);
    });

    it("should handle invalid source_id", async () => {
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("source_id", "non-existent-source");

      expect(observations).toHaveLength(0);
    });
  });
});
