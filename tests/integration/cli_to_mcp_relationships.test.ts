/**
 * Cross-Layer Integration Tests: CLI Relationship Commands → Database
 *
 * Validates that CLI relationship commands correctly propagate through
 * REST → MCP → Database, verifying DB state after each operation.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import {
  verifyRelationshipExists,
  verifyRelationshipNotExists,
} from "../helpers/database_verifiers.js";
import { createTestEntity } from "../helpers/test_data_helpers.js";
import {
  execCliJson,
  execCliFail,
} from "../helpers/cross_layer_helpers.js";

const TEST_USER_ID = "test-cross-layer-rel";

describe("Cross-layer: CLI relationship commands → Database", () => {
  const tracker = new TestIdTracker();
  let sourceEntityId: string;
  let targetEntityId: string;

  beforeAll(async () => {
    sourceEntityId = await createTestEntity({
      entity_type: "person",
      canonical_name: "Cross Layer Source Person",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(sourceEntityId);

    targetEntityId = await createTestEntity({
      entity_type: "company",
      canonical_name: "Cross Layer Target Company",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(targetEntityId);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("relationships create → relationship_snapshots table", () => {
    it("should create relationship and verify in DB", async () => {
      const result = await execCliJson(
        `relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}"`
      );

      expect(result).toHaveProperty("relationship_type");

      await verifyRelationshipExists("works_at", sourceEntityId, targetEntityId);
    });

    it("should create PART_OF relationship and verify in DB", async () => {
      const childId = await createTestEntity({
        entity_type: "task",
        canonical_name: "Cross Layer Child Task",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(childId);

      const projectId = await createTestEntity({
        entity_type: "project",
        canonical_name: "Cross Layer Parent Project",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(projectId);

      const result = await execCliJson(
        `relationships create --source-entity-id "${childId}" --target-entity-id "${projectId}" --relationship-type PART_OF --user-id "${TEST_USER_ID}"`
      );

      expect(result).toHaveProperty("relationship_type");

      await verifyRelationshipExists("PART_OF", childId, projectId);
    });

    it("should create relationship with metadata and verify in DB", async () => {
      const personId = await createTestEntity({
        entity_type: "person",
        canonical_name: "Cross Layer Person With Meta",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(personId);

      const companyId = await createTestEntity({
        entity_type: "company",
        canonical_name: "Cross Layer Company With Meta",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(companyId);

      const metadata = JSON.stringify({ role: "engineer", since: "2023-01-01" });

      const result = await execCliJson(
        `relationships create --source-entity-id "${personId}" --target-entity-id "${companyId}" --relationship-type works_at --metadata '${metadata}' --user-id "${TEST_USER_ID}"`
      );

      expect(result).toHaveProperty("relationship_type");
      await verifyRelationshipExists("works_at", personId, companyId);
    });
  });

  describe("relationships delete → soft-delete in DB", () => {
    it("should soft-delete relationship and verify removed from DB snapshot", async () => {
      // Create relationship first
      await execCliJson(
        `relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type DEPENDS_ON --user-id "${TEST_USER_ID}"`
      );

      await verifyRelationshipExists("DEPENDS_ON", sourceEntityId, targetEntityId);

      // Delete it
      const deleteResult = await execCliJson(
        `relationships delete --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type DEPENDS_ON --user-id "${TEST_USER_ID}"`
      );

      expect(deleteResult).toHaveProperty("success");

      // After soft-delete, snapshot should be removed or marked deleted
      await verifyRelationshipNotExists("DEPENDS_ON", sourceEntityId, targetEntityId);
    });
  });

  describe("relationships restore → restore in DB", () => {
    it("should restore soft-deleted relationship", async () => {
      const srcId = await createTestEntity({
        entity_type: "person",
        canonical_name: "Cross Layer Restore Source",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(srcId);

      const tgtId = await createTestEntity({
        entity_type: "company",
        canonical_name: "Cross Layer Restore Target",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(tgtId);

      // Create → delete → restore
      await execCliJson(
        `relationships create --source-entity-id "${srcId}" --target-entity-id "${tgtId}" --relationship-type REFERS_TO --user-id "${TEST_USER_ID}"`
      );

      await execCliJson(
        `relationships delete --source-entity-id "${srcId}" --target-entity-id "${tgtId}" --relationship-type REFERS_TO --user-id "${TEST_USER_ID}"`
      );

      const restoreResult = await execCliJson(
        `relationships restore --source-entity-id "${srcId}" --target-entity-id "${tgtId}" --relationship-type REFERS_TO --user-id "${TEST_USER_ID}"`
      );

      expect(restoreResult).toHaveProperty("success");

      // Relationship should be back
      await verifyRelationshipExists("REFERS_TO", srcId, tgtId);
    });
  });

  describe("relationships list → reads from DB", () => {
    it("should list relationships for entity after creation", async () => {
      const srcId = await createTestEntity({
        entity_type: "person",
        canonical_name: "Cross Layer List Source",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(srcId);

      const tgtId = await createTestEntity({
        entity_type: "company",
        canonical_name: "Cross Layer List Target",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(tgtId);

      await execCliJson(
        `relationships create --source-entity-id "${srcId}" --target-entity-id "${tgtId}" --relationship-type owns --user-id "${TEST_USER_ID}"`
      );

      const listResult = await execCliJson(
        `relationships list --source-entity-id "${srcId}" --user-id "${TEST_USER_ID}"`
      );

      const relationships = Array.isArray(listResult)
        ? listResult
        : (listResult.relationships as unknown[]) ?? [];

      expect(relationships.length).toBeGreaterThan(0);
    });
  });
});
