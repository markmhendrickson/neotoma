/**
 * Unit tests for the harness-side failure-signal accumulator (Feature A).
 *
 * Each harness package (cursor-hooks, opencode-plugin, claude-agent-sdk-
 * adapter, claude-code-plugin, codex-hooks) reimplements the same small
 * helper surface inline so the hooks remain runtime-light. We exercise
 * the cursor-hooks copy here as the canonical reference; the parity tests
 * that lock the other harnesses live alongside the harness packages.
 *
 * IMPORTANT: every test sets `NEOTOMA_HOOK_STATE_DIR` to a fresh tmpdir so
 * counter state does not leak between runs and the tests stay safe to
 * parallelise with the rest of the suite.
 */

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  classifyErrorMessage,
  failureCounterKey,
  formatFailureHint,
  incrementFailureCounter,
  isNeotomaRelevantTool,
  readFailureHint,
  scrubErrorMessage,
} from "../../packages/cursor-hooks/hooks/_common.js";

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "neotoma-hook-state-"));
  process.env.NEOTOMA_HOOK_STATE_DIR = stateDir;
  delete process.env.NEOTOMA_HOOK_FEEDBACK_HINT;
  delete process.env.NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD;
});

afterEach(() => {
  delete process.env.NEOTOMA_HOOK_STATE_DIR;
  delete process.env.NEOTOMA_HOOK_FEEDBACK_HINT;
  delete process.env.NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD;
  if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
});

describe("isNeotomaRelevantTool", () => {
  it("matches MCP tool name prefixes", () => {
    expect(isNeotomaRelevantTool("mcp_neotoma_store_structured", {})).toBe(true);
    expect(
      isNeotomaRelevantTool("mcp_user-neotoma_retrieve_entities", {})
    ).toBe(true);
    expect(isNeotomaRelevantTool("store_structured", {})).toBe(true);
    expect(isNeotomaRelevantTool("submit_issue", {})).toBe(true);
  });

  it("matches CLI / HTTP shapes via the input record", () => {
    expect(
      isNeotomaRelevantTool("run_terminal_cmd", { command: "neotoma store" })
    ).toBe(true);
    expect(
      isNeotomaRelevantTool("fetch", { url: "https://neotoma.io/api" })
    ).toBe(true);
  });

  it("ignores unrelated tools", () => {
    expect(isNeotomaRelevantTool("read_file", {})).toBe(false);
    expect(isNeotomaRelevantTool("grep", { command: "ls" })).toBe(false);
    expect(isNeotomaRelevantTool("", {})).toBe(false);
  });
});

describe("scrubErrorMessage", () => {
  it("replaces emails, tokens, UUIDs, and phone numbers", () => {
    const out = scrubErrorMessage(
      "user a@b.com tried sk_abcdef0123456789ab uuid 11111111-2222-3333-4444-555555555555 phone +1 555 123 4567"
    );
    expect(out).toContain("<EMAIL>");
    expect(out).toContain("<TOKEN>");
    expect(out).toContain("<UUID>");
    expect(out).toContain("<PHONE>");
  });

  it("truncates very long inputs", () => {
    const long = "x".repeat(2000);
    const out = scrubErrorMessage(long);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.endsWith("...")).toBe(true);
  });

  it("returns empty string for null/undefined", () => {
    expect(scrubErrorMessage(null)).toBe("");
    expect(scrubErrorMessage(undefined)).toBe("");
  });
});

describe("classifyErrorMessage", () => {
  it("recognises ERR_* envelope codes", () => {
    expect(classifyErrorMessage("ERR_STORE_RESOLUTION_FAILED happened")).toBe(
      "ERR_STORE_RESOLUTION_FAILED"
    );
  });

  it("recognises Node network codes", () => {
    expect(classifyErrorMessage("connect ECONNREFUSED 127.0.0.1:3080")).toBe(
      "ECONNREFUSED"
    );
    expect(classifyErrorMessage("getaddrinfo ENOTFOUND host")).toBe(
      "ENOTFOUND"
    );
  });

  it("recognises HTTP status messages", () => {
    expect(classifyErrorMessage("Request failed with HTTP 500")).toBe(
      "HTTP_500"
    );
  });

  it("falls back to fetch_failed / timeout / generic", () => {
    expect(classifyErrorMessage("fetch failed")).toBe("fetch_failed");
    expect(classifyErrorMessage("operation timeout")).toBe("timeout");
    expect(classifyErrorMessage("something else")).toBe("generic_error");
  });
});

describe("incrementFailureCounter + readFailureHint", () => {
  const sessionId = "test-session";

  it("keys per (tool, error_class) and increments", () => {
    const a = incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    expect(a.count).toBe(1);
    const b = incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    expect(b.count).toBe(2);
    const c = incrementFailureCounter(sessionId, "store_structured", "HTTP_502");
    expect(c.count).toBe(1);
    expect(failureCounterKey("store_structured", "HTTP_500")).toBe(
      "store_structured::HTTP_500"
    );
  });

  it("returns null below the threshold (default 2)", () => {
    incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    expect(readFailureHint(sessionId)).toBeNull();
  });

  it("returns a hint at or above the threshold and only once per key", () => {
    incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    const hint = readFailureHint(sessionId);
    expect(hint).not.toBeNull();
    expect(hint!.tool_name).toBe("store_structured");
    expect(hint!.error_class).toBe("HTTP_500");
    expect(hint!.count).toBeGreaterThanOrEqual(2);

    expect(readFailureHint(sessionId)).toBeNull();
  });

  it("respects NEOTOMA_HOOK_FEEDBACK_HINT=off", () => {
    process.env.NEOTOMA_HOOK_FEEDBACK_HINT = "off";
    incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    expect(readFailureHint(sessionId)).toBeNull();
  });

  it("respects NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD", () => {
    process.env.NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD = "5";
    for (let i = 0; i < 4; i += 1) {
      incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    }
    expect(readFailureHint(sessionId)).toBeNull();
    incrementFailureCounter(sessionId, "store_structured", "HTTP_500");
    const hint = readFailureHint(sessionId);
    expect(hint).not.toBeNull();
    expect(hint!.count).toBeGreaterThanOrEqual(5);
  });
});

describe("formatFailureHint", () => {
  it("renders a one-shot informational nudge mentioning submit_issue", () => {
    const formatted = formatFailureHint({
      tool_name: "store_structured",
      error_class: "HTTP_500",
      count: 3,
    });
    expect(formatted).toContain("3 recent failures");
    expect(formatted).toContain("store_structured");
    expect(formatted).toContain("HTTP_500");
    expect(formatted).toContain("submit_issue");
    expect(formatted).toContain("do not auto-submit");
  });
});
