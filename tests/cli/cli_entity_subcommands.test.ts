/**
 * CLI entity subcommand tests
 *
 * Tests for entity subcommands not covered by cli_entity_commands.test.ts:
 * get, search (mock-fetch in-process), delete, restore, related, neighborhood (subprocess + real API).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-entity-subcmds";
const FAKE_ENTITY_ID = "ent_test_subcmd_abc123";

// ─── In-process helpers (mock-fetch pattern) ──────────────────────────────────

type CliModule = { runCli: (argv: string[]) => Promise<void> };

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-entity-sub-"));
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  try {
    return await callback(tempDir);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
  }
}

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
      return true;
    });
  return { output, restore: () => spy.mockRestore() };
}

async function withMockFetch<T>(
  responses: Record<string, unknown>,
  callback: (fetchMock: ReturnType<typeof vi.fn>, capturedBodies: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const capturedBodies: Record<string, unknown> = {};
  const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    // Capture request body
    if (init?.body) {
      try { capturedBodies[url] = JSON.parse(init.body as string); } catch { /* ignore */ }
    }
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    return await callback(fetchMock, capturedBodies);
  } finally {
    vi.unstubAllGlobals();
  }
}

async function setupConfig(homeDir: string): Promise<void> {
  const configDir = path.join(homeDir, ".config", "neotoma");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify({
      base_url: "http://localhost:9999",
      access_token: "token-test",
      expires_at: "2099-01-01T00:00:00Z",
    })
  );
}

// ─── Subprocess helpers (real local API) ─────────────────────────────────────

