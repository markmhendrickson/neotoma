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

export type TranscriptSource = "chatgpt" | "claude" | "slack" | "discord" | "meeting" | "other";

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

  if (basename === "conversations.json" || basename.includes("chatgpt")) return "chatgpt";
  if (basename.includes("claude")) return "claude";
  if (basename.includes("slack")) return "slack";
  if (basename.includes("discord")) return "discord";
  if (basename.includes("transcript") || ext === ".vtt" || ext === ".srt") return "meeting";

  if (content) {
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
        .sort(
          (a: any, b: any) =>
            (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0),
        );

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
          timestamp: msg.create_time
            ? new Date(msg.create_time * 1000).toISOString()
            : null,
          author: msg.author?.role === "user" ? "user" : msg.author?.role ?? "unknown",
          role: authorRole === "user"
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
        createdAt: conv.create_time
          ? new Date(conv.create_time * 1000).toISOString()
          : null,
        updatedAt: conv.update_time
          ? new Date(conv.update_time * 1000).toISOString()
          : null,
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseTranscript(
  options: IngestTranscriptOptions,
): Promise<TranscriptParseResult> {
  const resolvedPath = path.resolve(options.filePath);
  const content = await fs.readFile(resolvedPath, "utf-8");
  const source = options.source ?? detectSource(resolvedPath, content);
  const ext = path.extname(resolvedPath).toLowerCase();

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
    default:
      if (ext === ".json") {
        // Try ChatGPT format first, then Slack
        conversations = parseChatGptExport(content);
        if (conversations.length === 0) {
          conversations = parseSlackExport(content, resolvedPath);
        }
      } else if (ext === ".vtt" || ext === ".srt") {
        conversations = parseVttTranscript(content, resolvedPath);
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
        c.messages.some((m) => m.content.toLowerCase().includes(filterLower)),
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
  lines.push(`Parsed ${result.conversations.length} conversation${result.conversations.length === 1 ? "" : "s"} from ${path.basename(result.filePath)} (${result.source})\n`);
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
      lines.push(`    ${ts ? `[${ts}] ` : ""}${msg.author}: ${preview}${msg.content.length > 80 ? "..." : ""}`);
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
  conversations: ParsedConversation[],
): Array<Record<string, unknown>> {
  const entities: Array<Record<string, unknown>> = [];

  for (const conv of conversations) {
    entities.push({
      entity_type: "conversation",
      title: conv.title,
      source_platform: conv.source,
      message_count: conv.messages.length,
      started_at: conv.createdAt,
      ended_at: conv.updatedAt,
    });

    for (const msg of conv.messages) {
      entities.push({
        entity_type: "agent_message",
        role: msg.role === "unknown" ? "user" : msg.role,
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
