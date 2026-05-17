/**
 * Chat transcript parser for Neotoma onboarding.
 *
 * Parses exported chat transcripts from various platforms (ChatGPT, Slack,
 * Claude, Discord, meeting tools) and extracts structured messages with
 * timestamps, authors, and content for storage as observations.
 */
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranscriptSource =
  | "chatgpt"
  | "claude"
  | "slack"
  | "discord"
  | "meeting"
  | "claude-code"
  | "codex"
  | "cursor"
  | "other";

export interface ParsedMessage {
  timestamp: string | null;
  author: string;
  role: "user" | "assistant" | "system" | "unknown";
  content: string;
}

export interface ParsedConversation {
  id: string;
  title: string;
  source: TranscriptSource;
  messages: ParsedMessage[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TranscriptParseResult {
  conversations: ParsedConversation[];
  source: TranscriptSource;
  filePath: string;
  totalMessages: number;
}

export interface IngestTranscriptOptions {
  filePath: string;
  source?: TranscriptSource;
  preview?: boolean;
  limit?: number;
  filter?: string;
}

// ---------------------------------------------------------------------------
// Source detection
// ---------------------------------------------------------------------------

export function detectSource(filePath: string, content?: string): TranscriptSource {
  const basename = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const normalized = filePath.replace(/\\/g, "/");

  // Harness-specific path patterns (check before generic name patterns)
  if (normalized.includes("/.claude/projects/") && ext === ".jsonl") return "claude-code";
  if (normalized.includes("/.codex/archived_sessions/") && ext === ".jsonl") return "codex";
  if (
    (ext === ".db" && normalized.includes("/.cursor/chats/")) ||
    (ext === ".vscdb" && normalized.includes("/Cursor/User/globalStorage/"))
  )
    return "cursor";

  if (basename === "conversations.json" || basename.includes("chatgpt")) return "chatgpt";
  if (basename.includes("claude")) return "claude";
  if (basename.includes("slack")) return "slack";
  if (basename.includes("discord")) return "discord";
  if (basename.includes("transcript") || ext === ".vtt" || ext === ".srt") return "meeting";

  if (content) {
    // Sniff JSONL format: check first non-empty line
    const firstLine = content.split("\n").find((l) => l.trim().startsWith("{"));
    if (firstLine) {
      try {
        const obj = JSON.parse(firstLine);
        if (obj.type && obj.message?.role !== undefined && obj.message?.content !== undefined)
          return "claude-code";
        if (obj.timestamp !== undefined && obj.type !== undefined && obj.payload !== undefined)
          return "codex";
      } catch {
        // Not valid JSON line
      }
    }

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed[0]?.mapping) return "chatgpt";
      if (Array.isArray(parsed) && parsed[0]?.ts && parsed[0]?.user) return "slack";
    } catch {
      // Not JSON
    }
  }

  return "other";
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseChatGptExport(content: string): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];

  let data: any[];
  try {
    data = JSON.parse(content);
  } catch {
    return conversations;
  }

  if (!Array.isArray(data)) return conversations;

  for (const conv of data) {
    const messages: ParsedMessage[] = [];

    if (conv.mapping && typeof conv.mapping === "object") {
      const nodes = Object.values(conv.mapping) as any[];
      const sorted = nodes
        .filter((n: any) => n?.message?.content?.parts?.length > 0)
        .sort((a: any, b: any) => (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0));

      for (const node of sorted) {
        const msg = node.message;
        if (!msg) continue;

        const parts = msg.content?.parts ?? [];
        const textContent = parts
          .filter((p: any) => typeof p === "string")
          .join("\n")
          .trim();

        if (!textContent) continue;

        const authorRole = msg.author?.role ?? "unknown";
        messages.push({
          timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : null,
          author: msg.author?.role === "user" ? "user" : (msg.author?.role ?? "unknown"),
          role:
            authorRole === "user"
              ? "user"
              : authorRole === "assistant"
                ? "assistant"
                : authorRole === "system"
                  ? "system"
                  : "unknown",
          content: textContent,
        });
      }
    }

    if (messages.length > 0) {
      conversations.push({
        id: conv.id ?? `chatgpt-${conversations.length}`,
        title: conv.title ?? "Untitled conversation",
        source: "chatgpt",
        messages,
        createdAt: conv.create_time ? new Date(conv.create_time * 1000).toISOString() : null,
        updatedAt: conv.update_time ? new Date(conv.update_time * 1000).toISOString() : null,
      });
    }
  }

  return conversations;
}

