/**
 * Integration test for the cursor-hooks failure-signal accumulator.
 *
 * Drives the compiled cursor hook scripts via spawned `node dist/...js`
 * processes with crafted JSON on stdin so we exercise the same code path
 * Cursor itself uses. We force the Neotoma transport to fail
 * deterministically (NEOTOMA_BASE_URL=http://127.0.0.1:1) so the hooks
 * land in their failure branch end-to-end without needing a server.
 *
 * Each test gets a fresh NEOTOMA_HOOK_STATE_DIR so counter state never
 * leaks across runs.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HOOK_DIR = resolve(__dirname, "../../packages/cursor-hooks/dist");

let stateDir: string;

function runHook(
  script: string,
  payload: Record<string, unknown>,
  extraEnv: Record<string, string> = {}
): { stdout: string; stderr: string; status: number | null } {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEOTOMA_HOOK_STATE_DIR: stateDir,
    NEOTOMA_BASE_URL: "http://127.0.0.1:1",
    NEOTOMA_TOKEN: "dev-local",
    NEOTOMA_LOG_LEVEL: "silent",
    NEOTOMA_HOOK_FEEDBACK_HINT: "on",
    NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD: "2",
    ...extraEnv,
  };
  const result = spawnSync(
    process.execPath,
    [join(HOOK_DIR, script)],
    {
      input: JSON.stringify(payload),
      env,
      encoding: "utf-8",
      timeout: 15000,
    }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "neotoma-hook-int-"));
});

afterEach(() => {
  if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
});

describe("cursor postToolUseFailure hook", () => {
  it("creates a failure counter file for Neotoma-relevant tools", () => {
    const result = runHook("post_tool_use_failure.js", {
      session_id: "session-A",
      generation_id: "gen-1",
      tool_name: "mcp_neotoma_store_structured",
      tool_input: { entities: [{ entity_type: "note" }] },
      tool_response: { error: "fetch failed" },
    });

    expect(result.status).toBe(0);

    const files = readdirSync(stateDir).filter((f) =>
      f.startsWith("failures-")
    );
    expect(files.length).toBe(1);
    const state = JSON.parse(
      readFileSync(join(stateDir, files[0]!), "utf-8")
    );
    const entryKeys = Object.keys(state.entries ?? {});
    expect(entryKeys.length).toBe(1);
    const key = entryKeys[0]!;
    expect(key).toContain("mcp_neotoma_store_structured");
    expect(state.entries[key].count).toBe(1);
    expect(state.entries[key].hinted).toBe(false);
  });

  it("does not write a counter for non-Neotoma tools", () => {
    const result = runHook("post_tool_use_failure.js", {
      session_id: "session-B",
      generation_id: "gen-1",
      tool_name: "read_file",
      tool_input: { path: "/tmp/whatever" },
      tool_response: { error: "ENOENT" },
    });
    expect(result.status).toBe(0);
    const files = readdirSync(stateDir).filter((f) =>
      f.startsWith("failures-")
    );
    expect(files.length).toBe(0);
  });
});

describe("cursor postToolUse (after_tool_use) failure-hint surfacing", () => {
  it("surfaces a one-shot hint via additional_context once the threshold trips", () => {
    const payload = {
      session_id: "session-C",
      generation_id: "gen-1",
      tool_name: "mcp_neotoma_store_structured",
      tool_input: { entities: [{ entity_type: "note" }] },
      tool_response: { error: "fetch failed" },
    };

    runHook("post_tool_use_failure.js", payload);
    runHook("post_tool_use_failure.js", payload);

    const result = runHook("after_tool_use.js", {
      session_id: "session-C",
      generation_id: "gen-1",
      tool_name: "read_file",
      tool_input: { path: "/tmp/x" },
      tool_response: {},
    });

    expect(result.status).toBe(0);
    const trimmed = result.stdout.trim();
    expect(trimmed.length).toBeGreaterThan(0);
    const parsed = JSON.parse(trimmed) as {
      additional_context?: string;
      hookSpecificOutput?: { additionalContext?: string };
    };
    const context =
      parsed.additional_context ?? parsed.hookSpecificOutput?.additionalContext ?? "";
    expect(context).toContain("Neotoma hook note");
    expect(context).toContain("mcp_neotoma_store_structured");

    const followup = runHook("after_tool_use.js", {
      session_id: "session-C",
      generation_id: "gen-1",
      tool_name: "read_file",
      tool_input: { path: "/tmp/y" },
      tool_response: {},
    });
    const trimmedFollowup = followup.stdout.trim();
    if (trimmedFollowup.length > 0) {
      const parsedFollowup = JSON.parse(trimmedFollowup) as {
        additional_context?: string;
        hookSpecificOutput?: { additionalContext?: string };
      };
      const ctx2 =
        parsedFollowup.additional_context ??
        parsedFollowup.hookSpecificOutput?.additionalContext ??
        "";
      expect(ctx2).not.toContain("Neotoma hook note");
    }
  });
});
