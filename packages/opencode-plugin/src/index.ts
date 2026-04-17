/**
 * Neotoma plugin for OpenCode.
 *
 * OpenCode's plugin API exposes a set of lifecycle hooks (session
 * created, message from the user, tool invocation, chat compaction,
 * and session end). This plugin maps them onto Neotoma's state-layer
 * operations following the Option C architecture:
 *
 * - hooks are the reliability floor: they guarantee the session,
 *   user prompts, tool invocations, and compaction markers land in
 *   Neotoma even if the agent never calls MCP.
 * - MCP stays the quality ceiling: the agent still drives structured
 *   entity extraction explicitly via store_structured when it wants
 *   typed, schema-aware writes.
 *
 * The plugin exports a factory that returns an OpenCode plugin object.
 * OpenCode's plugin runtime calls the handlers it recognizes; unknown
 * ones are ignored.
 */

import { NeotomaClient } from "@neotoma/client";

export interface NeotomaOpenCodeOptions {
  baseUrl?: string;
  token?: string;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  /** Set to false to skip sending `additionalContext` on user messages. */
  injectContext?: boolean;
}

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const IDENTIFIER_PATTERN = /@([A-Za-z0-9_][A-Za-z0-9_.\-]{2,})/g;

function makeLogger(level: string) {
  const threshold = LEVEL_ORDER[level] ?? 2;
  return (lvl: string, message: string) => {
    const requested = LEVEL_ORDER[lvl] ?? 3;
    if (requested >= threshold) {
      process.stderr.write(`[neotoma-opencode] ${lvl}: ${message}\n`);
    }
  };
}

function extractIdentifiers(prompt: string): string[] {
  if (!prompt) return [];
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = IDENTIFIER_PATTERN.exec(prompt)) !== null) {
    found.add(match[1]);
    if (found.size >= 5) break;
  }
  return [...found];
}

