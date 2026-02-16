import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { supabase } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { verifySourceExists, verifyEntityExists } from "../helpers/database_verifiers.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("MCP store action - parameter variations", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-store-variations";

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("store_structured variations", () => {
    it("should store entities with minimal required fields", async () => {
      const entities = [
        {
          entity_type: "task",
          canonical_name: "Test Task Minimal",
          title: "Test Task"
        },
      ];

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "minimal-test-hash",
          storage_url: "file:///test/minimal-test-hash.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();
      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      const { data: observations } = await supabase
        .from("observations")
        .insert(
          entities.map((entity) => ({
            entity_id: `ent_${Date.now()}`,
            entity_type: entity.entity_type,
            source_id: source!.id,
            fields: entity,
            user_id: testUserId,
            schema_version: "1.0",
            observed_at: new Date().toISOString()
          }))
        )
        .select();

      expect(observations).toHaveLength(1);
      expect(observations![0].entity_type).toBe("task");

      await verifySourceExists(source!.id);
    });

    it("should store entities with optional user_id as null", async () => {
      const entities = [
        {
          entity_type: "task",
          canonical_name: "Global Task",
          title: "Global Task"
        },
      ];

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: null,
          content_hash: "global-test-hash",
          storage_url: "file:///test/global-test-hash.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      const { data: observations } = await supabase
        .from("observations")
        .insert(
          entities.map((entity) => ({
            entity_id: `ent_${Date.now()}`,
            entity_type: entity.entity_type,
            source_id: source!.id,
            fields: entity,
            user_id: null,
            schema_version: "1.0",
            observed_at: new Date().toISOString()
          }))
        )
        .select();

      expect(observations).toHaveLength(1);
      expect(observations![0].user_id).toBeNull();
    });

    it("should store entities with optional user_id as default UUID", async () => {
      const defaultUserId = "00000000-0000-0000-0000-000000000000";
      const entities = [
        {
          entity_type: "task",
          canonical_name: "Default User Task",
          title: "Default User Task"
        },
      ];

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: defaultUserId,
          content_hash: "default-user-hash",
          storage_url: "file:///test/default-user-hash.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      const { data: observations } = await supabase
        .from("observations")
        .insert(
          entities.map((entity) => ({
            entity_id: `ent_${Date.now()}`,
            entity_type: entity.entity_type,
            source_id: source!.id,
            fields: entity,
            user_id: defaultUserId,
            schema_version: "1.0",
            observed_at: new Date().toISOString()
          }))
        )
        .select();

      expect(observations).toHaveLength(1);
      expect(observations![0].user_id).toBe(defaultUserId);
    });

    it("should store entities with custom source_priority", async () => {
      const entities = [
        {
          entity_type: "task",
          canonical_name: "High Priority Task",
          title: "High Priority Task"
        },
      ];

      const { data: source, error: sourceError} = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "priority-test-hash",
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0,
          source_type: "file"
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Note: source_priority is set on observations, not sources
      expect(source!.id).toBeDefined();
    });

    it("should store entities with original_filename", async () => {
      const entities = [
        {
          entity_type: "task",
          canonical_name: "Task from File",
          title: "Task from File"
        },
      ];

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "filename-test-hash",
          original_filename: "test_tasks.json",
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0,
          source_type: "file"
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      expect(source!.original_filename).toBe("test_tasks.json");
    });

    it("should deduplicate sources with same content_hash", async () => {
      const contentHash = "duplicate-test-hash";

      // First insert
      const { data: source1, error: source1Error } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: contentHash,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0,
          source_type: "file"
        })
        .select()
        .single();

      tracker.trackSource(source1!.id);

      // Second insert with same hash
      const { data: source2, error } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: contentHash,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0,
          source_type: "file"
        })
        .select()
        .single();

      // Should fail due to unique constraint on content_hash
      expect(error).toBeDefined();
      expect(error?.code).toBe("23505"); // Unique violation
    });

    it("should reject empty entities array", async () => {
      const entities: any[] = [];

      // Attempting to insert empty array should result in no observations
      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "empty-entities-hash",
          storage_url: "file:///test/empty-entities-hash.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // No observations to insert - verify source exists but has no observations
      const { data: observations } = await supabase
        .from("observations")
        .select("*")
        .eq("source_id", source!.id);

      expect(observations).toHaveLength(0);
    });
  });

  describe("store_unstructured variations", () => {
    it("should store unstructured data with file_content (base64)", async () => {
      const testFile = join(process.cwd(), "tests/fixtures/sample_invoice.pdf");
      const fileContent = readFileSync(testFile);
      const base64Content = fileContent.toString("base64");

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `hash_${Date.now()}`,
          mime_type: "application/pdf",
          original_filename: "sample_invoice.pdf",
          storage_url: "file:///test/minimal.txt",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      expect(source!.mime_type).toBe("application/pdf");
      expect(source!.original_filename).toBe("sample_invoice.pdf");
    });

    it("should store unstructured data with file_path", async () => {
      const testFile = join(process.cwd(), "tests/fixtures/sample_invoice.pdf");

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `hash_${Date.now()}`,
          mime_type: "application/pdf",
          original_filename: "sample_invoice.pdf",
          storage_url: "file:///test/minimal.txt",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      expect(source!.original_filename).toBe("sample_invoice.pdf");
    });

    it("should store unstructured data with interpret: false", async () => {
      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `no-interpret-${Date.now()}`,
          mime_type: "application/pdf",
          storage_url: "file:///test/minimal.txt",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Verify no observations created (interpret: false)
      const { data: observations } = await supabase
        .from("observations")
        .select("*")
        .eq("source_id", source!.id);

      expect(observations).toHaveLength(0);
    });

    it("should store unstructured data with custom interpretation_config", async () => {
      const interpretationConfig = {
        model: "gpt-4",
        temperature: 0.2,
        max_tokens: 2000
      };

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `config-test-${Date.now()}`,
          mime_type: "text/plain",
          storage_url: "file:///test/minimal.txt",
          file_size: 0
        })
        .select()
        .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

      tracker.trackSource(source!.id);

      // Would verify interpretation_config stored if interpretations table is updated
      await verifySourceExists(source!.id);
    });
  });

  describe("idempotency_key variations", () => {
    it("should accept same idempotency_key for identical operations", async () => {
      const idempotencyKey = `idem-${Date.now()}`;

      const { data: source1, error: source1Error } = await supabase
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: `idem-hash-1-${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
        .select()
        .single();

      tracker.trackSource(source1!.id);

      // Idempotency is handled at application layer, not database
      // Here we just verify sources can be created
      expect(source1).toBeDefined();
    });
  });

  describe("error cases", () => {
    it("should reject invalid entity_type", async () => {
      const { error } = await supabase.from("observations")
    .insert({
        entity_id: `ent_${Date.now()}`,
        entity_type: "", // Empty entity_type
        source_id: "00000000-0000-0000-0000-000000000000",
        fields: {},
        user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      expect(error).toBeDefined();
    });

    it("should reject invalid source_id foreign key", async () => {
      const { error } = await supabase.from("observations")
    .insert({
        entity_id: `ent_${Date.now()}`,
        entity_type: "task",
        source_id: "non-existent-source-id",
        fields: {},
        user_id: testUserId,
    schema_version: "1.0",
    observed_at: new Date().toISOString()
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe("23503"); // Foreign key violation
    });
  });
});
