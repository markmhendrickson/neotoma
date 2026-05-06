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
 *   entity extraction explicitly via the MCP **`store`** tool when it wants
 *   typed, schema-aware writes.
 *
 * The plugin exports a factory that returns an OpenCode plugin object.
 * OpenCode's plugin runtime calls the handlers it recognizes; unknown
 * ones are ignored.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  NeotomaClient,
  recordConversationTurn,
  type CreateRelationshipInput,
  type ListTimelineEventsInput,
  type RetrieveEntityByIdentifierInput,
  type StoreEntityInput,
  type StoreInput,
  type StoreResult,
} from "@neotoma/client";

export interface NeotomaOpenCodeOptions {
  baseUrl?: string;
  token?: string;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  /** Set to false to skip sending `additionalContext` on user messages. */
  injectContext?: boolean;
  /** Override cwd in stored provenance; defaults to the OpenCode directory or process cwd. */
  cwd?: string;
  /** Test seam or custom transport wrapper. */
  client?: NeotomaClientLike;
}

export interface NeotomaOpenCodeContext {
  project?: unknown;
  client?: unknown;
  $?: unknown;
  directory?: string;
  worktree?: string;
}

type NeotomaClientLike = {
  store(input: StoreInput): Promise<StoreResult>;
  retrieveEntityByIdentifier(input: RetrieveEntityByIdentifierInput): Promise<unknown>;
  listTimelineEvents(input: ListTimelineEventsInput): Promise<unknown>;
  createRelationship(input: CreateRelationshipInput): Promise<unknown>;
};

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
  const safeSession = sessionId || "opencode-unknown";
  const safeTurn = turnId || "unknown";
  return `conversation-${safeSession}-${safeTurn}-${suffix}`;
}

function harnessProvenance(
  cwd: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    data_source: "opencode-hook",
    harness: "opencode",
    cwd,
    ...(extra ?? {}),
  };
}

const NEOTOMA_TOOL_KEYWORDS = new Set([
  "submit_feedback",
  "get_feedback_status",
  "store",
  "store_structured",
  "store_unstructured",
  "retrieve_entities",
  "retrieve_entity_by_identifier",
  "create_relationship",
  "list_entity_types",
  "list_timeline_events",
]);

function isNeotomaRelevantTool(
  toolName: unknown,
  toolInput: unknown
): boolean {
  if (typeof toolName === "string") {
    const lower = toolName.toLowerCase();
    if (
      lower.includes("neotoma") ||
      lower.startsWith("mcp_neotoma") ||
      lower.startsWith("mcp_user-neotoma") ||
      NEOTOMA_TOOL_KEYWORDS.has(lower)
    ) {
      return true;
    }
  }
  if (toolInput && typeof toolInput === "object") {
    const record = toolInput as Record<string, unknown>;
    const commandLike = record.command ?? record.cmd ?? record.url;
    if (typeof commandLike === "string") {
      const lower = commandLike.toLowerCase();
      if (
        lower.startsWith("neotoma") ||
        lower.includes(" neotoma ") ||
        lower.includes("/neotoma/") ||
        lower.includes("neotoma.io")
      ) {
        return true;
      }
    }
  }
  return false;
}

function homeDirPattern(): RegExp | null {
  try {
    const dir = homedir();
    if (!dir) return null;
    return new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  } catch {
    return null;
  }
}

function scrubErrorMessage(raw: unknown): string {
  if (raw == null) return "";
  let text = typeof raw === "string" ? raw : String(raw);
  text = text.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "<EMAIL>"
  );
  text = text.replace(
    /\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b/g,
    "<TOKEN>"
  );
  text = text.replace(
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    "<UUID>"
  );
  text = text.replace(/\b(?:\+?\d[\s-]?){7,}\d\b/g, "<PHONE>");
  const homePattern = homeDirPattern();
  if (homePattern) text = text.replace(homePattern, "<HOME>");
  if (text.length > 400) text = `${text.slice(0, 397)}...`;
  return text;
}

