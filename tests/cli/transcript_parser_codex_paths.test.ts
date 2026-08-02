import { describe, expect, it } from "vitest";
import { detectSource } from "../../src/cli/transcript_parser.js";

// Codex moved live rollouts from ~/.codex/archived_sessions/ to a
// date-partitioned ~/.codex/sessions/YYYY/MM/DD/ tree. Both must be detected.
describe("detectSource — codex session locations", () => {
  it("detects live rollouts under ~/.codex/sessions/", () => {
    expect(
      detectSource(
        "/Users/someone/.codex/sessions/2026/08/02/rollout-2026-08-02T09-20-00-019e2a99.jsonl"
      )
    ).toBe("codex");
  });

  it("still detects legacy archived_sessions rollouts", () => {
    expect(
      detectSource("/Users/someone/.codex/archived_sessions/rollout-2026-05-15T09-46-10-019e.jsonl")
    ).toBe("codex");
  });

  it("does not claim non-jsonl files under the sessions tree", () => {
    expect(detectSource("/Users/someone/.codex/sessions/2026/08/02/notes.txt")).not.toBe("codex");
  });

  it("does not misclassify claude-code transcripts", () => {
    expect(detectSource("/Users/someone/.claude/projects/-Users-someone-repo/abc.jsonl")).toBe(
      "claude-code"
    );
  });
});
