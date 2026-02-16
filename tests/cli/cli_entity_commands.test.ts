import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity, createTestRelationship } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-entity";

describe("CLI entity commands", () => {
  const tracker = new TestIdTracker();
  let testEntityId: string;

  beforeAll(async () => {
    // Create test entity for queries
    testEntityId = await createTestEntity({
      entity_type: "company",
      canonical_name: "Test Company CLI",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(testEntityId);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("entities list", () => {
    it("should list all entities with --json", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} entities list --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("entities");
      expect(Array.isArray(result.entities)).toBe(true);
    });

    it("should list entities with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.length).toBeLessThanOrEqual(5);
    });

    it("should list entities with --offset", async () => {
      const { stdout: stdout1 } = await execAsync(
        `${CLI_PATH} entities list --limit 2 --offset 0 --json`
      );

      const { stdout: stdout2 } = await execAsync(
        `${CLI_PATH} entities list --limit 2 --offset 2 --json`
      );

      const result1 = JSON.parse(stdout1);
      const result2 = JSON.parse(stdout2);

      // Different offsets should return different results
      if (result1.entities.length > 0 && result2.entities.length > 0) {
        expect(result1.entities[0].id).not.toBe(result2.entities[0].id);
      }
    });

    it("should filter by --entity-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      result.entities.forEach((entity: any) => {
        expect(entity.entity_type).toBe("company");
      });
    });

    it("should filter by --user-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.some((e: any) => e.id === testEntityId)).toBe(true);
    });

    it("should include merged entities with --include-merged", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --include-merged --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} entities list`);

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });
  });

  describe("entities get", () => {
    it("should get entity by ID with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities get --entity-id "${testEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entity.id).toBe(testEntityId);
      expect(result.entity.canonical_name).toBe("Test Company CLI");
    });

    it("should handle invalid entity ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} entities get --entity-id "ent_nonexistent" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("entities search", () => {
    it("should search entities with --search query", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities search --search "Test Company" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });

    it("should search with --entity-type filter", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities search --search "Test" --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      result.entities.forEach((entity: any) => {
        expect(entity.entity_type).toBe("company");
      });
    });

    it("should search with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities search --search "Test" --limit 3 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.length).toBeLessThanOrEqual(3);
    });
  });

  describe("entities related", () => {
    let relatedEntityId: string;

    beforeAll(async () => {
      // Create related entity
      relatedEntityId = await createTestEntity({
        entity_type: "person",
        canonical_name: "Related Person",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(relatedEntityId);

      // Create relationship
      await createTestRelationship({
        source_entity_id: testEntityId,
        target_entity_id: relatedEntityId,
        relationship_type: "works_at",
        user_id: TEST_USER_ID,
      });
    });

    it("should get related entities with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities related --entity-id "${testEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("related_entities");
    });

    it("should filter by --direction outbound", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities related --entity-id "${testEntityId}" --direction outbound --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("related_entities");
    });

    it("should filter by --direction inbound", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities related --entity-id "${relatedEntityId}" --direction inbound --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("related_entities");
    });

    it("should filter by --direction both", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities related --entity-id "${testEntityId}" --direction both --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("related_entities");
    });

    it("should limit results with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities related --entity-id "${testEntityId}" --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.related_entities.length).toBeLessThanOrEqual(5);
    });
  });

  describe("entities neighborhood", () => {
    it("should get entity neighborhood with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities neighborhood --entity-id "${testEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
      expect(result).toHaveProperty("relationships");
    });

    it("should limit depth with --max-hops", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities neighborhood --entity-id "${testEntityId}" --max-hops 1 --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });

    it("should handle max-hops 0", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities neighborhood --entity-id "${testEntityId}" --max-hops 0 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].id).toBe(testEntityId);
    });
  });

  describe("entities merge", () => {
    let mergeTargetId: string;

    beforeAll(async () => {
      mergeTargetId = await createTestEntity({
        entity_type: "company",
        canonical_name: "Merge Target",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(mergeTargetId);
    });

    it("should merge entities with --json", async () => {
      const duplicateId = await createTestEntity({
        entity_type: "company",
        canonical_name: "Duplicate Company",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(duplicateId);

      const { stdout } = await execAsync(
        `${CLI_PATH} entities merge --entity-id "${duplicateId}" --target-entity-id "${mergeTargetId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("merged_entity_id");
      expect(result.merged_entity_id).toBe(mergeTargetId);
    });

    it("should handle invalid merge parameters", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} entities merge --entity-id "ent_invalid" --target-entity-id "${mergeTargetId}" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("entities delete", () => {
    it("should soft delete entity with --json", async () => {
      const deleteEntityId = await createTestEntity({
        entity_type: "test",
        canonical_name: "To Delete",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(deleteEntityId);

      const { stdout } = await execAsync(
        `${CLI_PATH} entities delete --entity-id "${deleteEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);
    });

    it("should handle deleting non-existent entity", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} entities delete --entity-id "ent_nonexistent" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("entities restore", () => {
    it("should restore deleted entity with --json", async () => {
      const restoreEntityId = await createTestEntity({
        entity_type: "test",
        canonical_name: "To Restore",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(restoreEntityId);

      // Delete first
      await execAsync(
        `${CLI_PATH} entities delete --entity-id "${restoreEntityId}" --json`
      );

      // Then restore
      const { stdout } = await execAsync(
        `${CLI_PATH} entities restore --entity-id "${restoreEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success", async () => {
      try {
        await execAsync(
          `${CLI_PATH} entities get --entity-id "${testEntityId}" --json`
        );
        expect(true).toBe(true);
      } catch {
        throw new Error("Should not throw on success");
      }
    });

    it("should return non-zero exit code on error", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} entities get --entity-id "ent_invalid" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