function parseSlackExport(content: string, filePath: string): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];

  let data: any[];
  try {
    data = JSON.parse(content);
  } catch {
    return conversations;
  }

  if (!Array.isArray(data)) return conversations;

  const channelName = path.basename(path.dirname(filePath));
  const dateMatch = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  const dateStr = dateMatch?.[1] ?? null;

  const messages: ParsedMessage[] = [];

  for (const msg of data) {
    if (!msg.text || msg.subtype === "channel_join" || msg.subtype === "channel_leave") continue;

    messages.push({
      timestamp: msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : null,
      author: msg.user ?? msg.username ?? "unknown",
      role: "user",
      content: msg.text,
    });
  }

  if (messages.length > 0) {
    conversations.push({
      id: `slack-${channelName}-${dateStr ?? "unknown"}`,
      title: `#${channelName}${dateStr ? ` (${dateStr})` : ""}`,
      source: "slack",
      messages,
      createdAt: messages[0]?.timestamp ?? null,
      updatedAt: messages[messages.length - 1]?.timestamp ?? null,
    });
  }

  return conversations;
}

function parseVttTranscript(content: string, filePath: string): ParsedConversation[] {
  const lines = content.split("\n");
  const messages: ParsedMessage[] = [];
  let currentTimestamp: string | null = null;
  let currentSpeaker = "unknown";
  let currentText: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Timestamp line: 00:00:00.000 --> 00:00:05.000
    const timestampMatch = trimmed.match(/^(\d{2}:\d{2}:\d{2})/);
    if (timestampMatch) {
      if (currentText.length > 0) {
        messages.push({
          timestamp: currentTimestamp,
          author: currentSpeaker,
          role: "user",
          content: currentText.join(" ").trim(),
        });
        currentText = [];
      }
      currentTimestamp = timestampMatch[1];
      continue;
    }

    // Speaker label: "Speaker Name: text"
    const speakerMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (speakerMatch && !trimmed.startsWith("http") && trimmed.indexOf(":") < 40) {
      if (currentText.length > 0) {
        messages.push({
          timestamp: currentTimestamp,
          author: currentSpeaker,
          role: "user",
          content: currentText.join(" ").trim(),
        });
        currentText = [];
      }
      currentSpeaker = speakerMatch[1].trim();
      if (speakerMatch[2]) currentText.push(speakerMatch[2]);
      continue;
    }

    if (trimmed && trimmed !== "WEBVTT" && !trimmed.match(/^\d+$/)) {
      currentText.push(trimmed);
    }
  }

  if (currentText.length > 0) {
    messages.push({
      timestamp: currentTimestamp,
      author: currentSpeaker,
      role: "user",
      content: currentText.join(" ").trim(),
    });
  }

  if (messages.length === 0) return [];

  const title = path.basename(filePath, path.extname(filePath));
  return [
    {
      id: `meeting-${title}`,
      title,
      source: "meeting",
      messages,
      createdAt: messages[0]?.timestamp ?? null,
      updatedAt: messages[messages.length - 1]?.timestamp ?? null,
    },
  ];
}

function parseMarkdownTranscript(content: string, filePath: string): ParsedConversation[] {
  const lines = content.split("\n");
  const messages: ParsedMessage[] = [];
  let currentAuthor = "unknown";
  let currentRole: ParsedMessage["role"] = "unknown";
  let currentTimestamp: string | null = null;
  let currentText: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Header as speaker: ## User or ## Assistant or **User:**
    const headerMatch =
      trimmed.match(/^#{1,3}\s+(User|Assistant|Human|AI|System)/i) ??
      trimmed.match(/^\*\*(User|Assistant|Human|AI|System)\*\*:?\s*(.*)/i);

    if (headerMatch) {
      if (currentText.length > 0) {
        messages.push({
          timestamp: currentTimestamp,
          author: currentAuthor,
          role: currentRole,
          content: currentText.join("\n").trim(),
        });
        currentText = [];
      }

      const speaker = headerMatch[1].toLowerCase();
      currentAuthor = headerMatch[1];
      currentRole =
        speaker === "user" || speaker === "human"
          ? "user"
          : speaker === "assistant" || speaker === "ai"
            ? "assistant"
            : speaker === "system"
              ? "system"
              : "unknown";

      if (headerMatch[2]) currentText.push(headerMatch[2]);
      continue;
    }

    // Date pattern in content
    const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentTimestamp = dateMatch[1];
    }

    if (trimmed) {
      currentText.push(trimmed);
    }
  }

  if (currentText.length > 0) {
    messages.push({
      timestamp: currentTimestamp,
      author: currentAuthor,
      role: currentRole,
      content: currentText.join("\n").trim(),
    });
  }

  if (messages.length === 0) return [];

  const title = path.basename(filePath, path.extname(filePath));
  return [
    {
      id: `transcript-${title}`,
      title,
      source: detectSource(filePath, content),
      messages,
      createdAt: messages[0]?.timestamp ?? null,
      updatedAt: messages[messages.length - 1]?.timestamp ?? null,
    },
  ];
}

