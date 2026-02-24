import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-rel";

describe("CLI relationship commands", () => {
  const tracker = new TestIdTracker();
  let sourceEntityId: string;
  let targetEntityId: string;

  beforeAll(async () => {
    // Create test entities
    sourceEntityId = await createTestEntity({
      entity_type: "person",
      canonical_name: "Source Person",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(sourceEntityId);

    targetEntityId = await createTestEntity({
      entity_type: "company",
      canonical_name: "Target Company",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(targetEntityId);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("relationships create", () => {
    it("should create works_at relationship with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("relationship_id");
      expect(result.relationship_type).toBe("works_at");

      tracker.addRelationship(result.relationship_id);
    });

    it("should create owns relationship with --json", async () => {
      const ownerEntity = await createTestEntity({
        entity_type: "person",
        canonical_name: "Owner",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(ownerEntity);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${ownerEntity}" --target-entity-id "${targetEntityId}" --relationship-type owns --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship_type).toBe("owns");
      tracker.addRelationship(result.relationship_id);
    });

    it("should create manages relationship with --json", async () => {
      const managerEntity = await createTestEntity({
        entity_type: "person",
        canonical_name: "Manager",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(managerEntity);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${managerEntity}" --target-entity-id "${targetEntityId}" --relationship-type manages --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship_type).toBe("manages");
      tracker.addRelationship(result.relationship_id);
    });

    it("should create part_of relationship with --json", async () => {
      const departmentEntity = await createTestEntity({
        entity_type: "organization",
        canonical_name: "Engineering Dept",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(departmentEntity);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${departmentEntity}" --target-entity-id "${targetEntityId}" --relationship-type part_of --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship_type).toBe("part_of");
      tracker.addRelationship(result.relationship_id);
    });

    it("should create related_to relationship with --json", async () => {
      const relatedEntity = await createTestEntity({
        entity_type: "person",
        canonical_name: "Related Person",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(relatedEntity);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${relatedEntity}" --relationship-type related_to --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship_type).toBe("related_to");
      tracker.addRelationship(result.relationship_id);
    });

    it("should create depends_on relationship with --json", async () => {
      const dependencyEntity = await createTestEntity({
        entity_type: "system",
        canonical_name: "Dependency System",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(dependencyEntity);

      const systemEntity = await createTestEntity({
        entity_type: "system",
        canonical_name: "Main System",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(systemEntity);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${systemEntity}" --target-entity-id "${dependencyEntity}" --relationship-type depends_on --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship_type).toBe("depends_on");
      tracker.addRelationship(result.relationship_id);
    });

    it("should create references relationship with --json", async () => {
      const docEntity = await createTestEntity({
        entity_type: "document",
        canonical_name: "Reference Doc",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(docEntity);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${docEntity}" --relationship-type references --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship_type).toBe("references");
      tracker.addRelationship(result.relationship_id);
    });

    it("should create transacted_with relationship with --json", async () => {
      const vendorEntity = await createTestEntity({
        entity_type: "company",
        canonical_name: "Vendor Co",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(vendorEntity);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${vendorEntity}" --relationship-type transacted_with --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship_type).toBe("transacted_with");
      tracker.addRelationship(result.relationship_id);
    });

    it("should create relationship with --metadata", async () => {
      const metadata = JSON.stringify({ start_date: "2025-01-01", role: "Engineer" });

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --metadata '${metadata}' --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("relationship_id");
      tracker.addRelationship(result.relationship_id);
    });

    it("should handle invalid relationship type", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type invalid_type --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("relationships list", () => {
    let testRelationshipId: string;

    beforeAll(async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --json`
      );
      const result = JSON.parse(stdout);
      testRelationshipId = result.relationship_id;
      tracker.addRelationship(testRelationshipId);
    });

    it("should list all relationships with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("relationships");
      expect(Array.isArray(result.relationships)).toBe(true);
    });

    it("should filter by --source-entity-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --source-entity-id "${sourceEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      result.relationships.forEach((rel: any) => {
        expect(rel.source_entity_id).toBe(sourceEntityId);
      });
    });

    it("should filter by --target-entity-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --target-entity-id "${targetEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      result.relationships.forEach((rel: any) => {
        expect(rel.target_entity_id).toBe(targetEntityId);
      });
    });

    it("should filter by --relationship-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --relationship-type works_at --json`
      );

      const result = JSON.parse(stdout);
      result.relationships.forEach((rel: any) => {
        expect(rel.relationship_type).toBe("works_at");
      });
    });

    it("should filter by --direction outbound", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --source-entity-id "${sourceEntityId}" --direction outbound --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("relationships");
    });

    it("should paginate with --limit and --offset", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --limit 5 --offset 0 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationships.length).toBeLessThanOrEqual(5);
    });
  });

  describe("relationships get", () => {
    let testRelationshipId: string;

    beforeAll(async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --json`
      );
      const result = JSON.parse(stdout);
      testRelationshipId = result.relationship_id;
      tracker.addRelationship(testRelationshipId);
    });

    it("should get relationship by ID with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships get --relationship-id "${testRelationshipId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationship.id).toBe(testRelationshipId);
    });

    it("should handle invalid relationship ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} relationships get --relationship-id "rel_invalid" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("relationships delete", () => {
    it("should delete relationship with --json", async () => {
      const { stdout: createStdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --json`
      );
      const createResult = JSON.parse(createStdout);
      tracker.addRelationship(createResult.relationship_id);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships delete --relationship-id "${createResult.relationship_id}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);
    });
  });

  describe("relationships restore", () => {
    it("should restore deleted relationship with --json", async () => {
      const { stdout: createStdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --json`
      );
      const createResult = JSON.parse(createStdout);
      tracker.addRelationship(createResult.relationship_id);

      // Delete first
      await execAsync(
        `${CLI_PATH} relationships delete --relationship-id "${createResult.relationship_id}" --json`
      );

      // Then restore
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships restore --relationship-id "${createResult.relationship_id}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);
    });
  });

  describe("relationships get-snapshot", () => {
    it("should get relationship snapshot with provenance", async () => {
      const { stdout: createStdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --json`
      );
      const createResult = JSON.parse(createStdout);
      tracker.addRelationship(createResult.relationship_id);

      const { stdout } = await execAsync(
        `${CLI_PATH} relationships get-snapshot works_at "${sourceEntityId}" "${targetEntityId}" --json`
      );
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("snapshot");
      expect(result).toHaveProperty("observations");
      expect(Array.isArray(result.observations)).toBe(true);
    });

    it("should return non-zero for missing relationship snapshot", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} relationships get-snapshot works_at "ent_missing_source" "ent_missing_target" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }
      expect(exitCode).toBeGreaterThan(0);
    });
  });

  describe("exit codes", () => {
    let testRelationshipId: string;

    beforeAll(async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships create --source-entity-id "${sourceEntityId}" --target-entity-id "${targetEntityId}" --relationship-type works_at --user-id "${TEST_USER_ID}" --json`
      );
      const result = JSON.parse(stdout);
      testRelationshipId = result.relationship_id;
      tracker.addRelationship(testRelationshipId);
    });

    it("should return exit code 0 on success", async () => {
      try {
        await execAsync(
          `${CLI_PATH} relationships get --relationship-id "${testRelationshipId}" --json`
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
          `${CLI_PATH} relationships get --relationship-id "rel_invalid" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
