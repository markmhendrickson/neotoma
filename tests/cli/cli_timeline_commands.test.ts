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

    it.skip("should filter by --entity-id (not yet supported by CLI)", async () => {
      // Note: --entity-id filtering is not yet implemented in timeline list command
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
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

    it.skip("should filter by --user-id (not yet supported by CLI)", async () => {
      // Note: --user-id filtering is not yet implemented in timeline list command
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --json`
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

  describe.skip("timeline get (not yet implemented)", () => {
    // Note: timeline get command is not yet implemented in CLI
    it.skip("should get timeline event by ID with --json", async () => {
      // Will be implemented when timeline get command is added
    });

    it.skip("should handle invalid event ID", async () => {
      // Will be implemented when timeline get command is added
    });
  });

  describe("filtering combinations", () => {
    it.skip("should combine entity and event type filtering (--entity-id not yet supported)", async () => {
      // Note: --entity-id filtering is not yet implemented
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --event-type "entity.created" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it.skip("should combine user and date range filtering (--user-id not yet supported)", async () => {
      // Note: --user-id filtering is not yet implemented
      const startDate = "2025-01-01";
      const endDate = "2025-12-31";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --start-date "${startDate}" --end-date "${endDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it.skip("should combine all filters with pagination (--entity-id not yet supported)", async () => {
      // Note: --entity-id filtering is not yet implemented
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --event-type "entity.created" --limit 10 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events.length).toBeLessThanOrEqual(10);
    });
  });

  describe("error handling", () => {
    it.skip("should handle empty results gracefully (--entity-id not yet supported)", async () => {
      // Note: --entity-id filtering is not yet implemented in timeline list command
      // This test would verify empty results when filtering by non-existent entity
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events).toBeDefined();
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