function classifyErrorMessage(raw: unknown): string {
  if (raw == null) return "unknown";
  const text = typeof raw === "string" ? raw : String(raw);
  const errMatch = text.match(/ERR_[A-Z0-9_]+/);
  if (errMatch) return errMatch[0];
  const codeMatch = text.match(
    /\b(ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|EACCES|EPIPE|EPERM|EEXIST|ENOENT)\b/
  );
  if (codeMatch) return codeMatch[1];
  const statusMatch = text.match(/\bHTTP\s*(\d{3})\b/i);
  if (statusMatch) return `HTTP_${statusMatch[1]}`;
  if (/fetch failed/i.test(text)) return "fetch_failed";
  if (/timeout/i.test(text)) return "timeout";
  return "generic_error";
}

function extractErrorMessage(toolError: unknown, toolOutput: unknown): string {
  const candidate = toolError ?? toolOutput;
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object") {
    const record = candidate as Record<string, unknown>;
    const message = record.message;
    if (typeof message === "string") return message;
    try {
      return JSON.stringify(candidate);
    } catch {
      return String(candidate);
    }
  }
  return "";
}

function extractInvocationShape(toolInput: unknown): string[] {
  if (!toolInput || typeof toolInput !== "object") return [];
  return Object.keys(toolInput as Record<string, unknown>).slice(0, 32);
}

interface FailureCounterEntry {
  count: number;
  first_at: string;
  last_at: string;
  hinted: boolean;
}

interface FailureCounterState {
  session_id: string;
  updated_at: string;
  entries: Record<string, FailureCounterEntry>;
}

const FAILURE_TTL_MS = 24 * 60 * 60 * 1000;

function hookStateDir(): string {
  return (
    process.env.NEOTOMA_HOOK_STATE_DIR ??
    join(homedir(), ".neotoma", "hook-state")
  );
}

function failureStatePath(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  return join(hookStateDir(), `failures-${safe}.json`);
}