function parseClaudeCodeTranscript(content: string, filePath: string): ParsedConversation[] {
  const lines = content.split("\n").filter((l) => l.trim());
  const messages: ParsedMessage[] = [];

  for (const line of lines) {
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const type = obj.type as string | undefined;
    if (type !== "user" && type !== "assistant") continue;

    const msgContent = obj.message?.content;
    if (!msgContent) continue;

    let text: string;
    if (typeof msgContent === "string") {
      text = msgContent;
    } else if (Array.isArray(msgContent)) {
      text = msgContent
        .filter((b: any) => b.type === "text" && typeof b.text === "string")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
    } else {
      continue;
    }

    if (!text) continue;

    messages.push({
      timestamp: obj.timestamp ?? null,
      author: type,
      role: type === "user" ? "user" : "assistant",
      content: text,
    });
  }

  if (messages.length === 0) return [];

  const firstUser = messages.find((m) => m.role === "user");
  const titleFromContent = firstUser ? firstUser.content.slice(0, 80).replace(/\n/g, " ") : null;
  const titleFromDir = path.basename(path.dirname(filePath));
  const title = titleFromContent ?? titleFromDir;

  const fileBasename = path.basename(filePath, path.extname(filePath));

  return [
    {
      id: fileBasename,
      title,
      source: "claude-code",
      messages,
      createdAt: messages[0]?.timestamp ?? null,
      updatedAt: messages[messages.length - 1]?.timestamp ?? null,
    },
  ];
}

function parseCodexTranscript(content: string, filePath: string): ParsedConversation[] {
  const lines = content.split("\n").filter((l) => l.trim());
  const messages: ParsedMessage[] = [];
  let sessionId: string | null = null;
  let sessionTitle: string | null = null;

  for (const line of lines) {
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.type === "session_meta" && obj.payload) {
      sessionId = obj.payload.id ?? null;
      sessionTitle = obj.payload.title ?? null;
      continue;
    }

    if (obj.type === "response_item" && obj.payload?.type === "message") {
      const role = obj.payload.role as string | undefined;
      if (role !== "user" && role !== "assistant") continue;

      const rawContent = obj.payload.content;
      let text: string;
      if (typeof rawContent === "string") {
        text = rawContent;
      } else if (Array.isArray(rawContent)) {
        text = rawContent
          .filter(
            (b: any) =>
              (b.type === "text" || b.type === "output_text") && typeof b.text === "string"
          )
          .map((b: any) => b.text)
          .join("\n")
          .trim();
      } else {
        continue;
      }

      if (!text) continue;

      messages.push({
        timestamp: obj.timestamp ?? null,
        author: role,
        role: role === "user" ? "user" : "assistant",
        content: text,
      });
    }
  }

  if (messages.length === 0) return [];

  const fileBasename = path.basename(filePath, path.extname(filePath));
  const title = sessionTitle ?? fileBasename;

  return [
    {
      id: sessionId ?? fileBasename,
      title,
      source: "codex",
      messages,
      createdAt: messages[0]?.timestamp ?? null,
      updatedAt: messages[messages.length - 1]?.timestamp ?? null,
    },
  ];
}

