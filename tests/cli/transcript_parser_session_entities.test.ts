import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
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

  it("emits codex agent_session cwd from session_meta, updated by later turn_context", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "codex-cwd-"));
    const file = path.join(dir, "rollout-2026-08-02T09-20-00-019e2a99.jsonl");
    writeFileSync(
      file,
      [
        {
          timestamp: "2026-08-02T07:20:00.000Z",
          type: "session_meta",
          payload: { id: "019e2a99-cwd", cwd: "/tmp/first", cli_version: "0.1.0" },
        },
        {
          timestamp: "2026-08-02T07:20:01.000Z",
          type: "turn_context",
          payload: { cwd: "/tmp/moved" },
        },
        {
          timestamp: "2026-08-02T07:20:02.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "where am I?" }],
          },
        },
      ]
        .map((l) => JSON.stringify(l))
        .join("\n")
    );

    const result = await parseTranscript({ filePath: file });
    const session = conversationsToEntities(result.conversations).find(
      (e) => e.entity_type === "agent_session"
    );
    expect(session).toMatchObject({
      harness: "codex",
      native_session_id: "019e2a99-cwd",
      cwd: "/tmp/moved",
    });
  });

  it("strips the internal cursor- prefix from native_session_id for resume", () => {
    const entities = conversationsToEntities(
      [
        {
          id: "cursor-chatIdBare",
          title: "t",
          source: "cursor",
          messages: [
            { timestamp: null, author: "user", role: "user", content: "hi" },
          ],
          createdAt: null,
          updatedAt: null,
          session: { cwd: "/Users/x/repo" },
        },
      ],
      { contentHash: "a".repeat(64), fileSize: 1 }
    );

    const session = entities.find((e) => e.entity_type === "agent_session");
    const transcript = entities.find((e) => e.entity_type === "session_transcript");
    expect(session!.native_session_id).toBe("chatIdBare");
    expect(transcript!.agent_session_id).toBe("chatIdBare");
  });

  it("reads cursor cwd from sibling meta.json into agent_session", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "cursor-meta-cwd-"));
    const convDir = path.join(tempDir, "conv-meta");
    mkdirSync(convDir, { recursive: true });
    writeFileSync(path.join(convDir, "meta.json"), JSON.stringify({ cwd: "/Users/x/project" }));

    const dbPath = path.join(convDir, "store.db");
    const Database = (await import("../../src/repositories/sqlite/sqlite_driver.js")).default;
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE blobs (id TEXT PRIMARY KEY, data TEXT);
    `);
    db.prepare("INSERT INTO blobs (id, data) VALUES (?, ?)").run(
      "m1",
      Buffer.from(JSON.stringify({ role: "user", content: "hello from cursor" }), "utf-8").toString(
        "hex"
      )
    );
    db.close();

    const result = await parseTranscript({ filePath: dbPath, source: "cursor" });
    const session = conversationsToEntities(result.conversations, {
      contentHash: result.contentHash,
      fileSize: result.fileSize,
    }).find((e) => e.entity_type === "agent_session");

    expect(session).toMatchObject({
      harness: "cursor",
      native_session_id: "conv-meta",
      cwd: "/Users/x/project",
    });
  });
});
