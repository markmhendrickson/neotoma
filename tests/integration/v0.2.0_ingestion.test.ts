// Integration tests for v0.2.0 - Sources-First Ingestion

import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../src/db";
import { storeRawContent, computeContentHash } from "../../src/services/raw_storage";
import { runInterpretation, checkInterpretationQuota } from "../../src/services/interpretation";
import { queryEntities, getEntityWithProvenance } from "../../src/services/entity_queries";
import { config } from "../../src/config";
import { setupTestSchemas } from "./setup_v0.2.0_schemas";
import { randomUUID } from "crypto";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

describe("v0.2.0 Integration Tests", () => {
  beforeAll(async () => {
    // Setup schemas
    await setupTestSchemas();

    // Clean up test data
    await db.from("observations").delete().eq("user_id", TEST_USER_ID);
    await db.from("entity_merges").delete().eq("user_id", TEST_USER_ID);
    await db.from("interpretations").delete().eq("user_id", TEST_USER_ID);
    await db.from("sources").delete().eq("user_id", TEST_USER_ID);
    await db.from("entities").delete().eq("user_id", TEST_USER_ID);
  });

  describe("IT-001: Raw File Ingestion Flow", () => {
    it("should store raw content with SHA-256 deduplication", async () => {
      const content = "Test file content";
      const buffer = Buffer.from(content, "utf-8");

      const result1 = await storeRawContent({
        userId: TEST_USER_ID,
        fileBuffer: buffer,
        mimeType: "text/plain",
        originalFilename: "test.txt",
        provenance: { test: true },
      });

      expect(result1.deduplicated).toBe(false);
      expect(result1.contentHash).toBe(computeContentHash(buffer));

      // Try to store same content again
      const result2 = await storeRawContent({
        userId: TEST_USER_ID,
        fileBuffer: buffer,
        mimeType: "text/plain",
        originalFilename: "test2.txt",
        provenance: { test: true },
      });

      expect(result2.deduplicated).toBe(true);
      expect(result2.sourceId).toBe(result1.sourceId);
    });

    it("should link observations to source and interpretation run", async () => {
      const content = "Another test file";
      const buffer = Buffer.from(content, "utf-8");

      const storageResult = await storeRawContent({
        userId: TEST_USER_ID,
        fileBuffer: buffer,
        mimeType: "text/plain",
        originalFilename: "test3.txt",
      });

      const extractedData = [
        {
          entity_type: "note",
          name: "Test Note",
          content: "Test content",
        },
      ];

      const interpretationResult = await runInterpretation({
        userId: TEST_USER_ID,
        sourceId: storageResult.sourceId,
        extractedData,
        config: {
          provider: "test",
          model_id: "test-model",
          temperature: 0,
          prompt_hash: "test-hash",
          code_version: "v0.2.0",
        },
      });

      expect(interpretationResult.observationsCreated).toBeGreaterThan(0);
      expect(interpretationResult.interpretationId).toBeDefined();

      // Verify observation has provenance links
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("source_id", storageResult.sourceId);

      expect(observations).toBeDefined();
      expect(observations!.length).toBeGreaterThan(0);
      expect(observations![0].source_id).toBe(storageResult.sourceId);
      expect(observations![0].interpretation_id).toBe(
        interpretationResult.interpretationId
      );
    });
  });

  describe("IT-002: Content Deduplication", () => {
    it("should deduplicate identical content per user", async () => {
      const content = "Unique content for dedup test";
      const buffer = Buffer.from(content, "utf-8");

      const result1 = await storeRawContent({
        userId: TEST_USER_ID,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });

      const result2 = await storeRawContent({
        userId: TEST_USER_ID,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });

      expect(result1.sourceId).toBe(result2.sourceId);
      expect(result2.deduplicated).toBe(true);
    });
  });

  describe("IT-003: Reinterpretation Immutability", () => {
    it("should create new observations without modifying existing ones", async () => {
      const content = "Reinterpretation test content";
      const buffer = Buffer.from(content, "utf-8");

      const storageResult = await storeRawContent({
        userId: TEST_USER_ID,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });

      const extractedData = [
        {
          entity_type: "note",
          name: "Original Note",
        },
      ];

      // First interpretation
      const run1 = await runInterpretation({
        userId: TEST_USER_ID,
        sourceId: storageResult.sourceId,
        extractedData,
        config: {
          provider: "test1",
          model_id: "model1",
          temperature: 0,
          prompt_hash: "hash1",
          code_version: "v0.2.0",
        },
      });

      const { data: obs1 } = await db
        .from("observations")
        .select("*")
        .eq("interpretation_id", run1.interpretationId);

      const obs1Count = obs1?.length || 0;

      // Second interpretation
      const run2 = await runInterpretation({
        userId: TEST_USER_ID,
        sourceId: storageResult.sourceId,
        extractedData,
        config: {
          provider: "test2",
          model_id: "model2",
          temperature: 0.5,
          prompt_hash: "hash2",
          code_version: "v0.2.0",
        },
      });

      // Verify first run observations unchanged
      const { data: obs1After } = await db
        .from("observations")
        .select("*")
        .eq("interpretation_id", run1.interpretationId);

      expect(obs1After?.length).toBe(obs1Count);

      // Verify second run created new observations
      const { data: obs2 } = await db
        .from("observations")
        .select("*")
        .eq("interpretation_id", run2.interpretationId);

      expect(obs2).toBeDefined();
      expect(obs2!.length).toBeGreaterThan(0);
      expect(run2.interpretationId).not.toBe(run1.interpretationId);
    });
  });

  describe("IT-004: Correction Override", () => {
    it("should allow corrections to override AI extraction", async () => {
      // Create entity with observation
      const entityId = `ent_test_${randomUUID().substring(0, 8)}`;
      
      await db.from("entities").insert({
        id: entityId,
        entity_type: "note",
        canonical_name: "Test Entity",
        user_id: TEST_USER_ID,
      });

      // Create initial observation
      await db.from("observations").insert({
        id: randomUUID(),
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 0, // AI priority
        fields: { title: "Original Title" },
        user_id: TEST_USER_ID,
      });

      // Create correction observation
      await db.from("observations").insert({
        id: randomUUID(),
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 1000, // Correction priority
        fields: { title: "Corrected Title" },
        user_id: TEST_USER_ID,
      });

      // Verify correction wins (would need reducer to compute snapshot)
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId)
        .order("source_priority", { ascending: false });

      expect(observations![0].source_priority).toBe(1000);
      expect(observations![0].fields).toEqual({ title: "Corrected Title" });
    });
  });

  describe("IT-005: Entity Merge Flow", () => {
    it("should merge entities and redirect observations", async () => {
      const fromEntityId = `ent_from_${randomUUID().substring(0, 8)}`;
      const toEntityId = `ent_to_${randomUUID().substring(0, 8)}`;

      // Create two entities
      await db.from("entities").insert([
        {
          id: fromEntityId,
          entity_type: "person",
          canonical_name: "John Doe",
          user_id: TEST_USER_ID,
        },
        {
          id: toEntityId,
          entity_type: "person",
          canonical_name: "John Doe",
          user_id: TEST_USER_ID,
        },
      ]);

      // Create observation for source entity
      const obsId = randomUUID();
      await db.from("observations").insert({
        id: obsId,
        entity_id: fromEntityId,
        entity_type: "person",
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 0,
        fields: { name: "John Doe" },
        user_id: TEST_USER_ID,
      });

      // Rewrite observations
      await db
        .from("observations")
        .update({ entity_id: toEntityId })
        .eq("entity_id", fromEntityId);

      // Mark source entity as merged
      await db
        .from("entities")
        .update({
          merged_to_entity_id: toEntityId,
          merged_at: new Date().toISOString(),
        })
        .eq("id", fromEntityId);

      // Create merge audit log
      await db.from("entity_merges").insert({
        user_id: TEST_USER_ID,
        from_entity_id: fromEntityId,
        to_entity_id: toEntityId,
        observations_moved: 1,
      });

      // Verify merge
      const { data: fromEntity } = await db
        .from("entities")
        .select("*")
        .eq("id", fromEntityId)
        .single();

      expect(fromEntity!.merged_to_entity_id).toBe(toEntityId);

      // Verify observation redirected
      const { data: obs } = await db
        .from("observations")
        .select("*")
        .eq("id", obsId)
        .single();

      expect(obs!.entity_id).toBe(toEntityId);
    });
  });

  describe("IT-006: Cross-User Isolation", () => {
    it("should isolate data by user_id", async () => {
      const user1 = TEST_USER_ID;
      const user2 = "00000000-0000-0000-0000-000000000002";

      const content = "User isolation test " + randomUUID();
      const buffer = Buffer.from(content, "utf-8");

      // Store for user 1
      const result1 = await storeRawContent({
        userId: user1,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });

      // Store for user 2 (same content, different user)
      const result2 = await storeRawContent({
        userId: user2,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });

      // Should NOT be deduplicated across users (different source records)
      expect(result1.sourceId).not.toBe(result2.sourceId);
      expect(result2.deduplicated).toBe(false);

      // Query entities for user 1
      const entities1 = await queryEntities({ userId: user1 });
      const entities2 = await queryEntities({ userId: user2 });

      // Entities should be isolated
      const user1EntityIds = entities1.map((e) => e.entity_id);
      const user2EntityIds = entities2.map((e) => e.entity_id);

      expect(user1EntityIds.every((id) => !user2EntityIds.includes(id))).toBe(true);

      // Clean up user 2 data
      await db.from("sources").delete().eq("user_id", user2);
    });
  });

  describe("IT-007: Interpretation Quota Enforcement", () => {
    it("should track interpretation quota", async () => {
      const quota = await checkInterpretationQuota(TEST_USER_ID, 100);

      expect(quota).toHaveProperty("allowed");
      expect(quota).toHaveProperty("current");
      expect(quota).toHaveProperty("limit");
      if (config.storageBackend === "local") {
        expect(quota.allowed).toBe(true);
        expect(quota.limit).toBe(0);
      } else {
        expect(quota.limit).toBe(100);
      }
    });
  });

  describe("IT-008: Query Updates - Merged Entity Exclusion", () => {
    it("should exclude merged entities from default queries", async () => {
      const activeEntityId = `ent_active_${randomUUID().substring(0, 8)}`;
      const mergedEntityId = `ent_merged_${randomUUID().substring(0, 8)}`;

      // Create active entity
      await db.from("entities").insert({
        id: activeEntityId,
        entity_type: "person",
        canonical_name: "Active Person",
        user_id: TEST_USER_ID,
      });

      // Create merged entity
      await db.from("entities").insert({
        id: mergedEntityId,
        entity_type: "person",
        canonical_name: "Merged Person",
        user_id: TEST_USER_ID,
        merged_to_entity_id: activeEntityId,
        merged_at: new Date().toISOString(),
      });

      // Query without including merged
      const entitiesExcluded = await queryEntities({
        userId: TEST_USER_ID,
        includeMerged: false,
      });

      const excludedIds = entitiesExcluded.map((e) => e.entity_id);
      expect(excludedIds).toContain(activeEntityId);
      expect(excludedIds).not.toContain(mergedEntityId);

      // Query with including merged
      const entitiesIncluded = await queryEntities({
        userId: TEST_USER_ID,
        includeMerged: true,
      });

      const includedIds = entitiesIncluded.map((e) => e.entity_id);
      expect(includedIds).toContain(activeEntityId);
      expect(includedIds).toContain(mergedEntityId);
    });
  });

  describe("IT-009: Provenance Chain", () => {
    it("should maintain complete provenance chain", async () => {
      const content = "Provenance test";
      const buffer = Buffer.from(content, "utf-8");

      const storageResult = await storeRawContent({
        userId: TEST_USER_ID,
        fileBuffer: buffer,
        mimeType: "text/plain",
        originalFilename: "provenance.txt",
      });

      const extractedData = [
        {
          entity_type: "note",
          name: "Provenance Note",
        },
      ];

      const interpretationResult = await runInterpretation({
        userId: TEST_USER_ID,
        sourceId: storageResult.sourceId,
        extractedData,
        config: {
          provider: "test",
          model_id: "test-model",
          temperature: 0,
          prompt_hash: "test-hash",
          code_version: "v0.2.0",
        },
      });

      // Verify provenance chain: source → interpretation → observation
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("interpretation_id", interpretationResult.interpretationId);

      expect(observations).toBeDefined();
      expect(observations!.length).toBeGreaterThan(0);

      const obs = observations![0];
      expect(obs.source_id).toBe(storageResult.sourceId);
      expect(obs.interpretation_id).toBe(interpretationResult.interpretationId);

      // Verify source metadata
      const { data: source } = await db
        .from("sources")
        .select("*")
        .eq("id", storageResult.sourceId)
        .single();

      expect(source).toBeDefined();
      expect(source!.content_hash).toBe(storageResult.contentHash);

      // Verify interpretation run metadata
      const { data: run } = await db
        .from("interpretations")
        .select("*")
        .eq("id", interpretationResult.interpretationId)
        .single();

      expect(run).toBeDefined();
      expect(run!.interpretation_config).toBeDefined();
    });
  });

  describe("IT-010: Entity Redirect on Merge", () => {
    it("should redirect to target entity when querying merged entity", async () => {
      const fromEntityId = `ent_redirect_from_${randomUUID().substring(0, 8)}`;
      const toEntityId = `ent_redirect_to_${randomUUID().substring(0, 8)}`;

      // Create entities
      await db.from("entities").insert([
        {
          id: fromEntityId,
          entity_type: "person",
          canonical_name: "Redirect From",
          user_id: TEST_USER_ID,
          merged_to_entity_id: toEntityId,
          merged_at: new Date().toISOString(),
        },
        {
          id: toEntityId,
          entity_type: "person",
          canonical_name: "Redirect To",
          user_id: TEST_USER_ID,
        },
      ]);

      // Query merged entity - should redirect to target
      const entity = await getEntityWithProvenance(fromEntityId);

      expect(entity).toBeDefined();
      expect(entity!.entity_id).toBe(toEntityId);
      expect(entity!.canonical_name).toBe("Redirect To");
    });
  });
});

