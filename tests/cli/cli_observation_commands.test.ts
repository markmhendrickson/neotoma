import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";

describe("CLI observation commands", () => {
  let testEntityId: string;
  let testSourceId: string;
  let testObservationId: string;

  beforeAll(async () => {
    // Create test data via CLI store-structured (writes to API server DB)
    const testDir = join(tmpdir(), `neotoma-cli-obs-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const entityFile = join(testDir, "obs-entity.json");
    await writeFile(entityFile, JSON.stringify({
      entities: [{
        entity_type: "company",
        canonical_name: "Observation Test Company",
        properties: { name: "Observation Test Company" }
      }]
    }));

    const { stdout } = await execAsync(
      `${CLI_PATH} store-structured --file-path "${entityFile}" --json`
    );
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
    testSourceId = result.source_id;
    testObservationId = result.entities?.[0]?.observation_id;

    // Fallback if response shape changes
    if (!testObservationId) {
      const { stdout: obsList } = await execAsync(
        `${CLI_PATH} observations list --entity-id "${testEntityId}" --json`
      );
      const obsResult = JSON.parse(obsList);
      testObservationId = obsResult.observations?.[0]?.id;
    }
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

      // Without --json, output is pretty-printed (may be JSON or table format)
      expect(stdout).toContain(testObservationId);
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
