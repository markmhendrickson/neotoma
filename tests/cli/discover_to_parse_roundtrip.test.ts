/**
 * Discover → parse roundtrip test.
 *
 * `neotoma discover --harness-transcripts` finds harness transcript files;
 * `neotoma ingest-transcript --harness <h>` parses each file. The two
 * subsystems must agree on file layout: a path emitted by discovery must be
 * parseable by the transcript parser.
 *
 * This test wires them together against a synthesized $HOME containing
 * realistic harness directory layouts for claude-code, codex, and cursor,
 * then asserts that every discovered path parses successfully and yields
 * the expected conversation count.
 *
 * Without this test, a path-layout drift in either subsystem (e.g. discovery
 * scanning `~/.codex/archived_sessions/*.jsonl` but the parser expecting a
 * different schema) would only surface during real-user activation.
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { discoverHarnessTranscripts } from "../../src/cli/discovery.ts";
import { parseTranscript } from "../../src/cli/transcript_parser.ts";

async function makeTempHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "neotoma-roundtrip-"));
}

/** Write a minimal claude-code JSONL transcript with one user + one assistant message. */
async function seedClaudeCodeTranscript(homeDir: string, projectId: string, convId: string): Promise<string> {
  const projectDir = path.join(homeDir, ".claude", "projects", projectId);
  await fs.mkdir(projectDir, { recursive: true });
  const file = path.join(projectDir, `${convId}.jsonl`);
  const lines = [
    JSON.stringify({
      type: "user",
      sessionId: convId,
      timestamp: "2026-05-01T10:00:00Z",
      message: { role: "user", content: "hello from claude-code" },
    }),
    JSON.stringify({
      type: "assistant",
      sessionId: convId,
      timestamp: "2026-05-01T10:00:05Z",
      message: { role: "assistant", content: [{ type: "text", text: "reply" }] },
    }),
  ];
  await fs.writeFile(file, lines.join("\n") + "\n");
  return file;
}

/** Write a minimal codex JSONL transcript with one user + one assistant message. */
async function seedCodexTranscript(homeDir: string, sessionId: string): Promise<string> {
  const dir = path.join(homeDir, ".codex", "archived_sessions");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  const lines = [
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello from codex" }],
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "codex reply" }],
      },
    }),
  ];
  await fs.writeFile(file, lines.join("\n") + "\n");
  return file;
}

/** Write a minimal Cursor per-workspace store.db with one user message. */
async function seedCursorStoreDb(homeDir: string, ws: string, convId: string): Promise<string> {
  const Database = (await import("../../src/repositories/sqlite/sqlite_driver.js")).default;
  const convDir = path.join(homeDir, ".cursor", "chats", ws, convId);
  await fs.mkdir(convDir, { recursive: true });
  const dbPath = path.join(convDir, "store.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE blobs (id TEXT PRIMARY KEY, data TEXT);
  `);
  db.prepare("INSERT INTO meta (key, value) VALUES ('name', ?)").run(
    JSON.stringify("cursor conv title"),
  );
  const payload = JSON.stringify({ role: "user", content: "hello from cursor" });
  db.prepare("INSERT INTO blobs (id, data) VALUES (?, ?)").run(
    "b1",
    Buffer.from(payload, "utf-8").toString("hex"),
  );
  db.close();
  return dbPath;
}

describe("discover → parse roundtrip", () => {
  it("every claude-code path emitted by discovery parses to a non-empty conversation", async () => {
    const homeDir = await makeTempHome();
    const expectedFiles = [
      await seedClaudeCodeTranscript(homeDir, "proj-a", "conv-1"),
      await seedClaudeCodeTranscript(homeDir, "proj-a", "conv-2"),
      await seedClaudeCodeTranscript(homeDir, "proj-b", "conv-3"),
    ];

    const discovered = await discoverHarnessTranscripts(homeDir);
    const claudeCode = discovered.find((s) => s.harness === "claude-code");

    expect(claudeCode).toBeDefined();
    expect(claudeCode!.fileCount).toBe(3);
    expect(new Set(claudeCode!.paths)).toEqual(new Set(expectedFiles));

    // Parse every discovered path; each must yield at least one conversation.
    for (const file of claudeCode!.paths) {
      const result = await parseTranscript({ filePath: file, source: "claude-code" });
      expect(result.conversations.length).toBeGreaterThan(0);
      expect(result.totalMessages).toBeGreaterThan(0);
    }
  });

  it("every codex path emitted by discovery parses to a non-empty conversation", async () => {
    const homeDir = await makeTempHome();
    const expectedFiles = [
      await seedCodexTranscript(homeDir, "session-001"),
      await seedCodexTranscript(homeDir, "session-002"),
    ];

    const discovered = await discoverHarnessTranscripts(homeDir);
    const codex = discovered.find((s) => s.harness === "codex");

    expect(codex).toBeDefined();
    expect(codex!.fileCount).toBe(2);
    expect(new Set(codex!.paths)).toEqual(new Set(expectedFiles));

    for (const file of codex!.paths) {
      const result = await parseTranscript({ filePath: file, source: "codex" });
      expect(result.conversations.length).toBeGreaterThan(0);
      expect(result.totalMessages).toBeGreaterThan(0);
    }
  });

  it("every cursor path emitted by discovery parses to a non-empty conversation", async () => {
    const homeDir = await makeTempHome();
    const expectedFiles = [
      await seedCursorStoreDb(homeDir, "ws-alpha", "conv-aaa"),
      await seedCursorStoreDb(homeDir, "ws-alpha", "conv-bbb"),
    ];

    const discovered = await discoverHarnessTranscripts(homeDir);
    const cursor = discovered.find((s) => s.harness === "cursor");

    expect(cursor).toBeDefined();
    expect(cursor!.requiresSqlite).toBe(true);
    // Discovery may emit paths in any order; compare as sets.
    expect(new Set(cursor!.paths)).toEqual(new Set(expectedFiles));

    for (const file of cursor!.paths) {
      const result = await parseTranscript({ filePath: file, source: "cursor" });
      expect(result.conversations.length).toBeGreaterThan(0);
      expect(result.totalMessages).toBeGreaterThan(0);
    }
  });

  it("a $HOME containing all three harnesses produces three discovery groups, all parseable", async () => {
    const homeDir = await makeTempHome();
    await seedClaudeCodeTranscript(homeDir, "proj-x", "conv-cc");
    await seedCodexTranscript(homeDir, "session-cx");
    await seedCursorStoreDb(homeDir, "ws-1", "conv-cu");

    const discovered = await discoverHarnessTranscripts(homeDir);
    const harnesses = discovered.map((s) => s.harness).sort();
    // All three harnesses should be discovered. Discovery may also surface
    // other harnesses if their directories exist, so we assert presence as a
    // subset rather than equality.
    expect(harnesses).toEqual(expect.arrayContaining(["claude-code", "codex", "cursor"]));

    for (const group of discovered) {
      // Match TranscriptSource type expected by parseTranscript.
      const sourceMap: Record<string, "claude-code" | "codex" | "cursor"> = {
        "claude-code": "claude-code",
        codex: "codex",
        cursor: "cursor",
      };
      const source = sourceMap[group.harness];
      if (!source) continue;
      for (const file of group.paths) {
        const result = await parseTranscript({ filePath: file, source });
        expect(result.conversations.length).toBeGreaterThan(0);
      }
    }
  });
});