function readFailureState(sessionId: string): FailureCounterState {
  const path = failureStatePath(sessionId);
  if (!existsSync(path)) {
    return { session_id: sessionId, updated_at: "", entries: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return {
      session_id: raw.session_id ?? sessionId,
      updated_at: raw.updated_at ?? "",
      entries: raw.entries ?? {},
    };
  } catch {
    return { session_id: sessionId, updated_at: "", entries: {} };
  }
}

function writeFailureState(state: FailureCounterState): void {
  try {
    mkdirSync(hookStateDir(), { recursive: true });
    writeFileSync(failureStatePath(state.session_id), JSON.stringify(state));
  } catch {
    // swallow; advisory
  }
}

function pruneExpired(state: FailureCounterState): FailureCounterState {
  const now = Date.now();
  const entries: Record<string, FailureCounterEntry> = {};
  for (const [key, entry] of Object.entries(state.entries)) {
    const ts = Date.parse(entry.last_at);
    if (Number.isFinite(ts) && now - ts <= FAILURE_TTL_MS) {
      entries[key] = entry;
    }
  }
  return { ...state, entries };
}

function incrementFailureCounter(
  sessionId: string,
  toolName: string,
  errorClass: string
): FailureCounterEntry {
  const state = pruneExpired(readFailureState(sessionId));
  const key = `${toolName}::${errorClass}`;
  const nowIso = new Date().toISOString();
  const prior = state.entries[key];
  const next: FailureCounterEntry = prior
    ? {
        count: prior.count + 1,
        first_at: prior.first_at,
        last_at: nowIso,
        hinted: prior.hinted,
      }
    : { count: 1, first_at: nowIso, last_at: nowIso, hinted: false };
  state.entries[key] = next;
  state.updated_at = nowIso;
  writeFailureState(state);
  return next;
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

// ---------------------------------------------------------------------------
// Small-model detection + compact reminder
//
// Mirrors `packages/cursor-hooks/hooks/_common.ts`. The OpenCode plugin's
// `message.user` and `chat.system.transform` (experimental) surfaces use this
// to inject a prompt-local "must-do" block when the configured model looks
// like a small/fast model.
// ---------------------------------------------------------------------------

const DEFAULT_SMALL_MODEL_PATTERNS: string[] = [
  "auto",
  "composer-2",
  "composer 2",
  "gpt-5\\.5-fast",
  "gpt-5\\.5-mini",
  "gpt-4o-mini",
  "gpt-4\\.1-mini",
  "claude-haiku",
  "claude-3-haiku",
  "claude-3-5-haiku",
  "gemini-flash",
  "gemini-1\\.5-flash",
  "gemini-2\\.0-flash",
  "codex-mini",
  "o4-mini",
  "deepseek-v2",
  "qwen-2\\.5-flash",
];

function smallModelPatterns(): RegExp[] {
  const raw = process.env.NEOTOMA_HOOK_SMALL_MODEL_PATTERNS;
  const parts =
    raw && raw.trim().length > 0
      ? raw.split(",").map((p) => p.trim()).filter(Boolean)
      : DEFAULT_SMALL_MODEL_PATTERNS;
  const out: RegExp[] = [];
  for (const p of parts) {
    try {
      out.push(new RegExp(p, "i"));
    } catch {
      // ignore
    }
  }
  return out;
}

export function isSmallModel(model: string | null | undefined): boolean {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase();
  for (const pat of smallModelPatterns()) {
    if (pat.test(lower)) return true;
  }
  return false;
}

export function buildCompactReminder(
  model?: string | null | undefined
): string {
  const lines = [
    "Neotoma turn must-do (compact; full rules at MCP `instructions`):",
    "1. Bounded retrieval first when the user message implies known entities (retrieve_entity_by_identifier for ids, retrieve_entities for category lists).",
    "2. User-phase store (one **`store`** MCP call): conversation + user conversation_message (sender_kind=user) + any extracted entities; PART_OF message->conversation; REFERS_TO message->each extracted entity.",
    "3. Tool calls and host edits run AFTER step 2.",
    "4. Closing store: assistant conversation_message (sender_kind=assistant, exact reply text) with REFERS_TO to every entity the reply cites or produced; PART_OF same conversation.",
    "5. Display rule: when this turn created/updated/retrieved non-bookkeeping entities, the visible reply ends with a `🧠 Neotoma` section listing them as bullets.",
    "Forbidden: skipping store on greetings, persisting only the user message, ending the turn without the assistant store. Idempotency keys are per-turn unique.",
  ];
  if (isSmallModel(model)) {
    lines.push(
      `Note: this client (${
        model ?? "unknown"
      }) is on a small/fast model. Treat the above as a hard checklist.`
    );
  }
  return lines.join("\n");
}

const NEOTOMA_STORE_NAMES = new Set([
  "store",
  "store_structured",
  "store_unstructured",
  "mcp_neotoma_store",
  "mcp_user-neotoma_store",
  "mcp_neotoma_store_structured",
  "mcp_user-neotoma_store_structured",
]);

function looksLikeStoreStructured(
  toolName: unknown,
  toolInput: unknown
): boolean {
  if (typeof toolName === "string") {
    const lower = toolName.toLowerCase();
    if (
      NEOTOMA_STORE_NAMES.has(lower) ||
      lower.endsWith("_store_structured") ||
      lower.endsWith("_store_unstructured")
    )
      return true;
  }
  if (toolInput && typeof toolInput === "object") {
    const r = toolInput as Record<string, unknown>;
    if (Array.isArray(r.entities) && r.entities.length > 0) {
      const ok = (r.entities as unknown[]).every(
        (e) =>
          e !== null &&
          typeof e === "object" &&
          typeof (e as { entity_type?: unknown }).entity_type === "string"
      );
      if (ok) return true;
    }
  }
  return false;
}

interface TurnState {
  conversation_id: string;
  generation_id: string;
  model: string;
  store_structured_calls: number;
  tool_invocation_count: number;
  user_message_entity_id?: string;
  conversation_entity_id?: string;
  assistant_message_entity_id?: string;
}

function turnStatePath(conversationId: string, generationId: string): string {
  const safeConv =
    conversationId.replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  const safeGen = generationId.replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  return join(hookStateDir(), `turn-${safeConv}-${safeGen}.json`);
}

function readTurnState(
  conversationId: string,
  generationId: string
): TurnState {
  const path = turnStatePath(conversationId, generationId);
  if (!existsSync(path)) {
    return {
      conversation_id: conversationId,
      generation_id: generationId,
      model: "",
      store_structured_calls: 0,
      tool_invocation_count: 0,
    };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return {
      conversation_id: raw.conversation_id ?? conversationId,
      generation_id: raw.generation_id ?? generationId,
      model: raw.model ?? "",
      store_structured_calls: raw.store_structured_calls ?? 0,
      tool_invocation_count: raw.tool_invocation_count ?? 0,
      user_message_entity_id: raw.user_message_entity_id,
      conversation_entity_id: raw.conversation_entity_id,
      assistant_message_entity_id: raw.assistant_message_entity_id,
    };
  } catch {
    return {
      conversation_id: conversationId,
      generation_id: generationId,
      model: "",
      store_structured_calls: 0,
      tool_invocation_count: 0,
    };
  }
}

function writeTurnState(state: TurnState): void {
  try {
    mkdirSync(hookStateDir(), { recursive: true });
    writeFileSync(
      turnStatePath(state.conversation_id, state.generation_id),
      JSON.stringify(state)
    );
  } catch {
    // ignore
  }
}

function pickEntityId(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  return pickEntityIdAt(result, 0);
}

function pickEntityIdAt(result: unknown, index: number): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as {
    structured?: { entities?: Array<{ entity_id?: string }> };
    entities?: Array<{ entity_id?: string }>;
  };
  const first = (r.structured?.entities ?? r.entities)?.[index];
  if (first && typeof first.entity_id === "string") return first.entity_id;
  return undefined;
}

function looksLikeOpenCodeContext(value: unknown): value is NeotomaOpenCodeContext {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    "project" in record ||
    "directory" in record ||
    "worktree" in record ||
    "$" in record
  );
}

