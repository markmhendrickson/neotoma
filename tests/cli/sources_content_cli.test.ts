/**
 * Behavioral coverage for `neotoma sources content <id>` — the CLI review
 * command added to close the ux/Accipiter BLOCKING finding on PR #1956
 * ("broken-trust-workflow"): the documented instance-script consent
 * workflow told the operator to run `neotoma entities get
 * <file_asset-entity-id>` to review a blocked script's bytes before
 * `--approve-scripts`, but that command only ever returns the entity's
 * metadata snapshot (hash, filename), never the actual byte content — the
 * bytes are reachable only via `GET /sources/:id/content`, which had no CLI
 * surface. `sources content` reuses the existing `downloadSourceBytes`
 * client function (`src/cli/instance_skills_client.ts`) — the same
 * function `runInstanceSkillsSync` already calls to fetch script bytes —
 * rather than inventing a second byte-fetch path.
 *
 * Mocking pattern: `vi.stubGlobal("fetch", ...)` driven end to end via
 * `runCli(argv)`, matching tests/cli/skills_sync_instance_cli.test.ts and
 * tests/cli/instance_skills_client.test.ts.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type CliModule = { runCli: (argv: string[]) => Promise<void> };

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

async function withTempHome<T>(callback: (tempDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-sources-content-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  try {
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
    return await callback(tempDir);
  } finally {
    process.env.HOME = previousHome;
    process.env.USERPROFILE = previousUserProfile;
  }
}

function captureStdout(): { output: (string | Buffer)[]; restore: () => void } {
  const output: (string | Buffer)[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    output.push(chunk as string | Buffer);
    return true;
  });
  return { output, restore: () => spy.mockRestore() };
}

function captureStderr(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  });
  return { output, restore: () => spy.mockRestore() };
}

const SOURCE_ID = "src_1";

function requestUrlAndMethod(input: RequestInfo | URL, init?: RequestInit): [string, string] {
  const request = input instanceof Request ? input : null;
  const url = request?.url ?? String(input);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  return [url, method];
}

describe("CLI `sources content` command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.exitCode = undefined;
  });

  it("prints the source's raw byte content to stdout on success", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("#!/bin/sh\necho hello\n");
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes(`/sources/${SOURCE_ID}/content`) && method === "GET") {
          return new Response(new Uint8Array(bytes), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "sources", "content", SOURCE_ID]);
      } finally {
        stdout.restore();
      }

      const written = Buffer.concat(
        stdout.output.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      );
      expect(written.equals(bytes)).toBe(true);
      expect(process.exitCode).toBeUndefined();
    });
  });

  it("accepts --source-id as an alternative to the positional argument", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("print('hi')\n");
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes(`/sources/${SOURCE_ID}/content`) && method === "GET") {
          return new Response(new Uint8Array(bytes), { status: 200 });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "sources", "content", "--source-id", SOURCE_ID]);
      } finally {
        stdout.restore();
      }

      const written = Buffer.concat(
        stdout.output.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      );
      expect(written.equals(bytes)).toBe(true);
    });
  });

  it("warns on stderr (but still writes bytes) when content is not valid UTF-8", async () => {
    await withTempHome(async () => {
      // Invalid UTF-8: a lone continuation byte.
      const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes(`/sources/${SOURCE_ID}/content`) && method === "GET") {
          return new Response(new Uint8Array(bytes), { status: 200 });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      const stderr = captureStderr();
      try {
        await runCli(["node", "cli", "sources", "content", SOURCE_ID]);
      } finally {
        stdout.restore();
        stderr.restore();
      }

      expect(stderr.output.join("")).toContain("not valid UTF-8");
      const written = Buffer.concat(
        stdout.output.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      );
      expect(written.equals(bytes)).toBe(true);
    });
  });

  it("does not warn when content is valid UTF-8 text", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("hola, mundo\n", "utf8");
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes(`/sources/${SOURCE_ID}/content`) && method === "GET") {
          return new Response(new Uint8Array(bytes), { status: 200 });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      const stderr = captureStderr();
      try {
        await runCli(["node", "cli", "sources", "content", SOURCE_ID]);
      } finally {
        stdout.restore();
        stderr.restore();
      }

      // Unrelated CLI startup noise (e.g. "Saved Neotoma path to config...")
      // may also land on stderr in this harness; assert only that the
      // UTF-8 warning this test targets was not among it.
      expect(stderr.output.join("")).not.toContain("not valid UTF-8");
    });
  });

  it("surfaces a clean error for a nonexistent/errored source (nonzero exit via the CLI's top-level error handler)", async () => {
    await withTempHome(async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/sources/src_missing/content") && method === "GET") {
          return new Response("not found", { status: 404 });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      // Action-closure errors propagate out of `runCli` as a rejected promise
      // (Commander does not swallow them); the real CLI entrypoint catches
      // this at the top level via `writeCliError` + `process.exit(1)` — see
      // `isMain` block at the bottom of src/cli/index.ts. Matches the
      // established pattern for command error-path tests (e.g.
      // tests/cli/cli_entity_commands.test.ts's "entities get" invalid-id
      // case).
      await expect(
        runCli(["node", "cli", "sources", "content", "src_missing", "--no-log-file"])
      ).rejects.toThrow(/Failed to get source content.*404/s);
    });
  });

  it("requires an id (positional or --source-id)", async () => {
    await withTempHome(async () => {
      const { runCli } = await loadCli();
      await expect(runCli(["node", "cli", "sources", "content", "--no-log-file"])).rejects.toThrow(
        /Source ID is required/
      );
    });
  });
});
