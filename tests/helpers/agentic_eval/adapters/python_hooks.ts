/**
 * Adapters for Python-based hook packages: claude-code-plugin and
 * codex-hooks. Both expose the same NEOTOMA_* env-var contract as the
 * cursor-hooks adapter, so the only differences are (a) the script
 * filenames per canonical hook and (b) the per-harness payload shape.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import type {
  CanonicalHook,
  CapturedHookOutput,
  CellContext,
  FixtureEvent,
  HarnessAdapter,
  HarnessId,
} from "../types.js";
import { runChildProcess } from "./run_child.js";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

interface PythonHarnessSpec {
  id: HarnessId;
  hooksDir: string;
  scripts: Partial<Record<CanonicalHook, string>>;
  /** Builds the per-harness JSON payload from a canonical event. */
  payloadShaper: (event: FixtureEvent, ctx: CellContext) => Record<string, unknown> | null;
}

function pythonInterpreter(): string {
  return process.env.NEOTOMA_EVAL_PYTHON ?? "python3";
}

const CLAUDE_PLUGIN_DIR = join(REPO_ROOT, "packages", "claude-code-plugin");

function expandCellUrl(value: string, ctx: CellContext): string {
  return value
    .replace("{cell_mcp_url}", `${ctx.baseUrl.replace(/\/+$/, "")}/mcp`)
    .replace("{cell_base_url}", ctx.baseUrl);
}

/**
 * Plugin context for the claude-code-plugin hooks. Fixtures without a
 * `meta.claude_plugin` block run the out-of-plugin path (plugin variables
 * blanked, so an eval launched from inside a Claude plugin session still hits
 * the cell's mock server). Fixtures with one run the installed-plugin path:
 * CLAUDE_PLUGIN_ROOT set, the option as given, HOME isolated so a developer's
 * own Neotoma CLI config cannot leak in.
 */
function claudePluginEnv(ctx: CellContext): NodeJS.ProcessEnv {
  const plugin =
    ctx.harness === "claude-code-plugin" ? ctx.fixture.meta.claude_plugin : undefined;
  if (!plugin) {
    return { CLAUDE_PLUGIN_ROOT: "", CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "" };
  }
  const baseUrl =
    plugin.neotoma_base_url === undefined
      ? ctx.baseUrl
      : plugin.neotoma_base_url === null
        ? ""
        : expandCellUrl(plugin.neotoma_base_url, ctx);
  return {
    CLAUDE_PLUGIN_ROOT: CLAUDE_PLUGIN_DIR,
    CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: expandCellUrl(plugin.mcp_url ?? "", ctx),
    NEOTOMA_BASE_URL: baseUrl,
    HOME: ctx.hookStateDir,
  };
}

async function runPython(
  script: string,
  payload: Record<string, unknown>,
  ctx: CellContext
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEOTOMA_HOOK_STATE_DIR: ctx.hookStateDir,
    NEOTOMA_BASE_URL: ctx.baseUrl,
    NEOTOMA_TOKEN: ctx.token,
    ...claudePluginEnv(ctx),
    NEOTOMA_LOG_LEVEL: "silent",
    NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP:
      process.env.NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP ?? "auto",
  };
  return runChildProcess(pythonInterpreter(), [script], {
    input: JSON.stringify(payload),
    env,
    timeoutMs: 15_000,
  });
}