describe("CLI entity subcommands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── entities get (mock-fetch) ────────────────────────────────────────────────

  describe("entities get", () => {
    it("should get entity by ID and return entity data", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        await withMockFetch(
          {
            [`/entities/${FAKE_ENTITY_ID}`]: {
              id: FAKE_ENTITY_ID,
              entity_type: "company",
              canonical_name: "Test Company",
            },
          },
          async (fetchMock) => {
            const { runCli } = await loadCli();
            const stdout = captureStdout();
            try {
              await runCli(["node", "cli", "entities", "get", FAKE_ENTITY_ID, "--json"]);
            } finally {
              stdout.restore();
            }
            expect(fetchMock).toHaveBeenCalled();
            const result = JSON.parse(stdout.output.join(""));
            // CLI may return entity directly or nested under 'entity'
            const id = result.id ?? result.entity?.id;
            expect(id).toBe(FAKE_ENTITY_ID);
          }
        );
      });
    });

    it("should propagate 404 as an error for nonexistent entity", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        const fetchMock = vi.fn(async () =>
          new Response(JSON.stringify({ error: "Entity not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
        );
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        let threw = false;
        try {
          await runCli(["node", "cli", "entities", "get", "ent_notexist", "--json"]);
        } catch {
          threw = true;
        } finally {
          stdout.restore();
        }
        expect(threw).toBe(true);
      });
    });
  });

  // ── entities search (mock-fetch) ─────────────────────────────────────────────

  describe("entities search", () => {
    it("should search by identifier and return result", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        await withMockFetch(
          {
            "/retrieve_entity_by_identifier": {
              entity: { id: FAKE_ENTITY_ID, canonical_name: "Acme Corp" },
            },
          },
          async (fetchMock) => {
            const { runCli } = await loadCli();
            const stdout = captureStdout();
            try {
              await runCli(["node", "cli", "entities", "search", "Acme Corp", "--json"]);
            } finally {
              stdout.restore();
            }
            expect(fetchMock).toHaveBeenCalled();
            const result = JSON.parse(stdout.output.join(""));
            expect(result).toBeDefined();
          }
        );
      });
    });

    it("should pass --entity-type option to API call", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        let capturedBody: Record<string, unknown> = {};
        const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
          const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
          if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
          return new Response(JSON.stringify({ entity: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "search", "test", "--entity-type", "person", "--json"]);
        } finally {
          stdout.restore();
        }
        expect(capturedBody).toMatchObject({ entity_type: "person" });
      });
    });
  });

  // ── entities related (mock-fetch) ────────────────────────────────────────────

  describe("entities related", () => {
    it("should call retrieve_related_entities with entity ID", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        await withMockFetch(
          { "/retrieve_related_entities": { related_entities: [], paths: [] } },
          async (fetchMock) => {
            const { runCli } = await loadCli();
            const stdout = captureStdout();
            try {
              await runCli(["node", "cli", "entities", "related", FAKE_ENTITY_ID, "--json"]);
            } finally {
              stdout.restore();
            }
            expect(fetchMock).toHaveBeenCalled();
            const result = JSON.parse(stdout.output.join(""));
            expect(result).toBeDefined();
          }
        );
      });
    });

    it("should pass --direction option to API", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        let capturedBody: Record<string, unknown> = {};
        const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
          const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
          if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
          return new Response(JSON.stringify({ related_entities: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "related", FAKE_ENTITY_ID, "--direction", "outbound", "--json"]);
        } finally {
          stdout.restore();
        }
        expect(capturedBody).toMatchObject({ direction: "outbound" });
      });
    });

    it("should pass --max-hops option to API", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        let capturedBody: Record<string, unknown> = {};
        const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
          const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
          if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
          return new Response(JSON.stringify({ related_entities: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "related", FAKE_ENTITY_ID, "--max-hops", "2", "--json"]);
        } finally {
          stdout.restore();
        }
        expect(capturedBody).toMatchObject({ max_hops: 2 });
      });
    });
  });

  // ── entities neighborhood (mock-fetch) ───────────────────────────────────────

  describe("entities neighborhood", () => {
    it("should call retrieve_graph_neighborhood with node ID", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        await withMockFetch(
          { "/retrieve_graph_neighborhood": { nodes: [], edges: [] } },
          async (fetchMock) => {
            const { runCli } = await loadCli();
            const stdout = captureStdout();
            try {
              await runCli(["node", "cli", "entities", "neighborhood", FAKE_ENTITY_ID, "--json"]);
            } finally {
              stdout.restore();
            }
            expect(fetchMock).toHaveBeenCalled();
            const result = JSON.parse(stdout.output.join(""));
            expect(result).toBeDefined();
          }
        );
      });
    });

    it("should pass --node-type option to API", async () => {
      await withTempHome(async (homeDir) => {
        await setupConfig(homeDir);
        let capturedBody: Record<string, unknown> = {};
        const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
          const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
          if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
          return new Response(JSON.stringify({ nodes: [], edges: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "neighborhood", FAKE_ENTITY_ID, "--node-type", "source", "--json"]);
        } finally {
          stdout.restore();
        }
        expect(capturedBody).toMatchObject({ node_type: "source" });
      });
    });
  });

  // ── entities delete / restore (subprocess + real local API) ──────────────────

  describe("entities delete", () => {
    const tracker = new TestIdTracker();
    afterEach(async () => { await tracker.cleanup(); });

    it("should soft-delete entity with --json", async () => {
      const deleteId = await createTestEntity({
        entity_type: "task",
        canonical_name: "Delete Target Task",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(deleteId);

      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} entities delete "${deleteId}" task --user-id "${TEST_USER_ID}" --json`
      );
      expect(stderr).toBe("");
      const result = JSON.parse(stdout);
      expect(result).toBeDefined();
    });

    it("should accept --reason option on delete", async () => {
      const deleteId = await createTestEntity({
        entity_type: "task",
        canonical_name: "Delete With Reason Task",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(deleteId);

      const { stdout } = await execAsync(
        `${CLI_PATH} entities delete "${deleteId}" task --user-id "${TEST_USER_ID}" --reason "test cleanup" --json`
      );
      const result = JSON.parse(stdout);
      expect(result).toBeDefined();
    });
  });

  describe("entities restore", () => {
    const tracker = new TestIdTracker();
    afterEach(async () => { await tracker.cleanup(); });

    it("should restore a deleted entity with --json", async () => {
      const restoreId = await createTestEntity({
        entity_type: "task",
        canonical_name: "Restore Target Task",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(restoreId);

      await execAsync(`${CLI_PATH} entities delete "${restoreId}" task --user-id "${TEST_USER_ID}" --json`);

      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} entities restore "${restoreId}" task --user-id "${TEST_USER_ID}" --json`
      );
      expect(stderr).toBe("");
      const result = JSON.parse(stdout);
      expect(result).toBeDefined();
    });

    it("should accept --reason option on restore", async () => {
      const restoreId = await createTestEntity({
        entity_type: "task",
        canonical_name: "Restore With Reason Task",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(restoreId);

      await execAsync(`${CLI_PATH} entities delete "${restoreId}" task --user-id "${TEST_USER_ID}" --json`);
      const { stdout } = await execAsync(
        `${CLI_PATH} entities restore "${restoreId}" task --user-id "${TEST_USER_ID}" --reason "undo deletion" --json`
      );
      const result = JSON.parse(stdout);
      expect(result).toBeDefined();
    });
  });
});
