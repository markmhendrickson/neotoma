/**
 * CLI `entities import` tests (in-process, mock-fetch).
 *
 * Covers issue #1470: a bulk-import path that reads a JSONL file, chunks the
 * entities into batched POST /store calls, and is idempotent on re-run. The
 * store endpoint already writes each batch transactionally; this command owns
 * file reading, chunking, and per-chunk idempotency keys.
 *
 * Verifies the user-observable behavior end-to-end: file -> chunked /store
 * calls with correct batch boundaries, idempotency keys, and a dry-run default.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";

type CliModule = { runCli: (argv: string[]) => Promise<void> };

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  });
  return { output, restore: () => spy.mockRestore() };
}

interface StoreCall {
  entities: unknown[];
  idempotency_key: string;
  commit: boolean;
}

async function withStoreMock<T>(
  callback: (storeCalls: StoreCall[]) => Promise<T>
): Promise<T> {
  const storeCalls: StoreCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/store")) {
      // The api client may pass the body via init.body (string) or as a
      // Request object (first arg). Read whichever is present.
      let bodyText: string | undefined;
      if (typeof init?.body === "string") {
        bodyText = init.body;
      } else if (typeof input !== "string" && typeof (input as Request).clone === "function") {
        bodyText = await (input as Request).clone().text();
      }
      if (bodyText) {
        try {
          storeCalls.push(JSON.parse(bodyText) as StoreCall);
        } catch {
          /* ignore */
        }
      }
    }
    return new Response(JSON.stringify({ entities: [], unknown_fields_count: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    return await callback(storeCalls);
  } finally {
    vi.unstubAllGlobals();
  }
}

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-import-"));
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  const configDir = path.join(tempDir, ".config", "neotoma");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify({
      base_url: "http://localhost:9999",
      access_token: "token-test",
      expires_at: "2099-01-01T00:00:00Z",
    })
  );
  try {
    return await callback(tempDir);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
  }
}

async function writeJsonl(dir: string, count: number): Promise<string> {
  const file = path.join(dir, "entities.jsonl");
  const lines = Array.from({ length: count }, (_, i) =>
    JSON.stringify({ entity_type: "thing", canonical_name: `thing-${i}` })
  );
  await fs.writeFile(file, lines.join("\n") + "\n");
  return file;
}

describe("CLI entities import (#1470 bulk import)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("chunks a JSONL file into batched /store calls with per-chunk idempotency keys", async () => {
    await withTempHome(async (home) => {
      const file = await writeJsonl(home, 5);
      await withStoreMock(async (storeCalls) => {
        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli([
            "node",
            "cli",
            "entities",
            "import",
            file,
            "--batch-size",
            "2",
            "--commit",
            "--json",
          ]);
        } finally {
          stdout.restore();
        }

        // 5 entities at batch size 2 => 3 chunks (2, 2, 1)
        expect(storeCalls.length).toBe(3);
        expect((storeCalls[0].entities as unknown[]).length).toBe(2);
        expect((storeCalls[1].entities as unknown[]).length).toBe(2);
        expect((storeCalls[2].entities as unknown[]).length).toBe(1);

        // Per-chunk idempotency keys are distinct and stable (indexed)
        const keys = storeCalls.map((c) => c.idempotency_key);
        expect(new Set(keys).size).toBe(3);
        expect(keys[0].endsWith(":0")).toBe(true);
        expect(keys[2].endsWith(":2")).toBe(true);

        // --commit was honored
        expect(storeCalls.every((c) => c.commit === true)).toBe(true);
      });
    });
  });

  it("defaults to dry-run (commit=false) when --commit is omitted", async () => {
    await withTempHome(async (home) => {
      const file = await writeJsonl(home, 3);
      await withStoreMock(async (storeCalls) => {
        const { runCli } = await loadCli();
        const stdout = captureStdout();
        try {
          await runCli(["node", "cli", "entities", "import", file, "--json"]);
        } finally {
          stdout.restore();
        }
        expect(storeCalls.length).toBe(1);
        expect(storeCalls[0].commit).toBe(false);
      });
    });
  });

  it("re-running with the same file uses identical idempotency keys (safe replay)", async () => {
    await withTempHome(async (home) => {
      const file = await writeJsonl(home, 4);
      await withStoreMock(async (storeCalls) => {
        const { runCli } = await loadCli();
        const run = async () => {
          const stdout = captureStdout();
          try {
            await runCli(["node", "cli", "entities", "import", file, "--batch-size", "2", "--json"]);
          } finally {
            stdout.restore();
          }
        };
        await run();
        const firstKeys = storeCalls.map((c) => c.idempotency_key);
        await run();
        const secondKeys = storeCalls.slice(firstKeys.length).map((c) => c.idempotency_key);
        expect(secondKeys).toEqual(firstKeys);
      });
    });
  });
});
