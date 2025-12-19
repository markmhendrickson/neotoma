/**
 * Entity Resolution Service Tests (FU-101, FU-113)
 *
 * Tests for deterministic entity ID generation, entity resolution,
 * merge tracking, and user isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateEntityId,
  normalizeEntityValue,
  resolveEntity,
  mergeEntities,
  listEntities,
  getMergedEntities,
  getEntityById,
  extractEntities,
} from "./entity_resolution.js";
import { supabase } from "../db.js";

// Test user ID for isolation tests
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_USER_ID_2 = "00000000-0000-0000-0000-000000000002";

// Check if migration has been applied
let migrationApplied = false;

describe("Entity Resolution Service", () => {
  // Track entities created during tests for cleanup
  const createdEntityIds: string[] = [];

  beforeAll(async () => {
    // Check if FU-113 migration has been applied by testing for user_id column
    const { error } = await supabase
      .from("entities")
      .select("user_id")
      .limit(1);
    
    migrationApplied = !error || !error.message.includes("does not exist");
    if (!migrationApplied) {
      console.warn("FU-113 migration not applied - skipping database-dependent tests");
    }
  });

  afterAll(async () => {
    // Cleanup test entities
    if (createdEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", createdEntityIds);
    }
  });

  describe("generateEntityId", () => {
    it("should generate deterministic entity IDs", () => {
      const id1 = generateEntityId("company", "Acme Corp");
      const id2 = generateEntityId("company", "Acme Corp");

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^ent_[a-f0-9]{24}$/);
    });

    it("should generate different IDs for different types", () => {
      const companyId = generateEntityId("company", "Test Entity");
      const personId = generateEntityId("person", "Test Entity");

      expect(companyId).not.toBe(personId);
    });

    it("should generate different IDs for different names", () => {
      const id1 = generateEntityId("company", "Company A");
      const id2 = generateEntityId("company", "Company B");

      expect(id1).not.toBe(id2);
    });
  });

  describe("normalizeEntityValue", () => {
    it("should lowercase and trim values", () => {
      // Note: "Corp" is removed as a company suffix
      expect(normalizeEntityValue("company", "  ACME Corp  ")).toBe("acme");
    });

    it("should remove company suffixes", () => {
      expect(normalizeEntityValue("company", "Acme Inc")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme LLC")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Ltd")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Corporation")).toBe("acme");
    });

    it("should not remove suffixes for non-company types", () => {
      expect(normalizeEntityValue("person", "John Inc")).toBe("john inc");
    });

    it("should collapse multiple spaces", () => {
      // Note: "Corp" is removed as a company suffix
      expect(normalizeEntityValue("company", "Acme   Corp")).toBe("acme");
    });

    it("should handle same company with different suffixes", () => {
      const norm1 = normalizeEntityValue("company", "Acme Inc");
      const norm2 = normalizeEntityValue("company", "Acme LLC");
      const norm3 = normalizeEntityValue("company", "Acme Corporation");

      expect(norm1).toBe(norm2);
      expect(norm2).toBe(norm3);
    });
  });

  describe("extractEntities", () => {
    it("should extract vendor from invoice", () => {
      const entities = extractEntities(
        { vendor_name: "Acme Corp" },
        "invoice"
      );

      expect(entities).toHaveLength(1);
      expect(entities[0]).toEqual({
        entity_type: "company",
        raw_value: "Acme Corp",
      });
    });

    it("should extract customer from invoice", () => {
      const entities = extractEntities(
        { vendor_name: "Acme Corp", customer_name: "Bob's Shop" },
        "invoice"
      );

      expect(entities).toHaveLength(2);
    });

    it("should extract person from identity document", () => {
      const entities = extractEntities(
        { full_name: "John Doe" },
        "identity_document"
      );

      expect(entities).toHaveLength(1);
      expect(entities[0]).toEqual({
        entity_type: "person",
        raw_value: "John Doe",
      });
    });

    it("should extract merchant from transaction", () => {
      const entities = extractEntities(
        { merchant_name: "Store ABC" },
        "transaction"
      );

      expect(entities).toHaveLength(1);
      expect(entities[0]).toEqual({
        entity_type: "company",
        raw_value: "Store ABC",
      });
    });

    it("should return empty array for unknown schema type", () => {
      const entities = extractEntities(
        { vendor_name: "Acme Corp" },
        "unknown_type"
      );

      expect(entities).toHaveLength(0);
    });
  });

  describe("resolveEntity", () => {
    it("should create new entity if not exists", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const entity = await resolveEntity("company", "Test Company Unique", TEST_USER_ID);
      createdEntityIds.push(entity.id);

      expect(entity.id).toMatch(/^ent_[a-f0-9]{24}$/);
      expect(entity.entity_type).toBe("company");
      expect(entity.canonical_name).toBe("test company unique");
    });

    it("should return existing entity on subsequent calls", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const entity1 = await resolveEntity("company", "Consistent Entity", TEST_USER_ID);
      createdEntityIds.push(entity1.id);

      const entity2 = await resolveEntity("company", "Consistent Entity", TEST_USER_ID);

      expect(entity1.id).toBe(entity2.id);
    });

    it("should resolve same entity with different case/spacing", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const entity1 = await resolveEntity("company", "Case Test Inc", TEST_USER_ID);
      createdEntityIds.push(entity1.id);

      const entity2 = await resolveEntity("company", "  case test  ", TEST_USER_ID);

      expect(entity1.id).toBe(entity2.id);
    });
  });

  describe("mergeEntities (FU-113)", () => {
    it("should merge two entities belonging to same user", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      // Create two entities for the same user
      const entity1 = await resolveEntity("company", "Merge Source Corp", TEST_USER_ID);
      const entity2 = await resolveEntity("company", "Merge Target Corp", TEST_USER_ID);
      createdEntityIds.push(entity1.id, entity2.id);

      const result = await mergeEntities(entity1.id, entity2.id, TEST_USER_ID);

      expect(result.success).toBe(true);
      expect(result.entity?.merged_to_entity_id).toBe(entity2.id);
      expect(result.entity?.merged_at).toBeDefined();
    });

    it("should reject merge of entities from different users", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      // Create entities for different users
      const entity1 = await resolveEntity("company", "User1 Entity", TEST_USER_ID);
      const entity2 = await resolveEntity("company", "User2 Entity", TEST_USER_ID_2);
      createdEntityIds.push(entity1.id, entity2.id);

      const result = await mergeEntities(entity1.id, entity2.id, TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or not owned");
    });

    it("should reject merge of already merged entity", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const entity1 = await resolveEntity("company", "Already Merged Source", TEST_USER_ID);
      const entity2 = await resolveEntity("company", "Already Merged Target", TEST_USER_ID);
      const entity3 = await resolveEntity("company", "Another Target", TEST_USER_ID);
      createdEntityIds.push(entity1.id, entity2.id, entity3.id);

      // First merge should succeed
      await mergeEntities(entity1.id, entity2.id, TEST_USER_ID);

      // Second merge of same source should fail
      const result = await mergeEntities(entity1.id, entity3.id, TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already merged");
    });
  });

  describe("listEntities (FU-113)", () => {
    it("should exclude merged entities by default", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const entity1 = await resolveEntity("company", "List Test Source", TEST_USER_ID);
      const entity2 = await resolveEntity("company", "List Test Target", TEST_USER_ID);
      createdEntityIds.push(entity1.id, entity2.id);

      // Merge entity1 into entity2
      await mergeEntities(entity1.id, entity2.id, TEST_USER_ID);

      // List should only return entity2 (unmerged)
      const entities = await listEntities({ user_id: TEST_USER_ID });

      const entityIds = entities.map((e) => e.id);
      expect(entityIds).toContain(entity2.id);
      expect(entityIds).not.toContain(entity1.id);
    });

    it("should include merged entities when requested", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const entity1 = await resolveEntity("company", "Include Merged Source", TEST_USER_ID);
      const entity2 = await resolveEntity("company", "Include Merged Target", TEST_USER_ID);
      createdEntityIds.push(entity1.id, entity2.id);

      await mergeEntities(entity1.id, entity2.id, TEST_USER_ID);

      // List with include_merged should return both
      const entities = await listEntities({
        user_id: TEST_USER_ID,
        include_merged: true,
      });

      const entityIds = entities.map((e) => e.id);
      expect(entityIds).toContain(entity1.id);
      expect(entityIds).toContain(entity2.id);
    });

    it("should filter by user_id", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const entity1 = await resolveEntity("company", "User1 Filter Test", TEST_USER_ID);
      const entity2 = await resolveEntity("company", "User2 Filter Test", TEST_USER_ID_2);
      createdEntityIds.push(entity1.id, entity2.id);

      const user1Entities = await listEntities({ user_id: TEST_USER_ID });
      const user2Entities = await listEntities({ user_id: TEST_USER_ID_2 });

      expect(user1Entities.some((e) => e.id === entity1.id)).toBe(true);
      expect(user1Entities.some((e) => e.id === entity2.id)).toBe(false);

      expect(user2Entities.some((e) => e.id === entity2.id)).toBe(true);
      expect(user2Entities.some((e) => e.id === entity1.id)).toBe(false);
    });
  });

  describe("getMergedEntities (FU-113)", () => {
    it("should return entities merged into a target", async () => {
      if (!migrationApplied) {
        console.log("Skipping: FU-113 migration required");
        return;
      }
      const source1 = await resolveEntity("company", "Merged Into Target 1", TEST_USER_ID);
      const source2 = await resolveEntity("company", "Merged Into Target 2", TEST_USER_ID);
      const target = await resolveEntity("company", "Merge Target Main", TEST_USER_ID);
      createdEntityIds.push(source1.id, source2.id, target.id);

      await mergeEntities(source1.id, target.id, TEST_USER_ID);
      await mergeEntities(source2.id, target.id, TEST_USER_ID);

      const mergedEntities = await getMergedEntities(target.id, TEST_USER_ID);

      expect(mergedEntities).toHaveLength(2);
      expect(mergedEntities.map((e) => e.id)).toContain(source1.id);
      expect(mergedEntities.map((e) => e.id)).toContain(source2.id);
    });
  });
});
