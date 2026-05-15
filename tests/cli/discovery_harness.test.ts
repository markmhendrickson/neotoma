import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { discoverHarnessTranscripts } from "../../src/cli/discovery.ts";

async function makeTempHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "neotoma-home-"));
}

describe("discoverHarnessTranscripts", () => {
  it("returns empty array when no harness dirs exist", async () => {
    const homeDir = await makeTempHome();
    const result = await discoverHarnessTranscripts(homeDir);
    expect(result).toEqual([]);
  });

  it("detects Claude Code JSONL files", async () => {
    const homeDir = await makeTempHome();
    const projectDir = path.join(homeDir, ".claude", "projects", "proj-abc");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, "conv-001.jsonl"), "{}");
    await fs.writeFile(path.join(projectDir, "conv-002.jsonl"), "{}");

    const result = await discoverHarnessTranscripts(homeDir);
    const cc = result.find((s) => s.harness === "claude-code");
    expect(cc).toBeDefined();
    expect(cc!.fileCount).toBe(2);
    expect(cc!.paths).toHaveLength(2);
    expect(cc!.paths.every((p) => p.endsWith(".jsonl"))).toBe(true);
  });

  it("detects Codex JSONL files", async () => {
    const homeDir = await makeTempHome();
    const codexDir = path.join(homeDir, ".codex", "archived_sessions");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(path.join(codexDir, "session-001.jsonl"), "{}");

    const result = await discoverHarnessTranscripts(homeDir);
    const codex = result.find((s) => s.harness === "codex");
    expect(codex).toBeDefined();
    expect(codex!.fileCount).toBe(1);
    expect(codex!.sampleTitles).toContain("session-001");
  });

  it("detects Cursor store.db files", async () => {
    const homeDir = await makeTempHome();
    const convDir = path.join(homeDir, ".cursor", "chats", "ws1", "conv-uuid");
    await fs.mkdir(convDir, { recursive: true });
    await fs.writeFile(path.join(convDir, "store.db"), ""); // empty file (not valid SQLite but enough for detection)

    const result = await discoverHarnessTranscripts(homeDir);
    const cursor = result.find((s) => s.harness === "cursor");
    expect(cursor).toBeDefined();
    expect(cursor!.requiresSqlite).toBe(true);
    expect(cursor!.paths.some((p) => p.endsWith("store.db"))).toBe(true);
  });

  it("includes sample titles from Claude Code file paths", async () => {
    const homeDir = await makeTempHome();
    const projectDir = path.join(homeDir, ".claude", "projects", "my-project");
    await fs.mkdir(projectDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(projectDir, `conv-${i}.jsonl`), "{}");
    }

    const result = await discoverHarnessTranscripts(homeDir);
    const cc = result.find((s) => s.harness === "claude-code");
    expect(cc!.sampleTitles.length).toBeLessThanOrEqual(3);
  });

  it("computes date range from file mtimes", async () => {
    const homeDir = await makeTempHome();
    const codexDir = path.join(homeDir, ".codex", "archived_sessions");
    await fs.mkdir(codexDir, { recursive: true });
    const f1 = path.join(codexDir, "s1.jsonl");
    const f2 = path.join(codexDir, "s2.jsonl");
    await fs.writeFile(f1, "{}");
    await fs.writeFile(f2, "{}");

    const result = await discoverHarnessTranscripts(homeDir);
    const codex = result.find((s) => s.harness === "codex");
    expect(codex!.estimatedDateRange).not.toBeNull();
    expect(codex!.estimatedDateRange!.earliest).toBeInstanceOf(Date);
    expect(codex!.estimatedDateRange!.latest).toBeInstanceOf(Date);
  });
});
