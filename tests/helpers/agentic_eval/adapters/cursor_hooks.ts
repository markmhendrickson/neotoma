/**
 * Cursor-hooks adapter for the Tier 1 agentic-eval runner.
 *
 * Spawns the compiled hook scripts at `packages/cursor-hooks/dist/*.js`
 * and translates the canonical fixture event payload into Cursor's
 * native hook payload shape.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import type {
  CanonicalHook,
  CapturedHookOutput,
  CellContext,
  FixtureEvent,
  HarnessAdapter,
} from "../types.js";
import { runChildProcess } from "./run_child.js";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const HOOKS_DIR = join(REPO_ROOT, "packages", "cursor-hooks", "dist");

const HOOK_SCRIPTS: Partial<Record<CanonicalHook, string>> = {
  sessionStart: "session_start.js",
  beforeSubmitPrompt: "before_submit_prompt.js",
  postToolUse: "after_tool_use.js",
  postToolUseFailure: "post_tool_use_failure.js",
  stop: "stop.js",
};

function resolveScript(hook: CanonicalHook): string | null {
  const file = HOOK_SCRIPTS[hook];
  if (!file) return null;
  return join(HOOKS_DIR, file);
}

function buildPayload(
  event: FixtureEvent,
  ctx: CellContext
): Record<string, unknown> {
  const base = {
    sessionId: ctx.sessionId,
    turnId: ctx.turnId,
    model: ctx.model,
  };
  const p = event.payload;
  switch (event.hook) {
    case "sessionStart":
      return {
        ...base,
        session_id: ctx.sessionId,
        generation_id: ctx.turnId,
      };
    case "beforeSubmitPrompt":
      return {
        ...base,
        prompt: p.prompt ?? "",
        attachments: p.attachments ?? [],
      };
    case "postToolUse":
      return {
        ...base,
        tool_name: p.tool_name ?? "Read",
        tool_input: p.tool_input ?? {},
        tool_output: p.tool_output ?? {},
      };
    case "postToolUseFailure":
      return {
        session_id: ctx.sessionId,
        turn_id: ctx.turnId,
        tool_name: p.tool_name ?? "unknown",
        tool_input: p.tool_input ?? {},
        tool_result: { error: { message: p.tool_error ?? "unspecified error" } },
        hook_event_name: "postToolUseFailure",
      };
    case "stop":
      return {
        ...base,
        text: p.text ?? "",
        status: p.status ?? "completed",
        loop_count:
          typeof p.loop_count === "number" ? p.loop_count : 0,
      };
  }
}

export function createCursorHooksAdapter(): HarnessAdapter {
  return {
    id: "cursor-hooks",
    status: "implemented",
    preflight() {
      const probe = join(HOOKS_DIR, "stop.js");
      if (!existsSync(probe)) {
        throw new Error(
          "cursor-hooks dist not built; run `npm --prefix packages/cursor-hooks run build`"
        );
      }
    },
    async runEvent(event, ctx): Promise<CapturedHookOutput | null> {
      const script = resolveScript(event.hook);
      if (!script || !existsSync(script)) {
        return {
          hook: event.hook,
          output: {},
          stderr: `cursor-hooks: no script for ${event.hook}`,
          exitCode: null,
        };
      }
      const payload = buildPayload(event, ctx);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NEOTOMA_HOOK_STATE_DIR: ctx.hookStateDir,
        NEOTOMA_BASE_URL: ctx.baseUrl,
        NEOTOMA_TOKEN: ctx.token,
        NEOTOMA_LOG_LEVEL: "silent",
        // For deterministic compliance behavior across cells.
        NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP:
          process.env.NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP ?? "auto",
      };
      const t0 = Date.now();
      const result = await runChildProcess("node", [script], {
        input: JSON.stringify(payload),
        env,
        timeoutMs: 15_000,
      });
      if (process.env.NEOTOMA_AGENTIC_EVAL_DEBUG === "1") {
        try {
          const fs = await import("node:fs");
          fs.appendFileSync(
            "/tmp/agentic-eval-debug.log",
            `[${new Date().toISOString()}] hook=${event.hook} session=${ctx.sessionId} ` +
              `elapsed=${Date.now() - t0}ms status=${result.status} ` +
              `stdout=${(result.stdout ?? "").slice(0, 200)} ` +
              `stderr=${(result.stderr ?? "").slice(0, 600)}\n`
          );
        } catch {
          // ignore
        }
      }
      let parsed: Record<string, unknown> = {};
      const stdout = (result.stdout ?? "").trim();
      if (stdout) {
        try {
          parsed = JSON.parse(stdout) as Record<string, unknown>;
        } catch {
          // Hook returned non-JSON. Keep stdout in stderr for debug;
          // assertions on output fields will fail naturally.
        }
      }
      return {
        hook: event.hook,
        output: parsed,
        stderr: result.stderr ?? "",
        exitCode: result.status,
      };
    },
  };
}