async function parseCursorTranscript(dbPath: string): Promise<ParsedConversation[]> {
  let Database: any;
  try {
    const mod = await import("../repositories/sqlite/sqlite_driver.js");
    Database = mod.default;
  } catch {
    return [];
  }

  const conversations: ParsedConversation[] = [];
  const isStateVscdb = path.basename(dbPath) === "state.vscdb";

  let db: any;
  try {
    db = new Database(dbPath);
  } catch {
    return conversations;
  }

  try {
    if (isStateVscdb) {
      // Global state.vscdb: cursorDiskKV table with messageRequestContext:{conv_id}:{msg_id} keys
      let rows: any[];
      try {
        rows = db
          .prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'messageRequestContext:%'")
          .all();
      } catch {
        return conversations;
      }

      // Group by conversation UUID (second segment of key)
      const convMap = new Map<string, { msgId: string; value: string }[]>();
      for (const row of rows) {
        const parts = (row.key as string).split(":");
        if (parts.length < 3) continue;
        const convId = parts[1];
        const msgId = parts.slice(2).join(":");
        if (!convMap.has(convId)) convMap.set(convId, []);
        convMap.get(convId)!.push({ msgId, value: row.value });
      }

      for (const [convId, entries] of convMap) {
        const messages: ParsedMessage[] = [];
        for (const entry of entries) {
          let payload: any;
          try {
            payload = JSON.parse(entry.value);
          } catch {
            continue;
          }

          if (!payload || typeof payload !== "object") continue;
          const role = payload.role as string | undefined;
          if (role !== "user" && role !== "assistant") continue;

          const rawContent = payload.content ?? payload.text;
          let text: string;
          if (typeof rawContent === "string") {
            text = rawContent;
          } else if (Array.isArray(rawContent)) {
            text = rawContent
              .filter((b: any) => b.type === "text" && typeof b.text === "string")
              .map((b: any) => b.text)
              .join("\n")
              .trim();
          } else {
            continue;
          }

          if (!text) continue;

          messages.push({
            timestamp: payload.timestamp ?? null,
            author: role,
            role: role === "user" ? "user" : "assistant",
            content: text,
          });
        }

        if (messages.length > 0) {
          const firstUser = messages.find((m) => m.role === "user");
          const title = firstUser ? firstUser.content.slice(0, 80).replace(/\n/g, " ") : convId;
          conversations.push({
            id: `cursor-${convId}`,
            title,
            source: "cursor",
            messages,
            createdAt: messages[0]?.timestamp ?? null,
            updatedAt: messages[messages.length - 1]?.timestamp ?? null,
          });
        }
      }
    } else {
      // Per-workspace store.db: meta table for name, blobs table for message payloads
      let convName: string | null = null;
      try {
        const metaRow = db.prepare("SELECT value FROM meta WHERE key = 'name'").get() as {
          value: string;
        } | null;
        if (metaRow?.value) {
          try {
            convName = JSON.parse(metaRow.value);
          } catch {
            convName = metaRow.value;
          }
        }
      } catch {
        // meta table may not exist
      }

      let blobs: { id: string; data: any }[];
      try {
        blobs = db.prepare("SELECT id, data FROM blobs").all() as { id: string; data: any }[];
      } catch {
        return conversations;
      }

      const messages: ParsedMessage[] = [];
      for (const blob of blobs) {
        let raw: string;
        if (typeof blob.data === "string") {
          // Hex-encoded
          raw = Buffer.from(blob.data, "hex").toString("utf-8");
        } else if (blob.data instanceof Uint8Array || Buffer.isBuffer(blob.data)) {
          raw = Buffer.from(blob.data).toString("utf-8");
        } else {
          continue;
        }

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          continue;
        }

        const role = payload.role as string | undefined;
        if (role !== "user" && role !== "assistant") continue;

        const rawContent = payload.content ?? payload.text;
        let text: string;
        if (typeof rawContent === "string") {
          text = rawContent;
        } else if (Array.isArray(rawContent)) {
          text = rawContent
            .filter((b: any) => b.type === "text" && typeof b.text === "string")
            .map((b: any) => b.text)
            .join("\n")
            .trim();
        } else {
          continue;
        }

        if (!text) continue;

        messages.push({
          timestamp: payload.timestamp ?? null,
          author: role,
          role: role === "user" ? "user" : "assistant",
          content: text,
        });
      }

      if (messages.length > 0) {
        const convId = path.basename(path.dirname(dbPath));
        const firstUser = messages.find((m) => m.role === "user");
        const title =
          convName ?? (firstUser ? firstUser.content.slice(0, 80).replace(/\n/g, " ") : convId);
        conversations.push({
          id: `cursor-${convId}`,
          title,
          source: "cursor",
          messages,
          createdAt: messages[0]?.timestamp ?? null,
          updatedAt: messages[messages.length - 1]?.timestamp ?? null,
        });
      }
    }
  } finally {
    db.close();
  }

  return conversations;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseTranscript(
  options: IngestTranscriptOptions
): Promise<TranscriptParseResult> {
  const resolvedPath = path.resolve(options.filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  // Detect source before reading content (SQLite files shouldn't be read as text)
  const isSqlite = ext === ".db" || ext === ".vscdb";
  const content = isSqlite ? "" : await fs.readFile(resolvedPath, "utf-8");
  const source = options.source ?? detectSource(resolvedPath, isSqlite ? undefined : content);

  let conversations: ParsedConversation[];

  switch (source) {
    case "chatgpt":
      conversations = parseChatGptExport(content);
      break;
    case "slack":
      conversations = parseSlackExport(content, resolvedPath);
      break;
    case "meeting":
      if (ext === ".vtt" || ext === ".srt") {
        conversations = parseVttTranscript(content, resolvedPath);
      } else {
        conversations = parseMarkdownTranscript(content, resolvedPath);
      }
      break;
    case "claude-code":
      conversations = parseClaudeCodeTranscript(content, resolvedPath);
      break;
    case "codex":
      conversations = parseCodexTranscript(content, resolvedPath);
      break;
    case "cursor":
      conversations = await parseCursorTranscript(resolvedPath);
      break;
    default:
      if (ext === ".json") {
        // Try ChatGPT format first, then Slack
        conversations = parseChatGptExport(content);
        if (conversations.length === 0) {
          conversations = parseSlackExport(content, resolvedPath);
        }
      } else if (ext === ".vtt" || ext === ".srt") {
        conversations = parseVttTranscript(content, resolvedPath);
      } else if (ext === ".db" || ext === ".vscdb") {
        conversations = await parseCursorTranscript(resolvedPath);
      } else {
        conversations = parseMarkdownTranscript(content, resolvedPath);
      }
      break;
  }

  // Apply filter
  if (options.filter) {
    const filterLower = options.filter.toLowerCase();
    conversations = conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(filterLower) ||
        c.messages.some((m) => m.content.toLowerCase().includes(filterLower))
    );
  }

  // Apply limit
  if (options.limit && options.limit > 0) {
    conversations = conversations.slice(-options.limit);
  }

  const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);

  return {
    conversations,
    source,
    filePath: resolvedPath,
    totalMessages,
  };
}