function contextOptions(ctx: NeotomaOpenCodeContext): NeotomaOpenCodeOptions {
  return {
    cwd: ctx.directory ?? ctx.worktree,
  };
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function extractSession(value: unknown): { id?: string; title?: string } {
  const record = asRecord(value);
  const session = asRecord(record.session ?? record.properties);
  return {
    id:
      readString(session, ["id", "session_id", "sessionID"]) ??
      readString(record, ["session_id", "sessionID"]),
    title:
      readString(session, ["title", "name"]) ??
      readString(record, ["title", "session_title"]),
  };
}

function extractMessage(value: unknown): {
  id?: string;
  text?: string;
  content?: string;
  role?: string;
} {
  const record = asRecord(value);
  const message = asRecord(record.message ?? record.part ?? record.properties);
  return {
    id:
      readString(message, ["id", "message_id", "part_id"]) ??
      readString(record, ["message_id", "part_id"]),
    text:
      readString(message, ["text", "body"]) ??
      readString(record, ["text", "body"]),
    content:
      readString(message, ["content"]) ??
      readString(record, ["content"]),
    role:
      readString(message, ["role", "speaker"]) ??
      readString(record, ["role", "speaker"]),
  };
}

function extractTurnId(value: unknown): string | undefined {
  const record = asRecord(value);
  return readString(record, ["turnId", "turn_id", "generation_id", "message_id"]);
}

/**
 * Factory returning an OpenCode plugin. Pass your options or rely on env.
 *
 * ```ts
 * // ~/.config/opencode/plugins/neotoma.ts
 * import neotoma from "@neotoma/opencode-plugin";
 * export const Neotoma = neotoma();
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
  const log = makeLogger(logLevel ?? "warn");
  const cwd = options.cwd ?? process.cwd();

  const client =
    options.client ?? new NeotomaClient({ transport: "http", baseUrl, token });

  const hooks = {
    name: "neotoma",

    async event(input: { event?: Record<string, unknown> }) {
      const event = asRecord(input.event ?? input);
      const type = readString(event, ["type"]);
      if (type === "session.created" || type === "session.updated") {
        await hooks["session.started"]({ session: extractSession(event) });
      } else if (type === "session.compacted") {
        await hooks["chat.compacted"]({
          session: extractSession(event),
          trigger: "event",
        });
      } else if (type === "message.updated") {
        const message = extractMessage(event);
        const session = extractSession(event);
        if (message.role === "user") {
          await hooks["message.user"]({ session, message });
        } else if (message.role === "assistant") {
          await hooks["message.assistant"]({ session, message });
        }
      }
    },

    async "session.started"(event: {
      session?: { id?: string; title?: string };
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      try {
        const result = await client.store({
          entities: [
            {
              entity_type: "conversation",
              conversation_id: sessionId,
              title: event.session?.title ?? "OpenCode session",
              session_id: sessionId,
              started_at: new Date().toISOString(),
              ...harnessProvenance(cwd, { hook_event: "session.started" }),
            },
          ],
          idempotency_key: makeIdempotencyKey(sessionId, "session", "start"),
        });
        const conversationEntityId = pickEntityId(result);
        if (conversationEntityId) {
          const state = readTurnState(sessionId, "session");
          writeTurnState({
            ...state,
            conversation_id: sessionId,
            generation_id: "session",
            conversation_entity_id: conversationEntityId,
          });
        }
      } catch (err) {
        log("warn", `session.started store failed: ${(err as Error).message}`);
      }
    },

    async "message.user"(event: {
      session?: { id?: string };
      message?: { id?: string; text?: string; content?: string };
      model?: string;
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = event.message?.id ?? "unknown";
      const prompt = event.message?.text ?? event.message?.content ?? "";
      const model = event.model ?? "";

      let userEntityId: string | undefined;
      let conversationEntityId: string | undefined;
      try {
        const result = await client.store({
          entities: [
            {
              entity_type: "conversation",
              conversation_id: sessionId,
              title: "OpenCode session",
              session_id: sessionId,
              ...harnessProvenance(cwd, { hook_event: "message.user" }),
            },
            {
              entity_type: "conversation_message",
              role: "user",
              sender_kind: "user",
              content: prompt,
              turn_key: `${sessionId}:${turnId}`,
              ...harnessProvenance(cwd, { hook_event: "message.user" }),
            },
          ],
          relationships: [
            {
              relationship_type: "PART_OF",
              source_index: 1,
              target_index: 0,
            },
          ],
          idempotency_key: makeIdempotencyKey(sessionId, turnId, "user"),
        });
        conversationEntityId = pickEntityIdAt(result, 0);
        userEntityId = pickEntityIdAt(result, 1);
      } catch (err) {
        log("warn", `message.user store failed: ${(err as Error).message}`);
      }

      writeTurnState({
        ...readTurnState(sessionId, turnId),
        conversation_id: sessionId,
        generation_id: turnId,
        model,
        user_message_entity_id: userEntityId,
        conversation_entity_id: conversationEntityId,
      });

      recordConversationTurn(client, {
        sessionId,
        turnId,
        hookEvent: "message.user",
        harness: "opencode",
        startedAt: new Date().toISOString(),
        cwd,
        conversationEntityId,
      }).catch(() => {});

      if (!injectContext) return {};

      const sections: Array<{ heading: string; body: unknown }> = [];
      for (const identifier of extractIdentifiers(prompt)) {
        try {
          const match = await client.retrieveEntityByIdentifier({ identifier });
          if (match)
            sections.push({ heading: `Entity: ${identifier}`, body: match });
        } catch (err) {
          log(
            "debug",
            `retrieveEntityByIdentifier(${identifier}) failed: ${
              (err as Error).message
            }`
          );
        }
      }
      try {
        const timeline = await client.listTimelineEvents({ limit: 5 });
        if (timeline)
          sections.push({ heading: "Recent timeline", body: timeline });
      } catch (err) {
        log("debug", `listTimelineEvents failed: ${(err as Error).message}`);
      }

      const parts: string[] = [];
      if (isSmallModel(model) || sections.length === 0) {
        parts.push(buildCompactReminder(model));
      }
      if (sections.length > 0) parts.push(formatContext(sections));
      if (parts.length === 0) return {};
      return { additionalContext: parts.join("\n\n") };
    },

    /**
     * Experimental OpenCode chat.system.transform branch. When the host
     * model is small/fast we splice the compact reminder onto the front of
     * the system prompt so it always appears in the model's working
     * context. This is the OpenCode equivalent of Cursor's
     * `sessionStart.additional_context`.
     */
    "experimental.chat.system.transform"(args: {
      system?: string;
      model?: string;
    }) {
      const model = args.model ?? "";
      if (!isSmallModel(model)) return {};
      const reminder = buildCompactReminder(model);
      const system =
        args.system && args.system.trim().length > 0
          ? `${reminder}\n\n${args.system}`
          : reminder;
      return { system };
    },

    async "experimental.session.compacting"(
      input: { session?: { id?: string }; model?: string },
      output: { context?: string[]; prompt?: string }
    ) {
      const model = input.model ?? "";
      output.context = output.context ?? [];
      output.context.push(buildCompactReminder(model));
      await hooks["chat.compacted"]({
        session: input.session,
        trigger: "experimental.session.compacting",
      });
    },

    async "tool.execute.after"(input: Record<string, unknown>, output: Record<string, unknown>) {
      const toolName =
        readString(input, ["tool", "tool_name", "name"]) ??
        readString(output, ["tool", "tool_name", "name"]) ??
        "unknown";
      await hooks["tool.called"]({
        session: extractSession(input),
        turnId: extractTurnId(input),
        tool: {
          name: toolName,
          input: output.args ?? input.args ?? input,
          output: output.result ?? output.output ?? output,
          error: output.error,
        },
      });
    },

    async "tool.called"(event: {
      session?: { id?: string };
      turnId?: string;
      tool?: {
        name?: string;
        input?: unknown;
        output?: unknown;
        error?: unknown;
      };
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = event.turnId ?? "unknown";
      const toolName = event.tool?.name ?? "unknown";
      const hasError = Boolean(event.tool?.error);
      const wasStore = looksLikeStoreStructured(toolName, event.tool?.input);

      const cur = readTurnState(sessionId, turnId);
      writeTurnState({
        ...cur,
        conversation_id: sessionId,
        generation_id: turnId,
        store_structured_calls:
          cur.store_structured_calls + (wasStore ? 1 : 0),
        tool_invocation_count: cur.tool_invocation_count + 1,
      });

      try {
        await client.store({
          entities: [
            {
              entity_type: "tool_invocation",
              tool_name: toolName,
              turn_key: `${sessionId}:${turnId}`,
              has_error: hasError,
              input_summary: summarize(event.tool?.input),
              output_summary: summarize(event.tool?.output),
              ...harnessProvenance(cwd, { hook_event: "tool.called" }),
            },
          ],
          idempotency_key: makeIdempotencyKey(
            sessionId,
            turnId,
            `tool-${toolName}`
          ),
        });
      } catch (err) {
        log("debug", `tool.called store failed: ${(err as Error).message}`);
      }

      recordConversationTurn(client, {
        sessionId,
        turnId,
        hookEvent: "tool.called",
        harness: "opencode",
        toolInvocationCount: 1,
        storeStructuredCalls: wasStore ? 1 : 0,
      }).catch(() => {});

      if (hasError && isNeotomaRelevantTool(toolName, event.tool?.input)) {
        const rawError = extractErrorMessage(
          event.tool?.error,
          event.tool?.output
        );
        const errorClass = classifyErrorMessage(rawError);
        const scrubbed = scrubErrorMessage(rawError);
        const counter = incrementFailureCounter(
          sessionId,
          toolName,
          errorClass
        );
        const failureEntity: StoreEntityInput = {
          entity_type: "tool_invocation_failure",
          tool_name: toolName,
          error_class: errorClass,
          error_message_redacted: scrubbed,
          invocation_shape: extractInvocationShape(event.tool?.input),
          turn_key: `${sessionId}:${turnId}`,
          hit_count_session: counter.count,
          ...harnessProvenance(cwd, { hook_event: "tool.called.failure" }),
        };
        try {
          await client.store({
            entities: [failureEntity],
            idempotency_key: makeIdempotencyKey(
              sessionId,
              turnId,
              `tool-failure-${toolName}-${errorClass}`
            ),
          });
        } catch (err) {
          log(
            "debug",
            `tool.called failure store failed: ${(err as Error).message}`
          );
        }
      }
    },

    async "chat.compacted"(event: {
      session?: { id?: string };
      trigger?: string;
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = event.trigger ?? "compact";
      try {
        await client.store({
          entities: [
            {
              entity_type: "context_event",
              event: "chat_compacted",
              trigger: event.trigger ?? "auto",
              turn_key: `${sessionId}:${turnId}`,
              observed_at: new Date().toISOString(),
              ...harnessProvenance(cwd, { hook_event: "chat.compacted" }),
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
      model?: string;
    }) {
      const sessionId = event.session?.id ?? "opencode-unknown";
      const turnId = event.message?.id ?? "unknown";
      const text = event.message?.text ?? event.message?.content ?? "";
      const state = readTurnState(sessionId, turnId);
      const model = event.model ?? state.model ?? "";

      let assistantEntityId: string | undefined;
      let conversationEntityId = state.conversation_entity_id;
      if (text) {
        try {
          const result = await client.store({
            entities: [
              {
                entity_type: "conversation",
                conversation_id: sessionId,
                title: "OpenCode session",
                session_id: sessionId,
                ...harnessProvenance(cwd, { hook_event: "message.assistant" }),
              },
              {
                entity_type: "conversation_message",
                role: "assistant",
                sender_kind: "assistant",
                content: text,
                turn_key: `${sessionId}:${turnId}:assistant`,
                observed_at: new Date().toISOString(),
                ...harnessProvenance(cwd, { hook_event: "message.assistant" }),
              },
            ],
            relationships: [
              {
                relationship_type: "PART_OF",
                source_index: 1,
                target_index: 0,
              },
            ],
            idempotency_key: makeIdempotencyKey(sessionId, turnId, "assistant"),
          });
          conversationEntityId = pickEntityIdAt(result, 0);
          assistantEntityId = pickEntityIdAt(result, 1);
        } catch (err) {
          log(
            "debug",
            `message.assistant store failed: ${(err as Error).message}`
          );
        }
      }

      const skippedStore = state.store_structured_calls === 0;
      const hadMaterial = Boolean(text) || state.tool_invocation_count > 0;
      if (skippedStore && hadMaterial) {
        if (!conversationEntityId) {
          try {
            const conv = await client.store({
              entities: [
                {
                  entity_type: "conversation",
                  conversation_id: sessionId,
                  title: `OpenCode session ${sessionId}`,
                  session_id: sessionId,
                  ...harnessProvenance(cwd, {
                    hook_event: "message.assistant_backfill",
                  }),
                },
              ],
              idempotency_key: `conversation-${sessionId}-root`,
            });
            conversationEntityId = pickEntityId(conv);
          } catch (err) {
            log(
              "debug",
              `assistant backfill conversation failed: ${
                (err as Error).message
              }`
            );
          }
        }
        if (conversationEntityId) {
          if (state.user_message_entity_id) {
            try {
              await client.createRelationship({
                relationship_type: "PART_OF",
                source_entity_id: state.user_message_entity_id,
                target_entity_id: conversationEntityId,
              });
            } catch {
              // ignore
            }
          }
          if (assistantEntityId) {
            try {
              await client.createRelationship({
                relationship_type: "PART_OF",
                source_entity_id: assistantEntityId,
                target_entity_id: conversationEntityId,
              });
            } catch {
              // ignore
            }
          }
        }
        recordConversationTurn(client, {
          sessionId,
          turnId,
          hookEvent: "message.assistant",
          harness: "opencode",
          model,
          status: "backfilled_by_hook",
          missedSteps: ["user_phase_store"],
          toolInvocationCount: state.tool_invocation_count,
          storeStructuredCalls: state.store_structured_calls,
          safetyNetUsed: true,
          endedAt: new Date().toISOString(),
          conversationEntityId: conversationEntityId ?? undefined,
        }).catch(() => {});
      }

      writeTurnState({
        ...state,
        conversation_id: sessionId,
        generation_id: turnId,
        model,
        assistant_message_entity_id:
          assistantEntityId ?? state.assistant_message_entity_id,
        conversation_entity_id:
          conversationEntityId ?? state.conversation_entity_id,
      });
    },
  };
  return hooks;
}

export function createNeotomaPlugin(options: NeotomaOpenCodeOptions = {}) {
  return async (ctx: NeotomaOpenCodeContext = {}) =>
    neotomaPlugin({ ...contextOptions(ctx), ...options });
}

export async function NeotomaPlugin(ctx: NeotomaOpenCodeContext = {}) {
  return neotomaPlugin(contextOptions(ctx));
}

export function neotoma(
  optionsOrContext: NeotomaOpenCodeOptions | NeotomaOpenCodeContext = {}
) {
  if (looksLikeOpenCodeContext(optionsOrContext)) {
    return neotomaPlugin(contextOptions(optionsOrContext));
  }
  return createNeotomaPlugin(optionsOrContext);
}

export default neotoma;
