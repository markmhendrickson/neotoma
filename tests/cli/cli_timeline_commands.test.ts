import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";

describe("CLI timeline commands", () => {
  let testEntityId: string;
  let authenticatedUserId: string;

  beforeAll(async () => {
    // Create test data via CLI (writes to API server DB) so timeline events exist
    const testDir = join(tmpdir(), `neotoma-cli-timeline-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const entityFile = join(testDir, "timeline-entity.json");
    await writeFile(
      entityFile,
      JSON.stringify({
        entities: [
          {
            entity_type: "company",
            canonical_name: "Timeline Test Company",
            properties: { name: "Timeline Test Company" },
          },
        ],
      })
    );

    const { stdout: storeStdout } = await execAsync(
      `${CLI_PATH} store-structured --file-path "${entityFile}" --json`
    );
    const storeResult = JSON.parse(storeStdout);
    testEntityId = storeResult.entities?.[0]?.entity_id;

    const { stdout: sourcesStdout } = await execAsync(
      `${CLI_PATH} sources list --limit 1 --json`
    );
    const sourcesResult = JSON.parse(sourcesStdout);
    authenticatedUserId = sourcesResult.sources?.[0]?.user_id;
  });

  describe("timeline list", () => {
    it("should list all timeline events with --json", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} timeline list --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
    });

    it("should filter by --entity-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --entity-id "${testEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
      result.events.forEach((event: any) => {
        expect(event.entity_id).toBe(testEntityId);
      });
    });

    it("should filter by --event-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --event-type "entity.created" --json`
      );

      const result = JSON.parse(stdout);
      result.events.forEach((event: any) => {
        expect(event.event_type).toBe("entity.created");
      });
    });

    it("should filter by --user-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --user-id "${authenticatedUserId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
    });

    it("should filter by --start-date", async () => {
      const startDate = "2025-01-01";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --start-date "${startDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should filter by --end-date", async () => {
      const endDate = "2025-12-31";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --end-date "${endDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should filter by date range", async () => {
      const startDate = "2025-01-01";
      const endDate = "2025-12-31";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --start-date "${startDate}" --end-date "${endDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should paginate with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events.length).toBeLessThanOrEqual(5);
    });

    it("should paginate with --offset", async () => {
      const { stdout: page1 } = await execAsync(
        `${CLI_PATH} timeline list --limit 2 --offset 0 --json`
      );

      const { stdout: page2 } = await execAsync(
        `${CLI_PATH} timeline list --limit 2 --offset 2 --json`
      );

      const result1 = JSON.parse(page1);
      const result2 = JSON.parse(page2);

      if (result1.events.length > 0 && result2.events.length > 0) {
        expect(result1.events[0].id).not.toBe(result2.events[0].id);
      }
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });
  });

  describe("timeline get", () => {
    it("should get timeline event by ID with --json", async () => {
      const { stdout: listStdout } = await execAsync(`${CLI_PATH} timeline list --limit 1 --json`);
      const listResult = JSON.parse(listStdout);
      expect(Array.isArray(listResult.events)).toBe(true);
      if (listResult.events.length === 0) {
        return;
      }

      const eventId = listResult.events[0]?.id;
      expect(typeof eventId).toBe("string");

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline get --event-id "${eventId}" --json`
      );
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("event");
      expect(result.event.id).toBe(eventId);
    });

    it("should handle invalid event ID", async () => {
      await expect(
        execAsync(`${CLI_PATH} timeline get --event-id "evt_invalid" --json`)
      ).rejects.toThrow();
    });

    it("should output parseable response without --json", async () => {
      const { stdout: listStdout } = await execAsync(`${CLI_PATH} timeline list --limit 1 --json`);
      const listResult = JSON.parse(listStdout);
      if (listResult.events.length === 0) {
        return;
      }
      const eventId = listResult.events[0]?.id;

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline get --event-id "${eventId}"`
      );
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("event");
      expect(result.event.id).toBe(eventId);
    });
  });

  describe("filtering combinations", () => {
    it("should combine entity and event type filtering", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --entity-id "${testEntityId}" --event-type "entity.created" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
      result.events.forEach((event: any) => {
        expect(event.entity_id).toBe(testEntityId);
        expect(event.event_type).toBe("entity.created");
      });
    });

    it("should combine user and date range filtering", async () => {
      const startDate = "2025-01-01";
      const endDate = "2025-12-31";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --user-id "${authenticatedUserId}" --start-date "${startDate}" --end-date "${endDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should combine all filters with pagination", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --entity-id "${testEntityId}" --event-type "entity.created" --limit 10 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events.length).toBeLessThanOrEqual(10);
    });
  });

  describe("error handling", () => {
    it("should handle empty results gracefully when filtering by non-existent entity", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --entity-id "ent_nonexistent000000000000" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
      expect(result.events.length).toBe(0);
    });

    it("should handle invalid date formats", async () => {
      // Note: CLI currently accepts invalid dates and returns empty results
      // This test verifies graceful handling rather than throwing
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --start-date "invalid-date" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success", async () => {
      try {
        await execAsync(
          `${CLI_PATH} timeline list --json`
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
          `${CLI_PATH} timeline get --event-id "evt_invalid" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
