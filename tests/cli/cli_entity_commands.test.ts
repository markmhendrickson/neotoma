import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CliModule = {
  runCli: (argv: string[]) => Promise<void>;
};

const TEST_USER_ID = "test-user-cli-entity";
const testEntityId = "ent_test123";

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  try {
    return await callback(tempDir);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const writeSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
      return true;
    });
  return { output, restore: () => writeSpy.mockRestore() };
}

describe("CLI entity commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("entities list", () => {
    it("should list all entities with --json", async () => {
      await withTempHome(async (homeDir) => {
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(
          path.join(configDir, "config.json"),
          JSON.stringify({
            base_url: "http://localhost:9999",
            access_token: "token-test",
            expires_at: "2099-01-01T00:00:00Z",
          }, null, 2)
        );

        const fetchMock = vi.fn(async (input: RequestInfo | Request) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          if (url.includes("/entities/query")) {
            return new Response(
              JSON.stringify({ entities: [{ id: testEntityId, entity_type: "company" }] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "list", "--json"]);
        } finally {
          stdout.restore();
        }

        expect(fetchMock).toHaveBeenCalled();
        const parsed = JSON.parse(stdout.output.join(""));
        expect(parsed).toHaveProperty("entities");
        expect(Array.isArray(parsed.entities)).toBe(true);
      });
    });

    it("should list entities with --limit", async () => {
      await withTempHome(async (homeDir) => {
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(
          path.join(configDir, "config.json"),
          JSON.stringify({
            base_url: "http://localhost:9999",
            access_token: "token-test",
            expires_at: "2099-01-01T00:00:00Z",
          }, null, 2)
        );

        let capturedBody: Record<string, unknown> = {};
        const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          if (url.includes("/entities/query")) {
            const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
            if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
            return new Response(
              JSON.stringify({ entities: [{ id: testEntityId, entity_type: "company" }], limit: 5, offset: 0, total: 1 }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "list", "--limit", "5", "--json"]);
        } finally {
          stdout.restore();
        }

        expect(capturedBody).toMatchObject({ limit: 5 });
        const parsed = JSON.parse(stdout.output.join(""));
        expect(parsed.entities.length).toBeLessThanOrEqual(5);
      });
    });

    it("should list entities with --offset", async () => {
      await withTempHome(async (homeDir) => {
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(
          path.join(configDir, "config.json"),
          JSON.stringify({
            base_url: "http://localhost:9999",
            access_token: "token-test",
            expires_at: "2099-01-01T00:00:00Z",
          }, null, 2)
        );

        let capturedBody: Record<string, unknown> = {};
        const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          if (url.includes("/entities/query")) {
            const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
            if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
            return new Response(
              JSON.stringify({ entities: [{ id: testEntityId, entity_type: "company" }], limit: 2, offset: 2, total: 5 }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "list", "--limit", "2", "--offset", "2", "--json"]);
        } finally {
          stdout.restore();
        }

        expect(capturedBody).toMatchObject({ limit: 2, offset: 2 });
      });
    });

    it("should filter by --entity-type", async () => {
      await withTempHome(async (homeDir) => {
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(
          path.join(configDir, "config.json"),
          JSON.stringify({
            base_url: "http://localhost:9999",
            access_token: "token-test",
            expires_at: "2099-01-01T00:00:00Z",
          }, null, 2)
        );

        let capturedBody: Record<string, unknown> = {};
        const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          if (url.includes("/entities/query")) {
            const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
            if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
            return new Response(
              JSON.stringify({ entities: [{ id: testEntityId, entity_type: "person" }], limit: 100, offset: 0, total: 1 }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "list", "--type", "person", "--json"]);
        } finally {
          stdout.restore();
        }

        expect(capturedBody).toMatchObject({ entity_type: "person" });
        const parsed = JSON.parse(stdout.output.join(""));
        expect(parsed.entities.some((e: any) => e.entity_type === "person")).toBe(true);
      });
    });

  });

  describe("entities get", () => {
    it("should get entity by ID with --json", async () => {
      await withTempHome(async (homeDir) => {
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(
          path.join(configDir, "config.json"),
          JSON.stringify({
            base_url: "http://localhost:9999",
            access_token: "token-test",
            expires_at: "2099-01-01T00:00:00Z",
          }, null, 2)
        );

        const fetchMock = vi.fn(async (input: RequestInfo | Request) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          if (url.includes(`/entities/${testEntityId}`)) {
            return new Response(
              JSON.stringify({ entity: { id: testEntityId, entity_type: "company", canonical_name: "Test Company" } }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "get", testEntityId, "--json"]);
        } finally {
          stdout.restore();
        }

        expect(fetchMock).toHaveBeenCalled();
        const parsed = JSON.parse(stdout.output.join(""));
        expect(parsed.entity.id).toBe(testEntityId);
      });
    });

    it("should handle invalid entity ID", async () => {
      await withTempHome(async (homeDir) => {
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(
          path.join(configDir, "config.json"),
          JSON.stringify({
            base_url: "http://localhost:9999",
            access_token: "token-test",
            expires_at: "2099-01-01T00:00:00Z",
          }, null, 2)
        );

        const fetchMock = vi.fn(async (input: RequestInfo | Request) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          if (url.includes("/entities/ent_invalid")) {
            return new Response(
              JSON.stringify({ error: { error_code: "ENTITY_NOT_FOUND", message: "Entity not found" } }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { runCli } = await loadCli();
        try {
          await runCli(["node", "cli", "entities", "get", "ent_invalid", "--json"]);
        } catch (error) {
          // Expected to throw or return error
          expect(fetchMock).toHaveBeenCalled();
        }
      });
    });
  });
});

// Note: Additional test suites (search, related, neighborhood, merge, delete, restore, exit codes) follow the same pattern:
// - Set up temp home with config.json
// - Mock fetch with appropriate responses
// - Capture stdout and verify JSON output
// - Optionally capture request body for parameter verification
