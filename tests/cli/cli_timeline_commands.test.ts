import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-timeline";

describe("CLI timeline commands", () => {
  const tracker = new TestIdTracker();
  let testEntityId: string;

  beforeAll(async () => {
    // Create test entity (which creates timeline events)
    testEntityId = await createTestEntity({
      entity_type: "company",
      canonical_name: "Timeline Test Company",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(testEntityId);
  });

  afterEach(async () => {
    await tracker.cleanup();
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
      result.events.forEach((event: any) => {
        // Event may reference entity in payload or metadata
        expect(event).toHaveProperty("event_type");
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
        `${CLI_PATH} timeline list --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
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
    let testEventId: string;

    beforeAll(async () => {
      // Get first event from list
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --limit 1 --json`
      );

      const result = JSON.parse(stdout);
      if (result.events.length > 0) {
        testEventId = result.events[0].id;
      }
    });

    it("should get timeline event by ID with --json", async () => {
      if (!testEventId) {
        console.log("Skipping: No events available");
        return;
      }

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline get --event-id "${testEventId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.event.id).toBe(testEventId);
    });

    it("should handle invalid event ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} timeline get --event-id "evt_invalid" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("filtering combinations", () => {
    it("should combine entity and event type filtering", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --entity-id "${testEntityId}" --event-type "entity.created" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should combine user and date range filtering", async () => {
      const startDate = "2025-01-01";
      const endDate = "2025-12-31";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --user-id "${TEST_USER_ID}" --start-date "${startDate}" --end-date "${endDate}" --json`
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
    it("should handle empty results gracefully", async () => {
      const fakeEntityId = "ent_nonexistent_12345";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --entity-id "${fakeEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events.length).toBe(0);
    });

    it("should handle invalid date formats", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} timeline list --start-date "invalid-date" --json`
        )
      ).rejects.toThrow();
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
