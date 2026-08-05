import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { discoverHarnessTranscripts } from "../../src/cli/discovery.js";

// Codex keeps live sessions under ~/.codex/sessions/YYYY/MM/DD/ and older ones
// flat under ~/.codex/archived_sessions/. Discovery previously globbed only the
// archived directory, so sessions in active use were never offered for import.
function fakeHome(): string {
  const home = mkdtempSync(path.join(tmpdir(), "codex-home-"));

  const live = path.join(home, ".codex", "sessions", "2026", "08", "02");
  mkdirSync(live, { recursive: true });
  writeFileSync(
    path.join(live, "rollout-2026-08-02T09-20-00-019e2a99.jsonl"),
    JSON.stringify({ type: "session_meta", payload: { id: "019e2a99" } }) + "\n"
  );

  const archived = path.join(home, ".codex", "archived_sessions");
  mkdirSync(archived, { recursive: true });
  writeFileSync(
    path.join(archived, "rollout-2026-05-15T09-46-10-019e2a00.jsonl"),
    JSON.stringify({ type: "session_meta", payload: { id: "019e2a00" } }) + "\n"
  );

  return home;
}

describe("discoverHarnessTranscripts — codex", () => {
  it("discovers live rollouts under ~/.codex/sessions/ and legacy archived_sessions", async () => {
    const summaries = await discoverHarnessTranscripts(fakeHome());
    const codex = summaries.find((s) => s.harness === "codex");

    expect(codex).toBeDefined();
    expect(codex!.fileCount).toBe(2);
    expect(codex!.paths.some((p) => p.includes("/.codex/sessions/"))).toBe(true);
    expect(codex!.paths.some((p) => p.includes("archived_sessions"))).toBe(true);
  });

  it("reports no codex harness when neither directory exists", async () => {
    const empty = mkdtempSync(path.join(tmpdir(), "codex-empty-"));
    const summaries = await discoverHarnessTranscripts(empty);
    expect(summaries.find((s) => s.harness === "codex")).toBeUndefined();
  });
});