function makeAdapter(spec: PythonHarnessSpec): HarnessAdapter {
  return {
    id: spec.id,
    status: "implemented",
    preflight() {
      // Probe the python interpreter once.
      const probe = spawnSync(pythonInterpreter(), ["--version"], {
        encoding: "utf-8",
      });
      if (probe.status !== 0) {
        throw new Error(
          `${spec.id}: python interpreter (${pythonInterpreter()}) not available`
        );
      }
    },
    async runEvent(event, ctx): Promise<CapturedHookOutput | null> {
      const file = spec.scripts[event.hook];
      if (!file) {
        return {
          hook: event.hook,
          output: {},
          stderr: `${spec.id}: no script for ${event.hook}`,
          exitCode: null,
        };
      }
      const script = join(spec.hooksDir, file);
      if (!existsSync(script)) {
        return {
          hook: event.hook,
          output: {},
          stderr: `${spec.id}: script missing: ${script}`,
          exitCode: null,
        };
      }
      const payload = spec.payloadShaper(event, ctx);
      if (payload == null) {
        return {
          hook: event.hook,
          output: {},
          stderr: `${spec.id}: hook ${event.hook} unsupported (skipped by adapter)`,
          exitCode: null,
        };
      }
      const result = await runPython(script, payload, ctx);
      let parsed: Record<string, unknown> = {};
      const stdout = (result.stdout ?? "").trim();
      if (stdout) {
        try {
          parsed = JSON.parse(stdout) as Record<string, unknown>;
        } catch {
          // Non-JSON output — leave parsed empty; keep stderr.
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

export function createClaudeCodeAdapter(): HarnessAdapter {
  return makeAdapter({
    id: "claude-code-plugin",
    hooksDir: join(REPO_ROOT, "packages", "claude-code-plugin", "hooks"),
    scripts: {
      sessionStart: "session_start.py",
      beforeSubmitPrompt: "user_prompt_submit.py",
      postToolUse: "post_tool_use.py",
      // claude-code-plugin does not ship a separate failure hook today;
      // post_tool_use handles failures inline.
      stop: "stop.py",
    },
    payloadShaper(event, ctx): Record<string, unknown> | null {
      const base = {
        session_id: ctx.sessionId,
        turn_id: ctx.turnId,
        model: ctx.model,
      };
      switch (event.hook) {
        case "sessionStart":
          return { ...base };
        case "beforeSubmitPrompt":
          return {
            ...base,
            prompt: event.payload.prompt ?? "",
            user_prompt: event.payload.prompt ?? "",
            attachments: event.payload.attachments ?? [],
          };
        case "postToolUse":
          return {
            ...base,
            tool_name: event.payload.tool_name ?? "Read",
            tool_input: event.payload.tool_input ?? {},
            tool_response: event.payload.tool_output ?? {},
            hook_event_name: "PostToolUse",
          };
        case "postToolUseFailure":
          // Subsumed under postToolUse with an error tool_response.
          return {
            ...base,
            tool_name: event.payload.tool_name ?? "unknown",
            tool_input: event.payload.tool_input ?? {},
            tool_response: { error: event.payload.tool_error ?? "unspecified" },
            hook_event_name: "PostToolUse",
          };
        case "stop":
          return {
            ...base,
            stop_hook_active: true,
            transcript: event.payload.text ?? "",
            assistant_text: event.payload.text ?? "",
          };
      }
      return null;
    },
  });
}

export function createCodexHooksAdapter(): HarnessAdapter {
  return makeAdapter({
    id: "codex-hooks",
    hooksDir: join(REPO_ROOT, "packages", "codex-hooks", "hooks"),
    scripts: {
      sessionStart: "session_start.py",
      // Codex CLI has no user-prompt hook surface; we route those through
      // notify.py so the hook still records a context_event.
      beforeSubmitPrompt: "notify.py",
      postToolUse: "notify.py",
      postToolUseFailure: "notify.py",
      stop: "session_end.py",
    },
    payloadShaper(event, ctx): Record<string, unknown> | null {
      const base = {
        session_id: ctx.sessionId,
        turn_id: ctx.turnId,
        model: ctx.model,
      };
      switch (event.hook) {
        case "sessionStart":
          return { ...base, event_type: "session_start" };
        case "beforeSubmitPrompt":
          return {
            ...base,
            event_type: "user_prompt",
            message: event.payload.prompt ?? "",
          };
        case "postToolUse":
          return {
            ...base,
            event_type: "tool_completed",
            tool_name: event.payload.tool_name ?? "Read",
            message: JSON.stringify(event.payload.tool_output ?? {}),
          };
        case "postToolUseFailure":
          return {
            ...base,
            event_type: "tool_error",
            tool_name: event.payload.tool_name ?? "unknown",
            message: event.payload.tool_error ?? "unspecified",
          };
        case "stop":
          return {
            ...base,
            event_type: "session_end",
            assistant_text: event.payload.text ?? "",
          };
      }
      return null;
    },
  });
}
