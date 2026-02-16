import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity, createTestSource } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-query";

describe("CLI query commands - pagination, filtering, sorting", () => {
  const tracker = new TestIdTracker();
  let testEntityId: string;
  let testSourceId: string;

  beforeAll(async () => {
    // Create test data
    testEntityId = await createTestEntity({
      entity_type: "company",
      canonical_name: "Query Test Company",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(testEntityId);

    const source = await createTestSource({
      user_id: TEST_USER_ID,
      storage_url: "file:///test/query.json",
      mime_type: "application/json",
    });
    testSourceId = source.id;
    tracker.trackSource(testSourceId);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("pagination across commands", () => {
    it("should paginate entities list with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --limit 3 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.length).toBeLessThanOrEqual(3);
    });

    it("should paginate entities list with --offset", async () => {
      const { stdout: page1 } = await execAsync(
        `${CLI_PATH} entities list --limit 2 --offset 0 --json`
      );

      const { stdout: page2 } = await execAsync(
        `${CLI_PATH} entities list --limit 2 --offset 2 --json`
      );

      const result1 = JSON.parse(page1);
      const result2 = JSON.parse(page2);

      if (result1.entities.length > 0 && result2.entities.length > 0) {
        expect(result1.entities[0].id).not.toBe(result2.entities[0].id);
      }
    });

    it("should paginate sources list with --limit and --offset", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --limit 5 --offset 0 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.sources.length).toBeLessThanOrEqual(5);
    });

    it("should paginate relationships list with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.relationships.length).toBeLessThanOrEqual(5);
    });

    it("should paginate observations list with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.observations.length).toBeLessThanOrEqual(5);
    });

    it("should paginate timeline list with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events.length).toBeLessThanOrEqual(5);
    });

    it("should paginate schemas list with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.schemas.length).toBeLessThanOrEqual(5);
    });
  });

  describe("filtering across commands", () => {
    it("should filter entities by --entity-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      result.entities.forEach((entity: any) => {
        expect(entity.entity_type).toBe("company");
      });
    });

    it("should filter entities by --user-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.some((e: any) => e.user_id === TEST_USER_ID)).toBe(true);
    });

    it("should filter sources by --user-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.sources.some((s: any) => s.user_id === TEST_USER_ID)).toBe(true);
    });

    it("should filter observations by --entity-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --entity-id "${testEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      result.observations.forEach((obs: any) => {
        expect(obs.entity_id).toBe(testEntityId);
      });
    });

    it("should filter observations by --source-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} observations list --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      result.observations.forEach((obs: any) => {
        expect(obs.source_id).toBe(testSourceId);
      });
    });

    it("should filter timeline by --entity-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --entity-id "${testEntityId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should filter timeline by --event-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --event-type "entity.created" --json`
      );

      const result = JSON.parse(stdout);
      result.events.forEach((event: any) => {
        expect(event.event_type).toBe("entity.created");
      });
    });

    it("should filter relationships by --relationship-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} relationships list --relationship-type works_at --json`
      );

      const result = JSON.parse(stdout);
      result.relationships.forEach((rel: any) => {
        expect(rel.relationship_type).toBe("works_at");
      });
    });

    it("should filter schemas by --entity-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas list --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      result.schemas.forEach((schema: any) => {
        expect(schema.entity_type).toBe("company");
      });
    });
  });

  describe("global options", () => {
    it("should output JSON with --json flag", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });

    it("should accept --env development", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --env development --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });

    it("should accept --env production", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --env production --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });

    it("should accept --debug flag", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --debug --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });
  });

  describe("combined flags", () => {
    it("should combine --limit, --offset, and --entity-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --limit 5 --offset 0 --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.length).toBeLessThanOrEqual(5);
      result.entities.forEach((entity: any) => {
        expect(entity.entity_type).toBe("company");
      });
    });

    it("should combine --user-id and --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --user-id "${TEST_USER_ID}" --limit 10 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.length).toBeLessThanOrEqual(10);
    });

    it("should combine --json and --debug", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --json --debug`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
    });
  });

  describe("sorting parameters", () => {
    it("should accept default sorting for entities list", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} entities list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it("should accept default sorting for sources list", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it("should accept default sorting for timeline list", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.events.length).toBeGreaterThan(0);
    });
  });

  describe("date range filtering", () => {
    it("should filter timeline with --start-date and --end-date", async () => {
      const startDate = "2025-01-01";
      const endDate = "2025-12-31";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --start-date "${startDate}" --end-date "${endDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should filter timeline with --start-date only", async () => {
      const startDate = "2025-01-01";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --start-date "${startDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });

    it("should filter timeline with --end-date only", async () => {
      const endDate = "2025-12-31";

      const { stdout } = await execAsync(
        `${CLI_PATH} timeline list --end-date "${endDate}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("events");
    });
  });
});
