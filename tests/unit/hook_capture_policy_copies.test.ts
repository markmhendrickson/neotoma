/**
 * The tool-capture policy ships as byte-identical copies because the hook
 * packages are published independently. This test fails when a copy drifts:
 * edit the canonical file (cursor-hooks for TypeScript, claude-code-plugin
 * for Python) and re-copy it to the others.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const read = (relative: string) => readFileSync(resolve(ROOT, relative), "utf8");

describe("hook capture policy copies", () => {
  const canonicalTs = read("packages/cursor-hooks/hooks/capture_policy.ts");
  const tsCopies = [
    "packages/opencode-plugin/src/capture_policy.ts",
    "packages/claude-agent-sdk-adapter/src/capture_policy.ts",
    "src/services/hook_capture_policy.ts",
  ];

  it.each(tsCopies)("%s is identical to the cursor-hooks copy", (path) => {
    expect(read(path)).toBe(canonicalTs);
  });

  it("codex-hooks carries an identical copy of the claude-code-plugin Python policy", () => {
    expect(read("packages/codex-hooks/hooks/capture_policy.py")).toBe(
      read("packages/claude-code-plugin/hooks/capture_policy.py")
    );
  });
});
