import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity, createTestSource, createTestObservation } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-obs";

describe("CLI observation commands", () => {
  const tracker = new TestIdTracker();
  let testEntityId: string;
  let testSourceId: string;
  let testObservationId: string;

  beforeAll(async () => {
    // Create test entity
    testEntityId = await createTestEntity({
      entity_type: "company",
      canonical_name: "Observation Test Company",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(testEntityId);

    // Create test source
    const source = await createTestSource({
      user_id: TEST_USER_ID,
      storage_url: "file:///test/observation.json",
      mime_type: "application/json",
    });
    testSourceId = source.id;
    tracker.trackSource(testSourceId);

    // Create test observation
    const observation = await createTestObservation({
      entity_id: testEntityId,
      entity_type: "company",
      source_id: testSourceId,
      observed_properties: { field: "value" },
      user_id: TEST_USER_ID,
    });
    testObservationId = observation.id;
    tracker.trackObservation(testObservationId);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("observations list", () => {
    it("should list all observations with --json", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} observations list --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("observations");
      expect(Array.isArray(result.observations)).toBe(true);
    });

    it("should filter by --entity-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --entity-id "${testEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      result.observations.forEach((obs: any) => {
        expect(obs.entity_id).toBe(testEntityId);
      });
    });

    it("should filter by --source-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      result.observations.forEach((obs: any) => {
        expect(obs.source_id).toBe(testSourceId);
      });
    });

    it("should filter by both --entity-id and --source-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --entity-id "${testEntityId}" --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      result.observations.forEach((obs: any) => {
        expect(obs.entity_id).toBe(testEntityId);
        expect(obs.source_id).toBe(testSourceId);
      });
    });

    it("should paginate with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.observations.length).toBeLessThanOrEqual(5);
    });

    it("should paginate with --offset", async () => {
      const { stdout: page1 } = await execAsync(
        `${CLI_PATH} observations list --limit 2 --offset 0 --json`
      );

      const { stdout: page2 } = await execAsync(
        `${CLI_PATH} observations list --limit 2 --offset 2 --json`
      );

      const result1 = JSON.parse(page1);
      const result2 = JSON.parse(page2);

      if (result1.observations.length > 0 && result2.observations.length > 0) {
        expect(result1.observations[0].id).not.toBe(result2.observations[0].id);
      }
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("observations");
    });
  });

  describe("observations get", () => {
    it("should get observation by ID with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations get --observation-id "${testObservationId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.observation.id).toBe(testObservationId);
      expect(result.observation.entity_id).toBe(testEntityId);
      expect(result.observation.source_id).toBe(testSourceId);
    });

    it("should handle invalid observation ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} observations get --observation-id "obs_invalid" --json`
        )
      ).rejects.toThrow();
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations get --observation-id "${testObservationId}"`
      );

      const result = JSON.parse(stdout);
      expect(result.observation.id).toBe(testObservationId);
    });
  });

  describe("filtering combinations", () => {
    it("should combine entity and source filtering", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --entity-id "${testEntityId}" --source-id "${testSourceId}" --limit 10 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.observations.length).toBeGreaterThan(0);
      result.observations.forEach((obs: any) => {
        expect(obs.entity_id).toBe(testEntityId);
        expect(obs.source_id).toBe(testSourceId);
      });
    });

    it("should combine filtering with pagination", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --entity-id "${testEntityId}" --limit 5 --offset 0 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.observations.length).toBeLessThanOrEqual(5);
    });
  });

  describe("error handling", () => {
    it("should handle empty results gracefully", async () => {
      const fakeEntityId = "ent_nonexistent_12345";

      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --entity-id "${fakeEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.observations.length).toBe(0);
    });

    it("should handle missing required parameters", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} observations get --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success", async () => {
      try {
        await execAsync(
          `${CLI_PATH} observations list --json`
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
          `${CLI_PATH} observations get --observation-id "obs_invalid" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
