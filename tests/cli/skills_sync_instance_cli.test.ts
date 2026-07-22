/**
 * Behavioral coverage for the `neotoma skills sync` CLI action closure's
 * instance-skills/instance-scripts surface (`src/cli/index.ts`, the
 * `--include-instance-skills` / `--include-instance-scripts` /
 * `--approve-scripts` (plus its deprecated hidden alias `--approve`) flags
 * and the ~110 lines of report-rendering/exit-code logic that follow
 * `runInstanceSkillsSync`).
 *
 * `instance_skills.ts` and `instance_scripts.ts` already have thorough unit
 * coverage for their pure decision logic (materialization, pruning,
 * hash-pin consent, path-traversal rejection). This file targets the layer
 * those unit tests cannot reach: the actual Commander action closure —
 * flag parsing/coercion, the `includeInstanceScripts` implies
 * `includeInstanceSkills` boolean-OR, exit-code semantics, and `--json`
 * report shape — driven end to end via `runCli(argv)` with the global
 * `fetch` stubbed, matching the established pattern in
 * tests/cli/cli_issues_commands.test.ts (no network, no real HOME).
 *
 * NOTE ON `--approve` vs `--approve-scripts`: at the time this file was
 * written to cover the qa-lens BLOCKING finding on PR #1956, a separate,
 * already-in-flight change (commit 754350e32, addressing the ux-lens
 * non-blocking findings) renamed the flag from `--approve` to
 * `--approve-scripts` and added `--approve` back as a deprecated, hidden
 * alias (`Boolean(opts.approveScripts) || Boolean(opts.approve)`), plus a
 * `newlyApproved` field on written-script reports. Tests below exercise the
 * CURRENT interface post-754350e32 and explicitly cover the deprecated-alias
 * boolean-OR as its own case.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

type CliModule = { runCli: (argv: string[]) => Promise<void> };

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

async function withTempHome<T>(callback: (tempDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-skills-sync-"));
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

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  });
  return { output, restore: () => spy.mockRestore() };
}

// The non-JSON `skills sync` report renderer prints via `console.log` /
// `console.error` (not `process.stdout/stderr.write`), and vitest's own
// console interception binds to the ORIGINAL stream methods captured at
// startup -- ahead of both this test file's `process.stdout/stderr.write`
// spies AND the CLI's own log-file tee, which also rewraps those methods.
// Net effect: a `process.stdout/stderr.write` spy never observes
// `console.*` output in this harness. Match the pattern already used in
// tests/cli/cli_onboarding_commands.test.ts / test_command_detection.test.ts:
// spy on `console.log`/`console.error` directly for the non-JSON assertions
// below, and pass `--no-log-file` to keep the tee out of the picture.
function captureConsole(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.map((arg) => String(arg)).join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    output.push(args.map((arg) => String(arg)).join(" "));
  });
  return {
    output,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

const SKILL_ENTITY_ID = "ent_skill_1";
const ASSET_ENTITY_ID = "ent_asset_1";
const SOURCE_ID = "src_1";

/**
 * Builds a `fetch` mock that answers the exact four network calls
 * `runInstanceSkillsSync` makes when `--include-instance-scripts` is set:
 *   1. POST /entities/query            -> one enabled `skill` row
 *   2. POST /retrieve_related_entities  -> one EMBEDS relationship
 *   3. GET  /entities/{id}              -> the file_asset snapshot
 *   4. GET  /sources/{id}/content       -> the script bytes
 *
 * `scriptBytesOverride` lets tests induce a hash mismatch by serving bytes
 * that don't match the `content_hash` advertised in step 3.
 */
