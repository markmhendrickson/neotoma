import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { conversationsToEntities, parseTranscript } from "../../src/cli/transcript_parser.js";

// Ingest previously emitted only conversation + conversation_message rows,
// discarding cwd/session identity. cwd is load-bearing for resume: Cursor keys
// its chat directory by md5(cwd) and Codex filters its resume picker by it.
function writeClaudeTranscript(cwd: string, branch: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "claude-proj-"));
  const file = path.join(dir, "6f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.jsonl");
  const base = { cwd, gitBranch: branch, version: "2.1.204", sessionId: "s1" };
  writeFileSync(
    file,
    [
      { ...base, type: "user", timestamp: "2026-08-02T09:00:00Z", message: { role: "user", content: "hello" } },
      {
        ...base,
        type: "assistant",
        timestamp: "2026-08-02T09:00:01Z",
        message: { role: "assistant", content: [{ type: "text", text: "hi there" }] },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n")
  );
  return file;
}

describe("conversationsToEntities — session identity", () => {
  it("emits an agent_session carrying cwd and branch", async () => {
    const file = writeClaudeTranscript("/Users/x/repo", "main");
    const result = await parseTranscript({ filePath: file });
    const entities = conversationsToEntities(result.conversations);

    const session = entities.find((e) => e.entity_type === "agent_session");
    expect(session).toMatchObject({
      harness: "claude-code",
      cwd: "/Users/x/repo",
      branch: "main",
      message_count: 2,
    });
  });

  it("emits a content-addressed session_transcript linked to the session", async () => {
    const file = writeClaudeTranscript("/Users/x/repo", "main");
    const result = await parseTranscript({ filePath: file });

    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.fileSize).toBeGreaterThan(0);

    const entities = conversationsToEntities(result.conversations, {
      filePath: result.filePath,
      contentHash: result.contentHash,
      fileSize: result.fileSize,
    });

    const transcript = entities.find((e) => e.entity_type === "session_transcript");
    const session = entities.find((e) => e.entity_type === "agent_session");
    expect(transcript).toMatchObject({
      content_hash: result.contentHash,
      agent_session_id: session!.native_session_id,
      format: "jsonl",
      turn_count: 2,
    });
  });

  it("hashes identical content identically so re-imports dedupe", async () => {
    const a = await parseTranscript({ filePath: writeClaudeTranscript("/Users/x/repo", "main") });
    const b = await parseTranscript({ filePath: writeClaudeTranscript("/Users/x/repo", "main") });
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("omits session_transcript when no content hash is supplied", async () => {
    const file = writeClaudeTranscript("/Users/x/repo", "main");
    const result = await parseTranscript({ filePath: file });
    const entities = conversationsToEntities(result.conversations);
    expect(entities.find((e) => e.entity_type === "session_transcript")).toBeUndefined();
  });

  it("does not emit agent_session for non-harness sources", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chatgpt-"));
    const file = path.join(dir, "conversations.json");
    writeFileSync(
      file,
      JSON.stringify([
        {
          title: "t",
          mapping: {
            a: {
              message: {
                author: { role: "user" },
                content: { parts: ["hi"] },
                create_time: 1785656000,
              },
            },
          },
        },
      ])
    );

    const result = await parseTranscript({ filePath: file });
    const entities = conversationsToEntities(result.conversations);
    expect(entities.find((e) => e.entity_type === "agent_session")).toBeUndefined();
  });
});
