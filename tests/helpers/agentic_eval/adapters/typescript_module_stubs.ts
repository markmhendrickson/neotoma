/**
 * Phase 1 stub adapters for opencode-plugin and claude-agent-sdk-adapter.
 *
 * These harnesses ship as importable TypeScript modules rather than
 * spawnable hook scripts, so the wiring is meaningfully different from
 * cursor-hooks / claude-code-plugin / codex-hooks. We stub them in
 * Phase 1 so the matrix surfaces an `it.skip()` cell with a clear
 * reason, and Phase 2 can fill them in by importing the hook factories
 * directly.
 *
 * Both stubs preflight successfully (no error) and surface every event
 * as "skipped: stub adapter". The runner translates that into vitest
 * `it.skip()` calls so reports stay green while documenting coverage
 * gaps.
 */

import type {
  CapturedHookOutput,
  CellContext,
  FixtureEvent,
  HarnessAdapter,
} from "../types.js";

function stubAdapter(id: HarnessAdapter["id"]): HarnessAdapter {
  return {
    id,
    status: "stub",
    preflight() {
      // No-op; stubs always preflight successfully.
    },
    async runEvent(event: FixtureEvent, _ctx: CellContext): Promise<CapturedHookOutput | null> {
      return {
        hook: event.hook,
        output: {},
        stderr: `${id}: stub adapter — Phase 1 does not exercise this harness end-to-end`,
        exitCode: null,
      };
    },
  };
}

export function createOpencodePluginAdapter(): HarnessAdapter {
  return stubAdapter("opencode-plugin");
}

export function createClaudeAgentSdkAdapter(): HarnessAdapter {
  return stubAdapter("claude-agent-sdk-adapter");
}