function summarize(value: unknown, maxLen = 400): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "<unserializable>";
  }
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 3)}...`;
}

function makeIdempotencyKey(
  sessionId: string,
  turnId: string,
  suffix: string
): string {
  const safeSession = sessionId || `opencode-${Date.now()}`;
  const safeTurn = turnId || String(Date.now());
  return `conversation-${safeSession}-${safeTurn}-${suffix}`;
}

function harnessProvenance(
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    data_source: "opencode-hook",
    harness: "opencode",
    cwd: process.cwd(),
    ...(extra ?? {}),
  };
}

function formatContext(
  sections: Array<{ heading: string; body: unknown }>
): string {
  const lines: string[] = [];
  for (const { heading, body } of sections) {
    if (!body) continue;
    lines.push(`## ${heading}`);
    if (Array.isArray(body)) {
      for (const item of body.slice(0, 10)) {
        lines.push(`- ${JSON.stringify(item)}`);
      }
    } else {
      lines.push(JSON.stringify(body));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/**
 * Factory returning an OpenCode plugin. Pass your options or rely on env.
 *
 * ```ts
 * // ~/.config/opencode/plugins/neotoma.ts
 * import neotoma from "@neotoma/opencode-plugin";
 * export default neotoma();
 * ```
 */
export function neotomaPlugin(options: NeotomaOpenCodeOptions = {}) {
  const baseUrl =
    options.baseUrl ?? process.env.NEOTOMA_BASE_URL ?? "http://127.0.0.1:3080";
  const token = options.token ?? process.env.NEOTOMA_TOKEN ?? "dev-local";
  const logLevel =
    options.logLevel ??
    (process.env.NEOTOMA_LOG_LEVEL as NeotomaOpenCodeOptions["logLevel"]) ??
    "warn";
  const injectContext = options.injectContext ?? true;
  const log = makeLogger(logLevel);

  const client = new NeotomaClient({ transport: "http", baseUrl, token });

  return {
    name: "neotoma",

    async "session.started"(event: {
      session?: { id?: string; title?: string };
    }) {
      const sessionId = event.session?.id ?? `opencode-${Date.now()}`;
      try {
        await client.store({
          entities: [
            {
              entity_type: "conversation",
              title: event.session?.title ?? "OpenCode session",
              session_id: sessionId,
              started_at: new Date().toISOString(),
              ...harnessProvenance({ hook_event: "session.started" }),
            },
          ],
          idempotency_key: makeIdempotencyKey(sessionId, "session", "start"),
        });
      } catch (err) {
        log("warn", `session.started store failed: ${(err as Error).message}`);
      }
    },

    async "message.user"(event: {
      session?: { id?: string };
      message?: { id?: string; text?: string; content?: string };
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = event.message?.id ?? String(Date.now());
      const prompt = event.message?.text ?? event.message?.content ?? "";

      try {
        await client.store({
          entities: [
            {
              entity_type: "agent_message",
              role: "user",
              content: prompt,
              turn_key: `${sessionId}:${turnId}`,
              ...harnessProvenance({ hook_event: "message.user" }),
            },
          ],
          idempotency_key: makeIdempotencyKey(sessionId, turnId, "user"),
        });
      } catch (err) {
        log("warn", `message.user store failed: ${(err as Error).message}`);
      }

      if (!injectContext) return {};

      const sections: Array<{ heading: string; body: unknown }> = [];
      for (const identifier of extractIdentifiers(prompt)) {
        try {
          const match = await client.retrieveEntityByIdentifier({ identifier });
          if (match) sections.push({ heading: `Entity: ${identifier}`, body: match });
        } catch (err) {
          log(
            "debug",
            `retrieveEntityByIdentifier(${identifier}) failed: ${(err as Error).message}`
          );
        }
      }
      try {
        const timeline = await client.listTimelineEvents({ limit: 5 });
        if (timeline) sections.push({ heading: "Recent timeline", body: timeline });
      } catch (err) {
        log("debug", `listTimelineEvents failed: ${(err as Error).message}`);
      }
      if (sections.length === 0) return {};
      return { additionalContext: formatContext(sections) };
    },

    async "tool.called"(event: {
      session?: { id?: string };
      turnId?: string;
      tool?: { name?: string; input?: unknown; output?: unknown; error?: unknown };
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = event.turnId ?? String(Date.now());
      const toolName = event.tool?.name ?? "unknown";
      try {
        await client.store({
          entities: [
            {
              entity_type: "tool_invocation",
              tool_name: toolName,
              turn_key: `${sessionId}:${turnId}`,
              has_error: Boolean(event.tool?.error),
              input_summary: summarize(event.tool?.input),
              output_summary: summarize(event.tool?.output),
              ...harnessProvenance({ hook_event: "tool.called" }),
            },
          ],
          idempotency_key: makeIdempotencyKey(
            sessionId,
            turnId,
            `tool-${toolName}-${Date.now()}`
          ),
        });
      } catch (err) {
        log("debug", `tool.called store failed: ${(err as Error).message}`);
      }
    },

    async "chat.compacted"(event: {
      session?: { id?: string };
      trigger?: string;
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = String(Date.now());
      try {
        await client.store({
          entities: [
            {
              entity_type: "context_event",
              event: "chat_compacted",
              trigger: event.trigger ?? "auto",
              turn_key: `${sessionId}:${turnId}`,
              observed_at: new Date().toISOString(),
              ...harnessProvenance({ hook_event: "chat.compacted" }),
            },
          ],
          idempotency_key: makeIdempotencyKey(sessionId, turnId, "compact"),
        });
      } catch (err) {
        log("debug", `chat.compacted store failed: ${(err as Error).message}`);
      }
    },

    async "message.assistant"(event: {
      session?: { id?: string };
      message?: { id?: string; text?: string; content?: string };
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = event.message?.id ?? String(Date.now());
      const text = event.message?.text ?? event.message?.content ?? "";
      if (!text) return;
      try {
        await client.store({
          entities: [
            {
              entity_type: "agent_message",
              role: "assistant",
              content: text,
              turn_key: `${sessionId}:${turnId}:assistant`,
              observed_at: new Date().toISOString(),
              ...harnessProvenance({ hook_event: "message.assistant" }),
            },
          ],
          idempotency_key: makeIdempotencyKey(sessionId, turnId, "assistant"),
        });
      } catch (err) {
        log(
          "debug",
          `message.assistant store failed: ${(err as Error).message}`
        );
      }
    },
  };
}

export default neotomaPlugin;
