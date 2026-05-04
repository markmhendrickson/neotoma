/**
 * Integration test for the Cursor stop-hook compliance backfill +
 * optional follow-up message (weak-model Neotoma compliance plan).
 *
 * Strategy:
 *   - Run the compiled `dist/stop.js` against an unreachable Neotoma URL
 *     so the client store/retrieve calls fail fast. The hook is
 *     best-effort: it must not crash, and it must still:
 *       (a) write `followup_message` when no `store_structured` call
 *           was observed in the turn and
 *           `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP` is `auto` or `on`.
 *       (b) NOT write `followup_message` when the agent already called
 *           store_structured at least once in the same turn.
 *       (c) NOT write `followup_message` when
 *           `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP=off`.
 *
 *   - We seed turn-state by running `dist/after_tool_use.js` with the
 *     appropriate tool inputs first, so the stop hook reads the same
 *     per-turn JSON file.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const STOP_HOOK = join(
  REPO_ROOT,
  "packages",
  "cursor-hooks",
  "dist",
  "stop.js"
);
const AFTER_TOOL_USE = join(
  REPO_ROOT,
  "packages",
  "cursor-hooks",
  "dist",
  "after_tool_use.js"
);

function runHook(
  scriptPath: string,
  payload: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [scriptPath], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    env: { ...process.env, ...env },
    timeout: 15_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

describe("cursor-hooks stop backfill integration", () => {
  let scratchDir: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "neotoma-hook-stop-"));
    baseEnv = {
      NEOTOMA_HOOK_STATE_DIR: scratchDir,
      // Unreachable port — the @neotoma/client calls fail fast and the
      // hook falls back to local-state-only behavior.
      NEOTOMA_BASE_URL: "http://127.0.0.1:1",
      NEOTOMA_TOKEN: "test",
      NEOTOMA_LOG_LEVEL: "silent",
    };
  });

  afterEach(() => {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("emits followup_message by default when store_structured was skipped", () => {
    if (!existsSync(STOP_HOOK)) {
      throw new Error(
        "cursor-hooks dist not built; run `npm --prefix packages/cursor-hooks run build`"
      );
    }
    const sessionId = "cursor-stop-backfill-1";
    const stop = runHook(
      STOP_HOOK,
      {
        sessionId,
        turnId: "turn-1",
        text: "Sure, I edited the file as requested.",
        model: "claude-sonnet-4.5",
        status: "completed",
        loop_count: 0,
      },
      { ...baseEnv, NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP: "auto" }
    );
    expect(stop.status).toBe(0);
    const out = stop.stdout.trim() ? JSON.parse(stop.stdout) : {};
    expect(typeof out.followup_message).toBe("string");
    expect(out.followup_message).toMatch(/Neotoma compliance pass/);
    expect(out.followup_message).toMatch(/store_structured/);
  });

  it("counts wrapped Neotoma CallMcpTool store_structured as a store", () => {
    if (!existsSync(AFTER_TOOL_USE) || !existsSync(STOP_HOOK)) {
      throw new Error("cursor-hooks dist not built");
    }
    const sessionId = "cursor-stop-backfill-wrapped-store";
    const turnId = "turn-1";

    const seed = runHook(
      AFTER_TOOL_USE,
      {
        sessionId,
        turnId,
        tool_name: "CallMcpTool",
        tool_input: {
          server: "user-neotoma",
          toolName: "store_structured",
          arguments: {
            entities: [{ entity_type: "conversation_message", role: "user" }],
          },
        },
        tool_output: {},
        model: "claude-sonnet-4.5",
      },
      baseEnv
    );
    expect(seed.status).toBe(0);

    const stop = runHook(
      STOP_HOOK,
      {
        sessionId,
        turnId,
        text: "Stored.",
        model: "claude-sonnet-4.5",
        status: "completed",
        loop_count: 0,
      },
      { ...baseEnv, NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP: "auto" }
    );
    expect(stop.status).toBe(0);
    const out = stop.stdout.trim() ? JSON.parse(stop.stdout) : {};
    expect(out.followup_message).toBeUndefined();
  });

  it("nudges after wrapped external MCP calls before a Neotoma store", () => {
    if (!existsSync(AFTER_TOOL_USE)) {
      throw new Error("cursor-hooks dist not built");
    }
    const seed = runHook(
      AFTER_TOOL_USE,
      {
        sessionId: "cursor-stop-backfill-gmail",
        turnId: "turn-1",
        tool_name: "CallMcpTool",
        tool_input: {
          server: "user-gmail",
          toolName: "search_emails",
          arguments: { query: "newer_than:30d", maxResults: 5 },
        },
        tool_output: {
          messages: [{ id: "email-1", subject: "Example" }],
        },
        model: "claude-sonnet-4.5",
      },
      baseEnv
    );
    expect(seed.status).toBe(0);
    const out = seed.stdout.trim() ? JSON.parse(seed.stdout) : {};
    expect(out.additional_context).toMatch(/Every turn must interact with Neotoma/);
  });

  it("does NOT emit followup_message when the agent already called store_structured", () => {
    if (!existsSync(AFTER_TOOL_USE) || !existsSync(STOP_HOOK)) {
      throw new Error("cursor-hooks dist not built");
    }
    const sessionId = "cursor-stop-backfill-2";
    const turnId = "turn-1";

    // Seed turn state to record one store_structured call.
    const seed = runHook(
      AFTER_TOOL_USE,
      {
        sessionId,
        turnId,
        tool_name: "store_structured",
        tool_input: {
          entities: [{ entity_type: "task", title: "x" }],
          idempotency_key: "test",
        },
        tool_output: {},
        model: "composer-2",
      },
      baseEnv
    );
    expect(seed.status).toBe(0);

    const stop = runHook(
      STOP_HOOK,
      {
        sessionId,
        turnId,
        text: "Done.",
        model: "composer-2",
        status: "completed",
        loop_count: 0,
      },
      { ...baseEnv, NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP: "on" }
    );
    expect(stop.status).toBe(0);
    const out = stop.stdout.trim() ? JSON.parse(stop.stdout) : {};
    expect(out.followup_message).toBeUndefined();
  });

  it("respects NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP=off", () => {
    const sessionId = "cursor-stop-backfill-3";
    const stop = runHook(
      STOP_HOOK,
      {
        sessionId,
        turnId: "turn-1",
        text: "Hi there.",
        model: "composer-2",
        status: "completed",
        loop_count: 0,
      },
      { ...baseEnv, NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP: "off" }
    );
    expect(stop.status).toBe(0);
    const out = stop.stdout.trim() ? JSON.parse(stop.stdout) : {};
    expect(out.followup_message).toBeUndefined();
  });

  it("does NOT emit followup_message when loop_count > 0 (cap applied)", () => {
    const sessionId = "cursor-stop-backfill-4";
    const stop = runHook(
      STOP_HOOK,
      {
        sessionId,
        turnId: "turn-1",
        text: "Already retried.",
        model: "composer-2",
        status: "completed",
        loop_count: 1,
      },
      { ...baseEnv, NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP: "on" }
    );
    expect(stop.status).toBe(0);
    const out = stop.stdout.trim() ? JSON.parse(stop.stdout) : {};
    expect(out.followup_message).toBeUndefined();
  });
});
