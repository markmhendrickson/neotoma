/**
 * OpenClaw native plugin entry point for Neotoma.
 *
 * Registers all Neotoma MCP tools as OpenClaw agent tools so that
 * `openclaw plugins install neotoma` makes Neotoma's structured memory
 * available in any OpenClaw session.
 *
 * The plugin declares `kind: "memory"` in its manifest, meaning users
 * can assign it to the memory slot via `plugins.slots.memory = "neotoma"`.
 */

import { buildToolDefinitions } from "./tool_definitions.js";
import { initDatabase } from "./db.js";
import { NeotomaServer } from "./server.js";

let serverInstance: NeotomaServer | null = null;
let initPromise: Promise<NeotomaServer> | null = null;
const NEOTOMA_RELEVANT_TOOL_NAMES = new Set([
  "submit_issue",
  "get_issue_status",
  "store",
  "store_structured",
  "store_unstructured",
  "retrieve_entities",
  "retrieve_entity_by_identifier",
  "create_relationship",
  "list_entity_types",
  "list_timeline_events",
]);

interface NeotomaPluginConfig {
  dataDir?: string;
  environment?: string;
  openaiApiKey?: string;
  encryptionEnabled?: boolean;
}

interface SessionStartEvent {
  sessionId: string;
  sessionKey?: string;
  resumedFrom?: string;
}

interface SessionContext {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
}

/** Context passed to message lifecycle hooks (extends session fields per OpenClaw docs). */
interface MessageHookContext extends SessionContext {
  runId?: string;
  messageId?: string;
  senderId?: string;
  traceId?: string;
  spanId?: string;
}

interface SessionEndEvent {
  sessionId: string;
  sessionKey?: string;
  messageCount: number;
  durationMs?: number;
  reason?: string;
  sessionFile?: string;
  transcriptArchived?: boolean;
  nextSessionId?: string;
  nextSessionKey?: string;
}

interface AfterToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

interface ToolContext {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
  toolCallId?: string;
  toolName?: string;
}

function applyConfig(cfg: NeotomaPluginConfig): void {
  if (cfg.dataDir) {
    process.env.NEOTOMA_DATA_DIR = cfg.dataDir;
  }
  if (cfg.environment) {
    process.env.NEOTOMA_ENV = cfg.environment;
  }
  if (cfg.openaiApiKey) {
    process.env.OPENAI_API_KEY = cfg.openaiApiKey;
  }
  if (cfg.encryptionEnabled !== undefined) {
    process.env.NEOTOMA_ENCRYPTION_ENABLED = cfg.encryptionEnabled ? "true" : "false";
  }
  process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
}

async function ensureServer(cfg: NeotomaPluginConfig): Promise<NeotomaServer> {
  if (serverInstance) return serverInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    applyConfig(cfg);
    await initDatabase();
    const server = new NeotomaServer();
    serverInstance = server;
    return server;
  })();

  return initPromise;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeIdempotencyKey(
  sessionId: string | undefined,
  turnId: string | undefined,
  suffix: string
) {
  const safeSession = sessionId?.trim() || "openclaw-unknown";
  const safeTurn = turnId?.trim() || String(Date.now());
  return `conversation-${safeSession}-${safeTurn}-${suffix}`;
}

function harnessProvenance(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data_source: "openclaw-hook",
    harness: "openclaw",
    cwd: process.cwd(),
    ...extra,
  };
}

async function withServerUser<T>(
  cfg: NeotomaPluginConfig,
  fn: (server: NeotomaServer, userId: string) => Promise<T>
): Promise<T> {
  const server = await ensureServer(cfg);
  const { ensureLocalDevUser } = await import("./services/local_auth.js");
  const localUser = ensureLocalDevUser();
  return fn(server, localUser.id);
}

async function storeEntities(
  cfg: NeotomaPluginConfig,
  userId: string,
  entities: Array<Record<string, unknown>>,
  idempotencyKey: string,
  relationships?: Array<Record<string, unknown>>
): Promise<void> {
  const server = await ensureServer(cfg);
  const payload: Record<string, unknown> = {
    entities,
    idempotency_key: idempotencyKey,
  };
  if (relationships && relationships.length > 0) {
    payload.relationships = relationships;
  }
  await server.executeToolForCli("store", payload, userId);
}