function makeInstanceFetchMock(opts: {
  scriptBytes: Buffer;
  advertisedHash?: string;
  originalFilename?: string;
}) {
  const advertisedHash = opts.advertisedHash ?? sha256(opts.scriptBytes);
  const originalFilename = opts.originalFilename ?? "score.py";

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = request?.url ?? String(input);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();

    if (url.includes("/entities/query") && method === "POST") {
      return new Response(
        JSON.stringify({
          entities: [
            {
              entity_id: SKILL_ENTITY_ID,
              snapshot: { name: "score-tool", enabled: true },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes("/retrieve_related_entities") && method === "POST") {
      return new Response(
        JSON.stringify({
          relationships: [
            {
              source_entity_id: SKILL_ENTITY_ID,
              target_entity_id: ASSET_ENTITY_ID,
              relationship_type: "EMBEDS",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes(`/entities/${ASSET_ENTITY_ID}`) && method === "GET") {
      return new Response(
        JSON.stringify({
          entity_id: ASSET_ENTITY_ID,
          snapshot: {
            source_id: SOURCE_ID,
            content_hash: advertisedHash,
            mime_type: "text/x-python",
            original_filename: originalFilename,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes(`/sources/${SOURCE_ID}/content`) && method === "GET") {
      return new Response(new Uint8Array(opts.scriptBytes), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    }

    throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
  });
}

describe("CLI `skills sync` instance-skills/instance-scripts action closure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.exitCode = undefined;
  });

  it("triggers instance sync when --include-instance-scripts is passed WITHOUT --include-instance-skills", async () => {
    await withTempHome(async () => {
      // No script attachments in this run: proves the `includeInstanceScripts
      // || includeInstanceSkills` implies-boolean at ~line 9045 alone is what
      // causes `runInstanceSkillsSync` to run (ran: true, skill row fetched),
      // not a separately-passed --include-instance-skills flag.
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = request?.url ?? String(input);
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
        if (url.includes("/entities/query") && method === "POST") {
          return new Response(JSON.stringify({ entities: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "skills", "sync", "--include-instance-scripts", "--json"]);
      } finally {
        stdout.restore();
      }

      // If includeInstanceSkills had NOT been implied true, runInstanceSkillsSync
      // would short-circuit (`ran: false`) and never call /entities/query.
      expect(fetchMock).toHaveBeenCalled();
      const calledQuery = fetchMock.mock.calls.some(([reqInput]) => {
        const req = reqInput instanceof Request ? reqInput : null;
        const url = req?.url ?? String(reqInput);
        return url.includes("/entities/query");
      });
      expect(calledQuery).toBe(true);

      const printed = JSON.parse(stdout.output.join(""));
      expect(printed.instance.ran).toBe(true);
    });
  });

  it("does NOT trigger instance sync when neither instance flag is passed", async () => {
    await withTempHome(async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error("fetch must not be called when neither instance flag is set");
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "skills", "sync", "--json"]);
      } finally {
        stdout.restore();
      }

      expect(fetchMock).not.toHaveBeenCalled();
      const printed = JSON.parse(stdout.output.join(""));
      expect(printed.instance).toBeNull();
    });
  });

  it("sets a nonzero exit code on a content_hash mismatch (console/non-JSON mode)", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("print('hello')\n");
      // Advertise a hash that does not match the served bytes.
      const fetchMock = makeInstanceFetchMock({
        scriptBytes: bytes,
        advertisedHash: "0".repeat(64),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const console_ = captureConsole();
      try {
        // NOTE: --json intentionally omitted here. The hashMismatches /
        // rejectedFilenames exit-code loops in src/cli/index.ts live AFTER
        // the `if (json) { ...; return; }` early-return, so in --json mode
        // they never run at all — see the dedicated gap test below. This
        // test exercises the actual `process.exitCode = 1` line via console
        // (non-JSON) output, the only mode that currently sets it.
        // `--no-log-file` avoids the CLI's own stdout/stderr tee, which is
        // irrelevant here since we assert on `console.*` calls directly.
        await runCli([
          "node",
          "cli",
          "skills",
          "sync",
          "--include-instance-scripts",
          "--approve-scripts",
          "--no-log-file",
        ]);
      } finally {
        console_.restore();
      }

      expect(console_.output.join("\n")).toContain("content_hash mismatch");
      expect(process.exitCode).toBe(1);
    });
  });

  it("sets a nonzero exit code on a rejected (path-traversal) filename (console/non-JSON mode)", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("print('hello')\n");
      const fetchMock = makeInstanceFetchMock({
        scriptBytes: bytes,
        originalFilename: "../../../../etc/passwd",
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const console_ = captureConsole();
      try {
        // See NOTE above: --json omitted deliberately for the same reason.
        await runCli([
          "node",
          "cli",
          "skills",
          "sync",
          "--include-instance-scripts",
          "--approve-scripts",
          "--no-log-file",
        ]);
      } finally {
        console_.restore();
      }

      expect(console_.output.join("\n")).toContain("script filename rejected");
      expect(process.exitCode).toBe(1);
    });
  });

  it("GAP: --json mode does NOT set a nonzero exit code on a content_hash mismatch (json branch returns before the exit-code loop runs)", async () => {
    await withTempHome(async () => {
      // Documents a real behavioral gap found while writing this coverage,
      // beyond what the qa review named: `if (json) { print; return; }` in
      // src/cli/index.ts precedes the `for (const m of s.hashMismatches)`
      // loop that sets process.exitCode = 1, so a --json invocation reports
      // the mismatch in its own JSON body but exits 0. A CI pipeline
      // scripting against --json output would not detect the failure via
      // exit code -- only by parsing the JSON body itself. Not fixed here
      // (out of the requested scope); asserting the CURRENT behavior so a
      // future fix intentionally flips this test rather than silently
      // regressing further.
      const bytes = Buffer.from("print('hello')\n");
      const fetchMock = makeInstanceFetchMock({
        scriptBytes: bytes,
        advertisedHash: "0".repeat(64),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli([
          "node",
          "cli",
          "skills",
          "sync",
          "--include-instance-scripts",
          "--approve-scripts",
          "--json",
        ]);
      } finally {
        stdout.restore();
      }

      const printed = JSON.parse(stdout.output.join(""));
      expect(printed.instance.scripts.hashMismatches).toHaveLength(1);
      // Current (arguably buggy) behavior: exit code is NOT set in --json mode.
      expect(process.exitCode).toBeUndefined();
    });
  });

  it("does NOT set a nonzero exit code when a script is blocked as unapproved (recoverable, expected)", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("print('hello')\n");
      // Valid hash, no --approve passed: this is the consent-blocked path,
      // not a data-integrity failure. The ux review explicitly praised the
      // `⚠` (blocked, recoverable) vs `✗` (hash/filename failure,
      // non-recoverable) severity split — assert exit code follows only the
      // latter.
      const fetchMock = makeInstanceFetchMock({ scriptBytes: bytes });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "skills", "sync", "--include-instance-scripts", "--json"]);
      } finally {
        stdout.restore();
      }

      const printed = JSON.parse(stdout.output.join(""));
      expect(printed.instance.scripts.blockedUnapproved).toHaveLength(1);
      expect(printed.instance.scripts.hashMismatches).toHaveLength(0);
      expect(printed.instance.scripts.rejectedFilenames).toHaveLength(0);
      expect(process.exitCode).toBeUndefined();
    });
  });

  it("does NOT set a nonzero exit code when a previously-approved script's hash changes (recoverable, expected)", async () => {
    await withTempHome(async (tempDir) => {
      const bytes = Buffer.from("print('hello')\n");
      const fetchMock = makeInstanceFetchMock({ scriptBytes: bytes });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();

      // First run with --approve-scripts pins the current hash as approved.
      const firstStdout = captureStdout();
      try {
        await runCli([
          "node",
          "cli",
          "skills",
          "sync",
          "--include-instance-scripts",
          "--approve-scripts",
          "--json",
        ]);
      } finally {
        firstStdout.restore();
      }
      process.exitCode = undefined;

      // Second run: content changed server-side, --approve-scripts NOT
      // passed this time -> blocked_hash_changed, still non-blocking on exit code.
      const changedBytes = Buffer.from("print('changed')\n");
      const secondFetchMock = makeInstanceFetchMock({ scriptBytes: changedBytes });
      vi.stubGlobal("fetch", secondFetchMock);

      const secondStdout = captureStdout();
      try {
        await runCli(["node", "cli", "skills", "sync", "--include-instance-scripts", "--json"]);
      } finally {
        secondStdout.restore();
      }

      const printed = JSON.parse(secondStdout.output.join(""));
      expect(printed.instance.scripts.blockedHashChanged).toHaveLength(1);
      expect(printed.instance.scripts.hashMismatches).toHaveLength(0);
      expect(printed.instance.scripts.rejectedFilenames).toHaveLength(0);
      expect(process.exitCode).toBeUndefined();
    });
  });

  it("includes the `instance` report key in --json output mode", async () => {
    await withTempHome(async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = request?.url ?? String(input);
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
        if (url.includes("/entities/query") && method === "POST") {
          return new Response(JSON.stringify({ entities: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "skills", "sync", "--include-instance-skills", "--json"]);
      } finally {
        stdout.restore();
      }

      const printed = JSON.parse(stdout.output.join(""));
      expect(printed).toHaveProperty("instance");
      expect(printed.instance).toMatchObject({ ran: true, skillsFetched: 0 });
    });
  });

  it("does not include an `instance` key's script report when --include-instance-scripts is absent", async () => {
    await withTempHome(async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = request?.url ?? String(input);
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
        if (url.includes("/entities/query") && method === "POST") {
          return new Response(JSON.stringify({ entities: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "skills", "sync", "--include-instance-skills", "--json"]);
      } finally {
        stdout.restore();
      }

      const printed = JSON.parse(stdout.output.join(""));
      expect(printed.instance.scripts).toBeUndefined();
    });
  });

  it("coerces --approve-scripts via Boolean(opts.approveScripts): passing it pins the hash so a repeat run with a changed hash blocks rather than re-writing silently", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("print('hello')\n");
      const fetchMock = makeInstanceFetchMock({ scriptBytes: bytes });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli([
          "node",
          "cli",
          "skills",
          "sync",
          "--include-instance-scripts",
          "--approve-scripts",
          "--json",
        ]);
      } finally {
        stdout.restore();
      }

      const printed = JSON.parse(stdout.output.join(""));
      // With --approve-scripts passed and a valid hash, the script is
      // written, not blocked -- proving `Boolean(opts.approveScripts)`
      // evaluated truthy and was threaded through to
      // `runInstanceSkillsSync`'s `approve` option. `newlyApproved` should
      // be true since this hash was not previously in the manifest.
      expect(printed.instance.scripts.written).toHaveLength(1);
      expect(printed.instance.scripts.written[0]).toMatchObject({ newlyApproved: true });
      expect(printed.instance.scripts.blockedUnapproved).toHaveLength(0);
      expect(process.exitCode).toBeUndefined();
    });
  });

  it("coerces the deprecated --approve alias via Boolean(opts.approve): still grants the same write/approval effect as --approve-scripts", async () => {
    await withTempHome(async () => {
      const bytes = Buffer.from("print('hello')\n");
      const fetchMock = makeInstanceFetchMock({ scriptBytes: bytes });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        // Deliberately using the deprecated, hidden `--approve` alias (NOT
        // `--approve-scripts`) to prove the boolean-OR coercion at
        // `Boolean(opts.approveScripts) || Boolean(opts.approve)` in
        // src/cli/index.ts still honors the old flag name for backward
        // compatibility.
        await runCli([
          "node",
          "cli",
          "skills",
          "sync",
          "--include-instance-scripts",
          "--approve",
          "--json",
        ]);
      } finally {
        stdout.restore();
      }

      const printed = JSON.parse(stdout.output.join(""));
      expect(printed.instance.scripts.written).toHaveLength(1);
      expect(printed.instance.scripts.written[0]).toMatchObject({ newlyApproved: true });
      expect(printed.instance.scripts.blockedUnapproved).toHaveLength(0);
      expect(process.exitCode).toBeUndefined();
    });
  });
});
