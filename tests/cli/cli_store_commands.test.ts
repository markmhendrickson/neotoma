import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { db } from "../../src/db.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-store";

describe("CLI store commands", () => {
  const tracker = new TestIdTracker();
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("store command", () => {
    it("should store file with --file-path and --json output", async () => {
      const testFile = join(testDir, "test-invoice.json");
      await writeFile(
        testFile,
        JSON.stringify({
          invoice_number: "INV-001",
          amount: 1500,
          vendor: "Test Vendor",
        })
      );

      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      expect(stderr.replace(/Saved repo path[^\n]*\n?/g, "").trim()).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("source_id");
      expect(result).toHaveProperty("entities_created");
      expect(result).toHaveProperty("observations_created");

      tracker.trackSource(result.source_id);
    });

    it("stores files without interpretation flags", async () => {
      const testFile = join(testDir, "test-raw-store.txt");
      await writeFile(testFile, "Invoice from Acme Corp for $500");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result.interpretation_run_id).toBeUndefined();
      expect(result.source_id).toBeDefined();
    });

    it("should store file with --source-priority", async () => {
      const testFile = join(testDir, "test-priority.txt");
      await writeFile(testFile, "Test content");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --source-priority high --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });

    it("should store file with --idempotency-key", async () => {
      const testFile = join(testDir, "test-idempotency.txt");
      await writeFile(testFile, "Test content");
      const idempotencyKey = `test-key-${Date.now()}`;

      const { stdout: stdout1 } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --idempotency-key "${idempotencyKey}" --json`
      );

      const result1 = JSON.parse(stdout1);
      tracker.trackSource(result1.source_id);

      // Second call with same key should return same result
      const { stdout: stdout2 } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --idempotency-key "${idempotencyKey}" --json`
      );

      const result2 = JSON.parse(stdout2);
      expect(result2.source_id).toBe(result1.source_id);
    });

    it("should handle missing file gracefully", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} store --file-path "/nonexistent/file.txt" --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });

    it("should output pretty format without --json", async () => {
      const testFile = join(testDir, "test-pretty.txt");
      await writeFile(testFile, "Test content");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}"`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });

    it("should support combined structured and unstructured payload in one call", async () => {
      const testFile = join(testDir, "combined-store.txt");
      await writeFile(testFile, "Combined payload file");
      const entitiesJson = JSON.stringify([
        {
          entity_type: "task",
          title: "Combined store test task",
        },
      ]).replace(/"/g, '\\"');

      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} store --entities "${entitiesJson}" --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      expect(stderr.replace(/Saved repo path[^\n]*\n?/g, "").trim()).toBe("");
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("structured");
      expect(result).toHaveProperty("unstructured");
      expect(result.structured).toHaveProperty("entities");
      expect(result.unstructured).toHaveProperty("source_id");
      tracker.trackSource(result.unstructured.source_id);
    });

    it("should accept legacy --json=<entities> alias for structured store", async () => {
      const entitiesJson = JSON.stringify([
        {
          entity_type: "task",
          title: "Legacy json alias structured store",
        },
      ]).replace(/"/g, '\\"');

      const { stdout } = await execAsync(
        `${CLI_PATH} store --json="${entitiesJson}" --user-id "${TEST_USER_ID}"`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
      expect(Array.isArray(result.entities)).toBe(true);
      if (Array.isArray(result.entities)) {
        for (const entity of result.entities) {
          if (entity?.id) tracker.trackEntity(entity.id);
          if (entity?.entity_id) tracker.trackEntity(entity.entity_id);
        }
      }
    });
  });

  describe("store-turn command", () => {
    it("should store conversation, message, and extracted entities in one call", async () => {
      const extraEntities = JSON.stringify([
        { entity_type: "task", title: "Follow up with vendor" },
      ]).replace(/"/g, '\\"');

      const { stdout } = await execAsync(
        `${CLI_PATH} store-turn --conversation-title "CLI Turn Test" --message "User said hello" --entities "${extraEntities}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities");
      expect(Array.isArray(result.entities)).toBe(true);
      if (Array.isArray(result.entities)) {
        for (const entity of result.entities) {
          if (entity?.id) tracker.trackEntity(entity.id);
          if (entity?.entity_id) tracker.trackEntity(entity.entity_id);
        }
      }
    });

    it("should be replay-safe with idempotency key", async () => {
      const key = `store-turn-idem-${Date.now()}`;
      const cmd =
        `${CLI_PATH} store-turn --conversation-title "CLI Turn Idem" ` +
        `--message "User said hello twice" --idempotency-key "${key}" --user-id "${TEST_USER_ID}" --json`;

      const first = JSON.parse((await execAsync(cmd)).stdout);
      const second = JSON.parse((await execAsync(cmd)).stdout);

      expect(first.source_id).toBeDefined();
      expect(second.source_id).toBe(first.source_id);

      if (Array.isArray(first.entities)) {
        for (const entity of first.entities) {
          if (entity?.id) tracker.trackEntity(entity.id);
          if (entity?.entity_id) tracker.trackEntity(entity.entity_id);
        }
      }
    });

    it("should reuse one conversation entity for turns with the same conversation id", async () => {
      // Use a stable, deterministic conversation_id so the schema canonical_name_fields
      // rule fires on both calls and both resolve to the same entity without heuristic fallback.
      const conversationId = "test-conv-reuse-shared";
      const first = JSON.parse(
        (
          await execAsync(
            `${CLI_PATH} store-turn --conversation-id "${conversationId}" --conversation-title "CLI Shared Conversation" --turn-key "${conversationId}:1" --message "First turn" --user-id "${TEST_USER_ID}" --json`
          )
        ).stdout
      );
      const second = JSON.parse(
        (
          await execAsync(
            `${CLI_PATH} store-turn --conversation-id "${conversationId}" --conversation-title "CLI Shared Conversation" --turn-key "${conversationId}:2" --message "Second turn" --user-id "${TEST_USER_ID}" --json`
          )
        ).stdout
      );

      const firstConversation = (Array.isArray(first.entities) ? first.entities : []).find(
        (entity: any) => entity.entity_type === "conversation",
      );
      const secondConversation = (Array.isArray(second.entities) ? second.entities : []).find(
        (entity: any) => entity.entity_type === "conversation",
      );
      const firstConversationId = firstConversation?.entity_id ?? firstConversation?.id;
      const secondConversationId = secondConversation?.entity_id ?? secondConversation?.id;
      expect(firstConversationId).toBeDefined();
      expect(secondConversationId).toBe(firstConversationId);

      for (const result of [first, second]) {
        if (Array.isArray(result.entities)) {
          for (const entity of result.entities) {
            if (entity?.id) tracker.trackEntity(entity.id);
            if (entity?.entity_id) tracker.trackEntity(entity.entity_id);
          }
        }
      }
    });

    it("should generate default turn_key when omitted", async () => {
      const conversationTitle = `CLI Turn Defaults ${Date.now()}`;
      const result = JSON.parse(
        (
          await execAsync(
            `${CLI_PATH} store-turn --conversation-title "${conversationTitle}" --message "Default turn key" --user-id "${TEST_USER_ID}" --json`
          )
        ).stdout
      );

      const entities = Array.isArray(result.entities) ? result.entities : [];
      const messageEntity = entities.find(
        (entity: any) =>
          entity.entity_type === "conversation_message" ||
          entity.entity_type === "agent_message",
      );
      const messageEntityId = messageEntity?.entity_id ?? messageEntity?.id;
      expect(typeof messageEntityId).toBe("string");

      if (typeof messageEntityId === "string") {
        tracker.trackEntity(messageEntityId);
        const { data: snapshot } = await db
          .from("entity_snapshots")
          .select("snapshot")
          .eq("entity_id", messageEntityId)
          .maybeSingle();
        const turnKey = (snapshot?.snapshot as Record<string, unknown> | undefined)?.turn_key;
        expect(typeof turnKey).toBe("string");
        expect(String(turnKey)).toMatch(/^chat:\d+$/);
      }
    });

    it("should keep generated default turns in separate conversations", async () => {
      // Supply explicit per-call conversation_id values so the schema canonical_name_fields
      // rule fires and each call creates a distinct entity without relying on heuristic
      // title-matching (which is blocked by name_collision_policy: reject).
      const ts = Date.now();
      const firstConvId = `test-conv-isolated-a-${ts}`;
      const secondConvId = `test-conv-isolated-b-${ts}`;
      const first = JSON.parse(
        (
          await execAsync(
            `${CLI_PATH} store-turn --conversation-id "${firstConvId}" --conversation-title "CLI Default Isolated" --message "First default" --user-id "${TEST_USER_ID}" --json`
          )
        ).stdout
      );
      const second = JSON.parse(
        (
          await execAsync(
            `${CLI_PATH} store-turn --conversation-id "${secondConvId}" --conversation-title "CLI Default Isolated" --message "Second default" --user-id "${TEST_USER_ID}" --json`
          )
        ).stdout
      );

      const firstConversation = (Array.isArray(first.entities) ? first.entities : []).find(
        (entity: any) => entity.entity_type === "conversation",
      );
      const secondConversation = (Array.isArray(second.entities) ? second.entities : []).find(
        (entity: any) => entity.entity_type === "conversation",
      );
      const firstConversationId = firstConversation?.entity_id ?? firstConversation?.id;
      const secondConversationId = secondConversation?.entity_id ?? secondConversation?.id;
      expect(firstConversationId).toBeDefined();
      expect(secondConversationId).toBeDefined();
      expect(secondConversationId).not.toBe(firstConversationId);

      for (const result of [first, second]) {
        if (Array.isArray(result.entities)) {
          for (const entity of result.entities) {
            if (entity?.id) tracker.trackEntity(entity.id);
            if (entity?.entity_id) tracker.trackEntity(entity.entity_id);
          }
        }
      }
    });
  });

  describe("store --file (structured JSON payloads)", () => {
    it("should store structured data with --json", async () => {
      const testFile = join(testDir, "structured.json");
      await writeFile(
        testFile,
        JSON.stringify({
          entity_type: "transaction",
          amount: 100,
          description: "Test transaction",
        })
      );

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
      expect(result).toHaveProperty("entities_created");
    });

    it("should store structured data with entity_type in payload", async () => {
      const testFile = join(testDir, "structured-typed.json");
      await writeFile(
        testFile,
        JSON.stringify({
          entity_type: "company",
          name: "Test Company",
          industry: "Technology",
        })
      );

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });

    it("should handle invalid JSON gracefully", async () => {
      const testFile = join(testDir, "invalid.json");
      await writeFile(testFile, "{ invalid json }");

      await expect(
        execAsync(
          `${CLI_PATH} store --file "${testFile}" --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("store --file-path (raw file payloads)", () => {
    it("should store unstructured text with --json", async () => {
      const testFile = join(testDir, "unstructured.txt");
      await writeFile(testFile, "This is unstructured text content");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });

    it("stores unstructured text as a raw source", async () => {
      const testFile = join(testDir, "unstructured-raw.txt");
      await writeFile(testFile, "Meeting notes from Jan 15 with Bob Smith");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);
      expect(result.interpretation_run_id).toBeUndefined();
      expect(result.source_id).toBeDefined();
    });

    it("should handle empty file", async () => {
      const testFile = join(testDir, "empty.txt");
      await writeFile(testFile, "");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });
  });

  describe("file-content parameter", () => {
    it("should store via --file-content instead of --file-path", async () => {
      const content = JSON.stringify({ test: "data" });

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-content '${content}' --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });
  });

  describe("upload command", () => {
    it("should upload file with --json", async () => {
      const testFile = join(testDir, "upload-test.txt");
      await writeFile(testFile, "Upload command test content");

      const { stdout } = await execAsync(
        `${CLI_PATH} upload "${testFile}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("source_id");
      expect(result).toHaveProperty("file_size");
      tracker.trackSource(result.source_id);
    });

    it("should fail for missing upload file", async () => {
      await expect(
        execAsync(`${CLI_PATH} upload "/nonexistent/upload-file.txt" --json`)
      ).rejects.toThrow();
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success", async () => {
      const testFile = join(testDir, "exit-success.txt");
      await writeFile(testFile, "Test");

      try {
        await execAsync(
          `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
        );
        // If no error, exit code was 0
        expect(true).toBe(true);
      } catch (error: any) {
        const result = JSON.parse(error.stdout);
        tracker.trackSource(result.source_id);
        throw error;
      }
    });

    it("should return non-zero exit code on error", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} store --file-path "/nonexistent.txt" --user-id "${TEST_USER_ID}" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
