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

// ---------------------------------------------------------------------------
// parseCursorTranscript (via parseTranscript)
// ---------------------------------------------------------------------------

describe("parseTranscript — cursor state.vscdb (global storage)", () => {
  /**
   * Create a state.vscdb-shaped SQLite database. Keys follow the
   * `messageRequestContext:{conv_id}:{msg_id}` format that the parser
   * groups on.
   */
  async function createStateVscdb(
    dir: string,
    entries: { convId: string; msgId: string; payload: object }[],
  ): Promise<string> {
    const Database = (await import("../../src/repositories/sqlite/sqlite_driver.js")).default;
    const dbPath = path.join(dir, "state.vscdb");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);`);
    const insert = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)");
    for (const e of entries) {
      insert.run(`messageRequestContext:${e.convId}:${e.msgId}`, JSON.stringify(e.payload));
    }
    db.close();
    return dbPath;
  }

  it("groups messages by conversation UUID, preserves order, sets cursor- prefix", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-vscdb-"));
    const filePath = await createStateVscdb(tempDir, [
      {
        convId: "conv-aaa",
        msgId: "msg-1",
        payload: { role: "user", content: "hello", timestamp: "2026-05-01T10:00:00Z" },
      },
      {
        convId: "conv-aaa",
        msgId: "msg-2",
        payload: { role: "assistant", content: "hi there", timestamp: "2026-05-01T10:00:05Z" },
      },
      {
        convId: "conv-bbb",
        msgId: "msg-1",
        payload: { role: "user", content: "another conversation entirely" },
      },
    ]);

    const result = await parseTranscript({ filePath, source: "cursor" });

    expect(result.conversations).toHaveLength(2);
    const aaa = result.conversations.find((c) => c.id === "cursor-conv-aaa");
    const bbb = result.conversations.find((c) => c.id === "cursor-conv-bbb");
    expect(aaa).toBeDefined();
    expect(bbb).toBeDefined();
    expect(aaa!.source).toBe("cursor");
    expect(aaa!.messages).toHaveLength(2);
    expect(aaa!.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(aaa!.title.startsWith("hello")).toBe(true);
    expect(bbb!.messages).toHaveLength(1);
    expect(result.totalMessages).toBe(3);
  });

  it("handles structured content blocks (array of {type:'text', text})", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-vscdb-"));
    const filePath = await createStateVscdb(tempDir, [
      {
        convId: "conv-1",
        msgId: "msg-1",
        payload: {
          role: "user",
          content: [
            { type: "text", text: "first block" },
            { type: "image", url: "https://example/img.png" }, // should be filtered
            { type: "text", text: "second block" },
          ],
        },
      },
    ]);

    const result = await parseTranscript({ filePath, source: "cursor" });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages[0].content).toBe("first block\nsecond block");
  });

  it("skips non-user/non-assistant roles and malformed entries", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-vscdb-"));
    const filePath = await createStateVscdb(tempDir, [
      { convId: "conv-1", msgId: "msg-1", payload: { role: "system", content: "skip me" } },
      { convId: "conv-1", msgId: "msg-2", payload: { role: "user", content: "keep me" } },
      { convId: "conv-1", msgId: "msg-3", payload: { role: "user" } }, // no content → skip
    ]);

    const result = await parseTranscript({ filePath, source: "cursor" });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].content).toBe("keep me");
  });

  it("returns no conversations when cursorDiskKV table is absent", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-vscdb-"));
    const Database = (await import("../../src/repositories/sqlite/sqlite_driver.js")).default;
    const filePath = path.join(tempDir, "state.vscdb");
    // Create a SQLite file without the expected table.
    const db = new Database(filePath);
    db.exec("CREATE TABLE unrelated (k TEXT);");
    db.close();

    const result = await parseTranscript({ filePath, source: "cursor" });
    expect(result.conversations).toHaveLength(0);
    expect(result.totalMessages).toBe(0);
  });
});

describe("parseTranscript — cursor store.db (per-workspace)", () => {
  /**
   * Create a store.db-shaped SQLite database with the meta + blobs tables
   * the parser reads. Blob `data` may be a hex-encoded string OR a binary
   * BLOB depending on the source Cursor version; cover both.
   */
  async function createStoreDb(
    dir: string,
    opts: {
      convName?: string;
      messages: { role: "user" | "assistant" | "system"; content: string }[];
      blobMode: "hex" | "buffer";
    },
  ): Promise<string> {
    const Database = (await import("../../src/repositories/sqlite/sqlite_driver.js")).default;
    // Cursor's per-workspace dbs live at .../chats/{ws}/{conv}/store.db; the
    // parser uses the parent dir name as conversation id, so place the file
    // at that depth.
    const convDir = path.join(dir, "conv-zzz");
    await fs.mkdir(convDir, { recursive: true });
    const dbPath = path.join(convDir, "store.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE blobs (id TEXT PRIMARY KEY, data ${opts.blobMode === "hex" ? "TEXT" : "BLOB"});
    `);
    if (opts.convName) {
      db.prepare("INSERT INTO meta (key, value) VALUES ('name', ?)").run(JSON.stringify(opts.convName));
    }
    const insertBlob = db.prepare("INSERT INTO blobs (id, data) VALUES (?, ?)");
    let i = 0;
    for (const m of opts.messages) {
      const raw = JSON.stringify(m);
      if (opts.blobMode === "hex") {
        insertBlob.run(`blob-${i}`, Buffer.from(raw, "utf-8").toString("hex"));
      } else {
        insertBlob.run(`blob-${i}`, Buffer.from(raw, "utf-8"));
      }
      i++;
    }
    db.close();
    return dbPath;
  }

  it("uses meta.name as title when present (hex-encoded blobs)", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-store-"));
    const filePath = await createStoreDb(tempDir, {
      convName: "Refactor session",
      blobMode: "hex",
      messages: [
        { role: "user", content: "let's refactor" },
        { role: "assistant", content: "ok" },
      ],
    });

    const result = await parseTranscript({ filePath, source: "cursor" });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe("cursor-conv-zzz");
    expect(result.conversations[0].title).toBe("Refactor session");
    expect(result.conversations[0].messages).toHaveLength(2);
    expect(result.totalMessages).toBe(2);
  });

  it("parses raw Buffer blobs (older Cursor versions)", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-store-"));
    const filePath = await createStoreDb(tempDir, {
      blobMode: "buffer",
      messages: [{ role: "user", content: "buffer-blob message" }],
    });

    const result = await parseTranscript({ filePath, source: "cursor" });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages[0].content).toBe("buffer-blob message");
  });

  it("falls back to first user message as title when meta.name is absent", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-store-"));
    const filePath = await createStoreDb(tempDir, {
      blobMode: "hex",
      messages: [{ role: "user", content: "this becomes the title" }],
    });

    const result = await parseTranscript({ filePath, source: "cursor" });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].title.startsWith("this becomes the title")).toBe(true);
  });

  it("skips malformed JSON blobs without aborting the parse", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-store-"));
    const convDir = path.join(tempDir, "conv-mixed");
    await fs.mkdir(convDir, { recursive: true });
    const dbPath = path.join(convDir, "store.db");
    const Database = (await import("../../src/repositories/sqlite/sqlite_driver.js")).default;
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE blobs (id TEXT PRIMARY KEY, data TEXT);
    `);
    db.prepare("INSERT INTO blobs (id, data) VALUES (?, ?)").run(
      "good",
      Buffer.from(JSON.stringify({ role: "user", content: "valid" }), "utf-8").toString("hex"),
    );
    // Hex string that decodes to invalid JSON.
    db.prepare("INSERT INTO blobs (id, data) VALUES (?, ?)").run(
      "bad",
      Buffer.from("not json at all", "utf-8").toString("hex"),
    );
    db.close();

    const result = await parseTranscript({ filePath: dbPath, source: "cursor" });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].content).toBe("valid");
  });

  it("returns no conversations when blobs table is absent", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-store-"));
    const convDir = path.join(tempDir, "conv-empty");
    await fs.mkdir(convDir, { recursive: true });
    const dbPath = path.join(convDir, "store.db");
    const Database = (await import("../../src/repositories/sqlite/sqlite_driver.js")).default;
    const db = new Database(dbPath);
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);");
    db.close();

    const result = await parseTranscript({ filePath: dbPath, source: "cursor" });
    expect(result.conversations).toHaveLength(0);
  });

  it("returns no conversations when file is not a valid SQLite database", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cursor-store-"));
    const convDir = path.join(tempDir, "conv-corrupt");
    await fs.mkdir(convDir, { recursive: true });
    const dbPath = path.join(convDir, "store.db");
    await fs.writeFile(dbPath, "this is not a sqlite file");

    const result = await parseTranscript({ filePath: dbPath, source: "cursor" });
    expect(result.conversations).toHaveLength(0);
  });
});