async function recordConversationTurn(
  cfg: NeotomaPluginConfig,
  userId: string,
  params: {
    sessionId: string;
    turnId: string;
    hookEvent: string;
    agentId?: string;
    sessionKey?: string;
    status?: string;
    toolInvocationCount?: number;
    neotomaToolFailures?: number;
    startedAt?: string;
    endedAt?: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  const entity: Record<string, unknown> = {
    entity_type: "conversation_turn",
    session_id: params.sessionId,
    turn_id: params.turnId,
    turn_key: `${params.sessionId}:${params.turnId}`,
    harness: "openclaw",
    hook_events: [params.hookEvent],
    ...harnessProvenance({ hook_event: params.hookEvent }),
  };

  if (params.agentId) entity.agent_id = params.agentId;
  if (params.sessionKey) entity.session_key = params.sessionKey;
  if (params.status) entity.status = params.status;
  if (params.toolInvocationCount !== undefined) {
    entity.tool_invocation_count = params.toolInvocationCount;
  }
  if (params.neotomaToolFailures !== undefined) {
    entity.neotoma_tool_failures = params.neotomaToolFailures;
  }
  if (params.startedAt) entity.started_at = params.startedAt;
  if (params.endedAt) entity.ended_at = params.endedAt;
  if (params.extra) Object.assign(entity, params.extra);

  await storeEntities(
    cfg,
    userId,
    [entity],
    makeIdempotencyKey(params.sessionId, params.turnId, "turn")
  );
}

function isNeotomaRelevantTool(toolName: string | undefined): boolean {
  if (!toolName) return false;
  const lower = toolName.toLowerCase();
  return lower.startsWith("neotoma__") || NEOTOMA_RELEVANT_TOOL_NAMES.has(lower);
}

function scrubErrorMessage(raw: unknown): string {
  if (raw == null) return "";
  let text = typeof raw === "string" ? raw : String(raw);
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<EMAIL>");
  text = text.replace(
    new RegExp("\\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\\b", "g"),
    "<TOKEN>"
  );
  text = text.replace(
    new RegExp("\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b", "gi"),
    "<UUID>"
  );
  if (process.env.HOME) {
    text = text.split(process.env.HOME).join("<HOME>");
  }
  if (text.length > 400) {
    text = `${text.slice(0, 397)}...`;
  }
  return text;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** Best-effort extract user-/assistant-visible text from OpenClaw message hook payloads. */
function extractMessageHookText(event: Record<string, unknown>): string {
  const top = event.content ?? event.text ?? event.prompt;
  if (typeof top === "string" && top.trim()) return top;
  const body = asRecord(event.body);
  if (body) {
    const t = body.text ?? body.content ?? body.message;
    if (typeof t === "string" && t.trim()) return t;
    const nested = asRecord(body.message);
    if (nested) {
      const nt = nested.content ?? nested.text;
      if (typeof nt === "string" && nt.trim()) return nt;
    }
  }
  const msg = asRecord(event.message);
  if (msg) {
    const t = msg.content ?? msg.text;
    if (typeof t === "string" && t.trim()) return t;
  }
  return "";
}

const MAX_HOOK_MESSAGE_CHARS = 120_000;

function truncateForStore(text: string): { content: string; truncated: boolean } {
  if (text.length <= MAX_HOOK_MESSAGE_CHARS) {
    return { content: text, truncated: false };
  }
  return {
    content: `${text.slice(0, MAX_HOOK_MESSAGE_CHARS)}\n\n[truncated by neotoma openclaw hook at ${MAX_HOOK_MESSAGE_CHARS} chars]`,
    truncated: true,
  };
}

function resolveMessageTurnId(
  event: Record<string, unknown>,
  ctx: MessageHookContext,
  role: "user" | "assistant"
): string {
  const fromCtx =
    (typeof ctx.messageId === "string" && ctx.messageId.trim()) ||
    (typeof ctx.runId === "string" && ctx.runId.trim());
  if (fromCtx) return role === "assistant" ? `${fromCtx}:reply` : fromCtx;

  const fromEvent =
    (typeof event.messageId === "string" && event.messageId.trim()) ||
    (typeof event.id === "string" && event.id.trim()) ||
    (typeof event.runId === "string" && event.runId.trim());
  if (fromEvent) return role === "assistant" ? `${fromEvent}:reply` : fromEvent;

  return `${role}-${Date.now()}`;
}

function resolveSessionId(event: Record<string, unknown>, ctx: MessageHookContext): string {
  return (
    (typeof ctx.sessionId === "string" && ctx.sessionId.trim()) ||
    (typeof event.sessionId === "string" && event.sessionId.trim()) ||
    "openclaw-unknown"
  );
}

function classifyErrorMessage(raw: unknown): string {
  if (raw == null) return "unknown";
  const text = typeof raw === "string" ? raw : String(raw);
  const errCode = text.match(new RegExp("\\bERR_[A-Z0-9_]+\\b"));
  if (errCode) return errCode[0];
  const sysCode = text.match(
    new RegExp(
      "\\b(ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|EACCES|EPIPE|EPERM|EEXIST|ENOENT)\\b"
    )
  );
  if (sysCode) return sysCode[1];
  const httpCode = text.match(new RegExp("\\bHTTP\\s*(\\d{3})\\b", "i"));
  if (httpCode) return `HTTP_${httpCode[1]}`;
  if (/fetch failed/i.test(text)) return "fetch_failed";
  if (/timeout/i.test(text)) return "timeout";
  return "generic_error";
}

interface PluginApi {
  config?: NeotomaPluginConfig;
  registerTool(def: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(
      id: string,
      params: Record<string, unknown>
    ): Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
  }): void;
  on?<
    K extends
      | "session_start"
      | "session_end"
      | "after_tool_call"
      | "message_received"
      | "message_sent",
  >(
    hookName: K,
    handler: (
      event: K extends "session_start"
        ? SessionStartEvent
        : K extends "session_end"
          ? SessionEndEvent
          : K extends "after_tool_call"
            ? AfterToolCallEvent
            : Record<string, unknown>,
      ctx: K extends "after_tool_call"
        ? ToolContext
        : K extends "message_received" | "message_sent"
          ? MessageHookContext
          : SessionContext
    ) => Promise<void> | void,
    opts?: { priority?: number }
  ): void;
  logger?: {
    warn(message: string): void;
  };
}

/**
 * Plugin entry object conforming to the OpenClaw plugin interface.
 *
 * When loaded by OpenClaw, the host wraps this with `definePluginEntry`
 * from `openclaw/plugin-sdk/plugin-entry`. The export shape (id, name,
 * description, register) satisfies the native plugin contract.
 */
const neotomaPlugin = {
  id: "neotoma",
  name: "Neotoma",
  description:
    "Structured personal data memory with append-only observations, schema evolution, and provenance tracking",

  register(api: PluginApi) {
    const pluginConfig: NeotomaPluginConfig = api.config ?? {};
    const tools = buildToolDefinitions();

    for (const tool of tools) {
      api.registerTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,

        async execute(_id: string, params: Record<string, unknown>) {
          const server = await ensureServer(pluginConfig);
          const { ensureLocalDevUser } = await import("./services/local_auth.js");
          const localUser = ensureLocalDevUser();
          return server.executeToolForCli(tool.name, params, localUser.id);
        },
      });
    }

    api.on?.(
      "session_start",
      async (event, ctx) => {
        try {
          await withServerUser(pluginConfig, async (_server, userId) => {
            const startedAt = nowIso();
            await storeEntities(
              pluginConfig,
              userId,
              [
                {
                  entity_type: "conversation",
                  conversation_id: event.sessionId,
                  title: "OpenClaw session",
                  session_id: event.sessionId,
                  session_key: event.sessionKey,
                  started_at: startedAt,
                  resumed_from: event.resumedFrom,
                  agent_id: ctx.agentId,
                  ...harnessProvenance({ hook_event: "session_start" }),
                },
              ],
              makeIdempotencyKey(event.sessionId, "session", "start")
            );
            await recordConversationTurn(pluginConfig, userId, {
              sessionId: event.sessionId,
              turnId: "session",
              hookEvent: "session_start",
              agentId: ctx.agentId,
              sessionKey: event.sessionKey,
              startedAt,
              extra: event.resumedFrom ? { resumed_from: event.resumedFrom } : undefined,
            });
          });
        } catch (error) {
          api.logger?.warn(`Neotoma session_start hook failed: ${String(error)}`);
        }
      },
      { priority: 50 }
    );

    api.on?.(
      "session_end",
      async (event, ctx) => {
        try {
          await withServerUser(pluginConfig, async (_server, userId) => {
            const observedAt = nowIso();
            await storeEntities(
              pluginConfig,
              userId,
              [
                {
                  entity_type: "context_event",
                  event: "session_end",
                  message: event.reason ?? "session_end",
                  turn_key: `${event.sessionId}:session-end`,
                  observed_at: observedAt,
                  session_id: event.sessionId,
                  session_key: event.sessionKey,
                  agent_id: ctx.agentId,
                  message_count: event.messageCount,
                  duration_ms: event.durationMs,
                  transcript_archived: event.transcriptArchived,
                  next_session_id: event.nextSessionId,
                  next_session_key: event.nextSessionKey,
                  session_file: event.sessionFile,
                  ...harnessProvenance({ hook_event: "session_end" }),
                },
              ],
              makeIdempotencyKey(event.sessionId, "session-end", "event")
            );
            await recordConversationTurn(pluginConfig, userId, {
              sessionId: event.sessionId,
              turnId: "session-end",
              hookEvent: "session_end",
              agentId: ctx.agentId,
              sessionKey: event.sessionKey,
              status: event.reason ?? "session_end",
              endedAt: observedAt,
              extra: {
                message_count: event.messageCount,
                duration_ms: event.durationMs,
                transcript_archived: event.transcriptArchived,
              },
            });
          });
        } catch (error) {
          api.logger?.warn(`Neotoma session_end hook failed: ${String(error)}`);
        }
      },
      { priority: 50 }
    );

    api.on?.(
      "message_received",
      async (rawEvent, ctx) => {
        const event = asRecord(rawEvent) ?? {};
        const sessionId = resolveSessionId(event, ctx);
        const rawText = extractMessageHookText(event);
        if (!rawText.trim()) {
          return;
        }
        const { content, truncated } = truncateForStore(rawText);
        const turnId = resolveMessageTurnId(event, ctx, "user");

        try {
          await withServerUser(pluginConfig, async (_server, userId) => {
            const observedAt = nowIso();
            await storeEntities(
              pluginConfig,
              userId,
              [
                {
                  entity_type: "conversation",
                  conversation_id: sessionId,
                  title: "OpenClaw session",
                  session_id: sessionId,
                  session_key: ctx.sessionKey,
                  agent_id: ctx.agentId,
                  ...harnessProvenance({ hook_event: "message_received" }),
                },
                {
                  entity_type: "conversation_message",
                  role: "user",
                  sender_kind: "user",
                  content,
                  turn_key: `${sessionId}:${turnId}`,
                  observed_at: observedAt,
                  openclaw_thread_id:
                    typeof event.threadId === "string" ? event.threadId : undefined,
                  openclaw_sender_id:
                    ctx.senderId ??
                    (typeof event.senderId === "string" ? event.senderId : undefined),
                  content_truncated: truncated || undefined,
                  ...harnessProvenance({ hook_event: "message_received" }),
                },
              ],
              makeIdempotencyKey(sessionId, turnId, "inbound-msg"),
              [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }]
            );
            await recordConversationTurn(pluginConfig, userId, {
              sessionId,
              turnId,
              hookEvent: "message_received",
              agentId: ctx.agentId,
              sessionKey: ctx.sessionKey,
              startedAt: observedAt,
              extra: {
                inbound_preview_chars: Math.min(content.length, 512),
              },
            });
          });
        } catch (error) {
          api.logger?.warn(`Neotoma message_received hook failed: ${String(error)}`);
        }
      },
      { priority: 50 }
    );

    api.on?.(
      "message_sent",
      async (rawEvent, ctx) => {
        const event = asRecord(rawEvent) ?? {};
        const sessionId = resolveSessionId(event, ctx);
        const rawText = extractMessageHookText(event);
        if (!rawText.trim()) {
          return;
        }
        const { content, truncated } = truncateForStore(rawText);
        const turnId = resolveMessageTurnId(event, ctx, "assistant");

        try {
          await withServerUser(pluginConfig, async (_server, userId) => {
            const observedAt = nowIso();
            await storeEntities(
              pluginConfig,
              userId,
              [
                {
                  entity_type: "conversation",
                  conversation_id: sessionId,
                  title: "OpenClaw session",
                  session_id: sessionId,
                  session_key: ctx.sessionKey,
                  agent_id: ctx.agentId,
                  ...harnessProvenance({ hook_event: "message_sent" }),
                },
                {
                  entity_type: "conversation_message",
                  role: "assistant",
                  sender_kind: "assistant",
                  content,
                  turn_key: `${sessionId}:${turnId}:assistant`,
                  observed_at: observedAt,
                  delivery_ok: typeof event.success === "boolean" ? event.success : undefined,
                  content_truncated: truncated || undefined,
                  ...harnessProvenance({ hook_event: "message_sent" }),
                },
              ],
              makeIdempotencyKey(sessionId, turnId, "outbound-msg"),
              [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }]
            );
            await recordConversationTurn(pluginConfig, userId, {
              sessionId,
              turnId,
              hookEvent: "message_sent",
              agentId: ctx.agentId,
              sessionKey: ctx.sessionKey,
              endedAt: observedAt,
              extra: {
                outbound_preview_chars: Math.min(content.length, 512),
              },
            });
          });
        } catch (error) {
          api.logger?.warn(`Neotoma message_sent hook failed: ${String(error)}`);
        }
      },
      { priority: 50 }
    );

    api.on?.(
      "after_tool_call",
      async (event, ctx) => {
        if (!event.error || !isNeotomaRelevantTool(event.toolName)) {
          return;
        }

        try {
          await withServerUser(pluginConfig, async (_server, userId) => {
            const turnId = event.toolCallId || event.runId || String(Date.now());
            await storeEntities(
              pluginConfig,
              userId,
              [
                {
                  entity_type: "tool_invocation_failure",
                  tool_name: event.toolName,
                  error_class: classifyErrorMessage(event.error),
                  error_message_redacted: scrubErrorMessage(event.error),
                  turn_key: `${ctx.sessionId ?? "openclaw-unknown"}:${turnId}`,
                  session_id: ctx.sessionId,
                  session_key: ctx.sessionKey,
                  run_id: event.runId,
                  tool_call_id: event.toolCallId,
                  duration_ms: event.durationMs,
                  agent_id: ctx.agentId,
                  ...harnessProvenance({ hook_event: "after_tool_call" }),
                },
              ],
              makeIdempotencyKey(ctx.sessionId, turnId, `tool-failure-${event.toolName}`)
            );
            if (ctx.sessionId) {
              await recordConversationTurn(pluginConfig, userId, {
                sessionId: ctx.sessionId,
                turnId,
                hookEvent: "after_tool_call",
                agentId: ctx.agentId,
                sessionKey: ctx.sessionKey,
                neotomaToolFailures: 1,
                toolInvocationCount: 1,
                extra: {
                  tool_name: event.toolName,
                  status: "tool_failure",
                },
              });
            }
          });
        } catch (error) {
          api.logger?.warn(`Neotoma after_tool_call hook failed: ${String(error)}`);
        }
      },
      { priority: 50 }
    );
  },
};

export default neotomaPlugin;
