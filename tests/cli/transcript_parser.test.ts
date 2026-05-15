import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  detectSource,
  parseTranscript,
} from "../../src/cli/transcript_parser.ts";

// ---------------------------------------------------------------------------
// detectSource
// ---------------------------------------------------------------------------

describe("detectSource", () => {
  it("detects claude-code from ~/.claude/projects path", () => {
    const fp = "/Users/test/.claude/projects/abc123/def456.jsonl";
    expect(detectSource(fp)).toBe("claude-code");
  });

  it("detects codex from ~/.codex/archived_sessions path", () => {
    const fp = "/Users/test/.codex/archived_sessions/session-001.jsonl";
    expect(detectSource(fp)).toBe("codex");
  });

  it("detects cursor store.db from ~/.cursor/chats path", () => {
    const fp = "/Users/test/.cursor/chats/ws1/conv1/store.db";
    expect(detectSource(fp)).toBe("cursor");
  });

  it("detects cursor state.vscdb from Cursor globalStorage path", () => {
    const fp = "/Users/test/Library/Application Support/Cursor/User/globalStorage/state.vscdb";
    expect(detectSource(fp)).toBe("cursor");
  });

  it("detects claude-code from JSONL content sniffing", () => {
    const line = JSON.stringify({ type: "user", message: { role: "user", content: "hello" } });
    expect(detectSource("/tmp/unknown.jsonl", line)).toBe("claude-code");
  });

  it("detects codex from JSONL content sniffing", () => {
    const line = JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", type: "session_meta", payload: { id: "x" } });
    expect(detectSource("/tmp/unknown.jsonl", line)).toBe("codex");
  });
});

// ---------------------------------------------------------------------------
// parseClaudeCodeTranscript (via parseTranscript)
// ---------------------------------------------------------------------------

describe("parseTranscript — claude-code", () => {
  it("parses a Claude Code JSONL transcript", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cc-"));
    const projectDir = path.join(tempDir, ".claude", "projects", "proj-uuid");
    await fs.mkdir(projectDir, { recursive: true });

    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "What is the capital of France?" } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "Paris." } }),
      JSON.stringify({ type: "user", message: { role: "user", content: "Thanks!" } }),
    ].join("\n");

    const filePath = path.join(projectDir, "abc-123.jsonl");
    await fs.writeFile(filePath, lines);

    const result = await parseTranscript({ filePath, source: "claude-code" });

    expect(result.source).toBe("claude-code");
    expect(result.conversations).toHaveLength(1);
    expect(result.totalMessages).toBe(3);
    expect(result.conversations[0].messages[0].role).toBe("user");
    expect(result.conversations[0].messages[1].role).toBe("assistant");
    expect(result.conversations[0].title).toContain("capital of France");
  });

  it("skips non-turn lines (tool_use, etc)", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cc2-"));
    const lines = [
      JSON.stringify({ type: "tool_use", id: "t1", name: "bash", input: {} }),
      JSON.stringify({ type: "user", message: { role: "user", content: "Run it." } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "Done." } }),
    ].join("\n");

    const filePath = path.join(tempDir, "file.jsonl");
    await fs.writeFile(filePath, lines);

    const result = await parseTranscript({ filePath, source: "claude-code" });
    expect(result.totalMessages).toBe(2);
  });

  it("handles content as ContentBlock array", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cc3-"));
    const lines = [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      }),
    ].join("\n");

    const filePath = path.join(tempDir, "file.jsonl");
    await fs.writeFile(filePath, lines);

    const result = await parseTranscript({ filePath, source: "claude-code" });
    expect(result.conversations[0].messages[0].content).toBe("Hello \nworld");
  });
});

// ---------------------------------------------------------------------------
// parseCodexTranscript (via parseTranscript)
// ---------------------------------------------------------------------------

describe("parseTranscript — codex", () => {
  it("parses a Codex JSONL transcript with session_meta and response_item lines", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-codex-"));
    const lines = [
      JSON.stringify({
        timestamp: "2026-03-01T10:00:00Z",
        type: "session_meta",
        payload: { id: "session-42", title: "Debugging session" },
      }),
      JSON.stringify({
        timestamp: "2026-03-01T10:00:01Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "text", text: "Fix the bug." }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-01T10:00:05Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Fixed!" }],
        },
      }),
    ].join("\n");

    const filePath = path.join(tempDir, "session-42.jsonl");
    await fs.writeFile(filePath, lines);

    const result = await parseTranscript({ filePath, source: "codex" });

    expect(result.source).toBe("codex");
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe("session-42");
    expect(result.conversations[0].title).toBe("Debugging session");
    expect(result.totalMessages).toBe(2);
    expect(result.conversations[0].messages[0].role).toBe("user");
    expect(result.conversations[0].messages[1].content).toBe("Fixed!");
  });

  it("skips non-message response_item types", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-codex2-"));
    const lines = [
      JSON.stringify({
        timestamp: "2026-03-01T10:00:00Z",
        type: "session_meta",
        payload: { id: "s1", title: "Test" },
      }),
      JSON.stringify({
        timestamp: "2026-03-01T10:00:01Z",
        type: "response_item",
        payload: { type: "function_call", name: "bash" },
      }),
      JSON.stringify({
        timestamp: "2026-03-01T10:00:02Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Ok" }],
        },
      }),
    ].join("\n");

    const filePath = path.join(tempDir, "s1.jsonl");
    await fs.writeFile(filePath, lines);

    const result = await parseTranscript({ filePath, source: "codex" });
    expect(result.totalMessages).toBe(1);
  });

  it("returns empty for JSONL with no session_meta or message lines", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-codex3-"));
    const lines = [
      JSON.stringify({ timestamp: "x", type: "other", payload: {} }),
    ].join("\n");

    const filePath = path.join(tempDir, "empty.jsonl");
    await fs.writeFile(filePath, lines);

    const result = await parseTranscript({ filePath, source: "codex" });
    expect(result.conversations).toHaveLength(0);
    expect(result.totalMessages).toBe(0);
  });
});
