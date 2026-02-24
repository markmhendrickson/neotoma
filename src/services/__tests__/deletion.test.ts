/**
 * Unit tests for Deletion Service (Phase 1: Soft Deletion)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { db } from "../../db.js";
import {
  softDeleteEntity,
  softDeleteRelationship,
  isEntityDeleted,
  isRelationshipDeleted,
  batchSoftDeleteEntities,
} from "../deletion.js";
import { generateEntityId } from "../entity_resolution.js";

describe("Deletion Service", () => {
  const userId = "test-user-id";
  const testEntityType = "company";
  const testCanonicalName = "Test Company";
  const testEntityId = generateEntityId(testEntityType, testCanonicalName);

  beforeEach(async () => {
    // Clean up test data (by user and by test entity id so no UNIQUE conflict from other tests)
    await db.from("observations").delete().eq("user_id", userId);
    await db.from("entities").delete().eq("id", testEntityId);
    await db.from("entities").delete().eq("user_id", userId);
    await db.from("relationship_observations").delete().eq("user_id", userId);
  });

  afterEach(async () => {
    // Clean up test data
    await db.from("observations").delete().eq("user_id", userId);
    await db.from("entities").delete().eq("id", testEntityId);
    await db.from("entities").delete().eq("user_id", userId);
    await db.from("relationship_observations").delete().eq("user_id", userId);
  });

  describe("softDeleteEntity", () => {
    it("should create a deletion observation with _deleted: true", async () => {
      // Create entity first
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      // Soft delete
      const result = await softDeleteEntity(
        testEntityId,
        testEntityType,
        userId,
        "Testing deletion"
      );

      expect(result.success).toBe(true);
      expect(result.entity_id).toBe(testEntityId);
      expect(result.observation_id).toBeDefined();

      // Verify deletion observation exists
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", testEntityId)
        .eq("user_id", userId);

      expect(observations).toHaveLength(1);
      expect(observations![0].fields._deleted).toBe(true);
      expect(observations![0].fields.deleted_by).toBe(userId);
      expect(observations![0].fields.deletion_reason).toBe("Testing deletion");
      expect(observations![0].source_priority).toBe(1000); // Highest priority
    });

    it("should use deterministic observation ID based on entity ID and timestamp", async () => {
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      const timestamp = "2025-01-01T00:00:00Z";

      const result1 = await softDeleteEntity(
        testEntityId,
        testEntityType,
        userId,
        undefined,
        timestamp
      );

      expect(result1.success).toBe(true);
      expect(result1.observation_id).toBeDefined();
      
      // Verify only one deletion observation exists
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", testEntityId)
        .eq("user_id", userId);

      expect(observations).toHaveLength(1);
    });
  });

  describe("softDeleteRelationship", () => {
    it("should create a deletion observation for relationship", async () => {
      const sourceEntityId = generateEntityId("company", "Source Company");
      const targetEntityId = generateEntityId("company", "Target Company");
      const relationshipType = "PART_OF";
      const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

      // Create entities first
      await db.from("entities").insert([
        {
          id: sourceEntityId,
          entity_type: "company",
          canonical_name: "Source Company",
          user_id: userId,
        },
        {
          id: targetEntityId,
          entity_type: "company",
          canonical_name: "Target Company",
          user_id: userId,
        },
      ]);

      // Soft delete relationship
      const result = await softDeleteRelationship(
        relationshipKey,
        relationshipType,
        sourceEntityId,
        targetEntityId,
        userId,
        "Testing relationship deletion"
      );

      expect(result.success).toBe(true);
      expect(result.entity_id).toBe(relationshipKey);
      expect(result.observation_id).toBeDefined();

      // Verify deletion observation exists
      const { data: observations } = await db
        .from("relationship_observations")
        .select("*")
        .eq("relationship_key", relationshipKey)
        .eq("user_id", userId);

      expect(observations).toHaveLength(1);
      expect(observations![0].metadata._deleted).toBe(true);
      expect(observations![0].metadata.deleted_by).toBe(userId);
      expect(observations![0].metadata.deletion_reason).toBe("Testing relationship deletion");
      expect(observations![0].source_priority).toBe(1000);
    });
  });

  describe("isEntityDeleted", () => {
    it("should return true if entity has deletion observation", async () => {
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      // Soft delete entity
      await softDeleteEntity(testEntityId, testEntityType, userId);

      // Check if deleted
      const isDeleted = await isEntityDeleted(testEntityId, userId);
      expect(isDeleted).toBe(true);
    });

    it("should return false if entity has no deletion observation", async () => {
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      // Create regular observation (not deletion)
      await db.from("observations").insert({
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 0,
        fields: { name: "Test Company" },
        user_id: userId,
      });

      // Check if deleted
      const isDeleted = await isEntityDeleted(testEntityId, userId);
      expect(isDeleted).toBe(false);
    });

    it("should prioritize highest priority observation", async () => {
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      // Create regular observation first
      const { error: obsError } = await db.from("observations").insert({
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 0,
        fields: { name: "Test Company" },
        user_id: userId,
      });

      expect(obsError).toBeNull();

      // Create deletion observation (higher priority)
      const result = await softDeleteEntity(testEntityId, testEntityType, userId);
      expect(result.success).toBe(true);

      // Verify deletion observation was created
      const { data: deletionObs } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", testEntityId)
        .eq("user_id", userId)
        .eq("source_priority", 1000);

      expect(deletionObs).toHaveLength(1);
      expect(deletionObs![0].fields._deleted).toBe(true);

      // Should return true (deletion has priority 1000)
      const isDeleted = await isEntityDeleted(testEntityId, userId);
      expect(isDeleted).toBe(true);
    });
  });

  describe("isRelationshipDeleted", () => {
    it("should return true if relationship has deletion observation", async () => {
      const sourceEntityId = generateEntityId("company", "Source Company");
      const targetEntityId = generateEntityId("company", "Target Company");
      const relationshipType = "PART_OF";
      const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

      // Create entities
      await db.from("entities").insert([
        {
          id: sourceEntityId,
          entity_type: "company",
          canonical_name: "Source Company",
          user_id: userId,
        },
        {
          id: targetEntityId,
          entity_type: "company",
          canonical_name: "Target Company",
          user_id: userId,
        },
      ]);

      // Soft delete relationship
      await softDeleteRelationship(
        relationshipKey,
        relationshipType,
        sourceEntityId,
        targetEntityId,
        userId
      );

      // Check if deleted
      const isDeleted = await isRelationshipDeleted(relationshipKey, userId);
      expect(isDeleted).toBe(true);
    });

    it("should return false if relationship has no deletion observation", async () => {
      const sourceEntityId = generateEntityId("company", "Source Company");
      const targetEntityId = generateEntityId("company", "Target Company");
      const relationshipType = "PART_OF";
      const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

      // Create regular relationship observation
      const canonicalHash = createHash("sha256")
        .update(JSON.stringify({}))
        .digest("hex");

      await db.from("relationship_observations").insert({
        id: createHash("sha256").update(`${relationshipKey}:${new Date().toISOString()}`).digest("hex"),
        relationship_key: relationshipKey,
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
        relationship_type: relationshipType,
        observed_at: new Date().toISOString(),
        source_priority: 0,
        metadata: {},
        canonical_hash: canonicalHash,
        user_id: userId,
      });

      // Check if deleted
      const isDeleted = await isRelationshipDeleted(relationshipKey, userId);
      expect(isDeleted).toBe(false);
    });
  });

  describe("batchSoftDeleteEntities", () => {
    it("should delete multiple entities at once", async () => {
      const entity1Id = generateEntityId("company", "Company 1");
      const entity2Id = generateEntityId("company", "Company 2");
      const entity3Id = generateEntityId("company", "Company 3");

      // Create entities
      await db.from("entities").insert([
        {
          id: entity1Id,
          entity_type: "company",
          canonical_name: "Company 1",
          user_id: userId,
        },
        {
          id: entity2Id,
          entity_type: "company",
          canonical_name: "Company 2",
          user_id: userId,
        },
        {
          id: entity3Id,
          entity_type: "company",
          canonical_name: "Company 3",
          user_id: userId,
        },
      ]);

      // Batch delete
      const results = await batchSoftDeleteEntities(
        [entity1Id, entity2Id, entity3Id],
        "company",
        userId,
        "Batch deletion test"
      );

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      // Verify all are deleted
      const isDeleted1 = await isEntityDeleted(entity1Id, userId);
      const isDeleted2 = await isEntityDeleted(entity2Id, userId);
      const isDeleted3 = await isEntityDeleted(entity3Id, userId);

      expect(isDeleted1).toBe(true);
      expect(isDeleted2).toBe(true);
      expect(isDeleted3).toBe(true);
    });
  });
});