/**
 * Format transcript parse results for terminal preview output.
 */
export function formatTranscriptPreview(result: TranscriptParseResult): string {
  if (result.conversations.length === 0) {
    return "No conversations found in the transcript file.";
  }

  const lines: string[] = [];
  lines.push(
    `Parsed ${result.conversations.length} conversation${result.conversations.length === 1 ? "" : "s"} from ${path.basename(result.filePath)} (${result.source})\n`
  );
  lines.push(`Total messages: ${result.totalMessages}\n`);

  for (const conv of result.conversations.slice(0, 10)) {
    const dateRange = [conv.createdAt, conv.updatedAt]
      .filter(Boolean)
      .map((d) => d!.split("T")[0])
      .join(" — ");

    lines.push(`  ${conv.title}${dateRange ? ` (${dateRange})` : ""}`);
    lines.push(`    ${conv.messages.length} messages`);

    // Show first few messages as preview
    for (const msg of conv.messages.slice(0, 3)) {
      const preview = msg.content.slice(0, 80).replace(/\n/g, " ");
      const ts = msg.timestamp ? msg.timestamp.split("T")[0] : "";
      lines.push(
        `    ${ts ? `[${ts}] ` : ""}${msg.author}: ${preview}${msg.content.length > 80 ? "..." : ""}`
      );
    }

    if (conv.messages.length > 3) {
      lines.push(`    ... and ${conv.messages.length - 3} more messages`);
    }

    lines.push("");
  }

  if (result.conversations.length > 10) {
    lines.push(`... and ${result.conversations.length - 10} more conversations`);
  }

  return lines.join("\n");
}

/**
 * Convert parsed conversations to Neotoma entity format for storage.
 */
export function conversationsToEntities(
  conversations: ParsedConversation[]
): Array<Record<string, unknown>> {
  const entities: Array<Record<string, unknown>> = [];

  for (const conv of conversations) {
    entities.push({
      entity_type: "conversation",
      conversation_id: conv.id,
      title: conv.title,
      source_platform: conv.source,
      message_count: conv.messages.length,
      started_at: conv.createdAt,
      ended_at: conv.updatedAt,
    });

    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i];
      const role = msg.role === "unknown" ? "user" : msg.role;
      entities.push({
        entity_type: "conversation_message",
        turn_key: `${conv.id}:${i}`,
        role,
        sender_kind: role,
        content: msg.content,
        author: msg.author,
        timestamp: msg.timestamp,
        source_platform: conv.source,
        conversation_title: conv.title,
      });
    }
  }

  return entities;
}
