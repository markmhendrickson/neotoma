/**
 * Shared helpers for Neotoma Cursor hooks.
 *
 * Cursor hooks receive a JSON payload on stdin and may write a JSON
 * response to stdout. All Neotoma hooks are best-effort — a failure
 * here must never block the agent turn. We catch every exception and
 * log to stderr.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { NeotomaClient, type StoreEntityInput } from "@neotoma/client";

const NEOTOMA_BASE_URL = process.env.NEOTOMA_BASE_URL ?? "http://127.0.0.1:3080";
const NEOTOMA_TOKEN = process.env.NEOTOMA_TOKEN ?? "dev-local";
const NEOTOMA_LOG_LEVEL = (process.env.NEOTOMA_LOG_LEVEL ?? "warn").toLowerCase();

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export function log(level: string, message: string): void {
  const current = LEVEL_ORDER[NEOTOMA_LOG_LEVEL] ?? 2;
  const requested = LEVEL_ORDER[level] ?? 3;
  if (requested >= current) {
    process.stderr.write(`[neotoma-cursor] ${level}: ${message}\n`);
  }
}

export async function readHookInput<T = Record<string, unknown>>(): Promise<T> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      if (!data.trim()) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(data) as T);
      } catch (err) {
        log("warn", `Failed to parse hook input: ${(err as Error).message}`);
        resolve({} as T);
      }
    });
    if ((process.stdin as { readableEnded?: boolean }).readableEnded) {
      resolve({} as T);
    }
  });
}

export function writeHookOutput(payload: Record<string, unknown>): void {
  try {
    process.stdout.write(JSON.stringify(payload));
  } catch (err) {
    log("warn", `Failed to write hook output: ${(err as Error).message}`);
  }
}

export function getClient(): NeotomaClient | null {
  try {
    return new NeotomaClient({
      transport: "http",
      baseUrl: NEOTOMA_BASE_URL,
      token: NEOTOMA_TOKEN,
    });
  } catch (err) {
    log("warn", `Failed to construct NeotomaClient: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Returns true when an error looks like an expected, transient network
 * failure (Neotoma server not running, DNS hiccup, etc.). Used to
 * downgrade log level so the Cursor warning panel doesn't fire on
 * best-effort background writes.
 */
export function isExpectedNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  if (
    message.includes("fetch failed") ||
    message.includes("network error") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  ) {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return false;
  const code = (cause as { code?: string }).code;
  return (
    code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET" || code === "ETIMEDOUT"
  );
}

export function makeIdempotencyKey(sessionId: string, turnId: string, suffix: string): string {
  const safeSession = sessionId || `cursor-${Date.now()}`;
  const safeTurn = turnId || String(Date.now());
  return `conversation-${safeSession}-${safeTurn}-${suffix}`;
}

export function harnessProvenance(extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    data_source: "cursor-hook",
    harness: "cursor",
    cwd: process.cwd(),
    ...(extra ?? {}),
  };
}

export interface HookWorkspaceContext {
  clientName?: string;
  harness?: string;
  workspaceKind?: string;
  repositoryName?: string;
  repositoryRoot?: string;
  repositoryRemote?: string;
  scopeSummary?: string;
  workingDirectory?: string;
  gitBranch?: string;
  activeFileRefs?: string[];
  contextSource?: string;
}

function firstString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function runGit(cwd: string, args: string[]): string | undefined {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1_500,
    }).trim();
    return output || undefined;
  } catch {
    return undefined;
  }
}

function redactRepositoryRemote(remote: string | undefined): string | undefined {
  if (!remote) return undefined;
  return remote
    .replace(/:\/\/([^/@]+)@/g, "://<redacted>@")
    .replace(/([?&](?:access_token|auth|key|password|token)=)[^&]+/gi, "$1<redacted>");
}

function extractActiveFileRefs(input: Record<string, unknown>): string[] {
  const candidates = [
    input.active_file_refs,
    input.activeFileRefs,
    input.active_file_paths,
    input.activeFilePaths,
    input.open_files,
    input.openFiles,
    input.visible_files,
    input.visibleFiles,
  ];
  const refs: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      refs.push(candidate.trim());
    } else if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === "string" && item.trim()) refs.push(item.trim());
      }
    }
  }
  return Array.from(new Set(refs)).slice(0, 10);
}

export function collectHookWorkspaceContext(
  input: Record<string, unknown> = {}
): HookWorkspaceContext {
  const workingDirectory =
    firstString(input, [
      "working_directory",
      "workingDirectory",
      "workspace_path",
      "workspacePath",
      "project_path",
      "projectPath",
      "cwd",
    ]) ?? process.cwd();
  const repositoryRoot =
    firstString(input, ["repository_root", "repositoryRoot"]) ??
    runGit(workingDirectory, ["rev-parse", "--show-toplevel"]);
  const gitBranch =
    firstString(input, ["git_branch", "gitBranch"]) ??
    runGit(workingDirectory, ["branch", "--show-current"]) ??
    runGit(workingDirectory, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const repositoryRemote = redactRepositoryRemote(
    firstString(input, ["repository_remote", "repositoryRemote"]) ??
      runGit(workingDirectory, ["config", "--get", "remote.origin.url"])
  );
  const workspaceKind = repositoryRoot ? "git_repository" : "plain_directory";
  const repositoryName =
    firstString(input, ["repository_name", "repositoryName"]) ??
    basename(repositoryRoot ?? workingDirectory);
  const scopeSummary =
    firstString(input, ["scope_summary", "scopeSummary"]) ??
    `Cursor session in ${workspaceKind.replace(/_/g, " ")} ${repositoryName}.`;
  const activeFileRefs = extractActiveFileRefs(input);

  return {
    clientName: "Cursor",
    harness: "cursor-hook",
    workspaceKind,
    repositoryName,
    repositoryRoot,
    repositoryRemote,
    scopeSummary,
    workingDirectory,
    gitBranch,
    activeFileRefs: activeFileRefs.length > 0 ? activeFileRefs : undefined,
    contextSource: "cursor-hook",
  };
}

export function conversationContextFields(context: HookWorkspaceContext): Record<string, unknown> {
  return {
    client_name: context.clientName,
    harness: context.harness,
    workspace_kind: context.workspaceKind,
    repository_name: context.repositoryName,
    repository_root: context.repositoryRoot,
    repository_remote: context.repositoryRemote,
    scope_summary: context.scopeSummary,
  };
}

export function turnContextFields(
  context: HookWorkspaceContext
): Pick<
  ConversationTurnObservationInput,
  "workingDirectory" | "gitBranch" | "activeFileRefs" | "contextSource"
> {
  return {
    workingDirectory: context.workingDirectory,
    gitBranch: context.gitBranch,
    activeFileRefs: context.activeFileRefs,
    contextSource: context.contextSource,
  };
}

/**
 * Per-turn observation each Cursor hook contributes onto the shared
 * `conversation_turn` entity for `(sessionId, turnId)`. Every field is
 * optional — hooks supply only the subset they observe; the server
 * reducer collapses every contribution onto a single entity via the
 * composite identity rule `[session_id, turn_id]`.
 *
 * `turn_compliance` and `turn_activity` are accepted aliases of
 * `conversation_turn` so legacy rows resolve to the same entity.
 */
export interface ConversationTurnObservationInput {
  sessionId: string;
  turnId: string;
  hookEvent?: string;
  harness?: string;
  harnessVersion?: string;
  model?: string;
  status?: string;
  conversationEntityId?: string;
  missedSteps?: string[];
  toolInvocationCount?: number;
  storeStructuredCalls?: number;
  retrieveCalls?: number;
  neotomaToolFailures?: number;
  harnessLoopCount?: number;
  injectedContextChars?: number;
  retrievedEntityIds?: string[];
  storedEntityIds?: string[];
  failureHintShown?: boolean;
  safetyNetUsed?: boolean;
  /**
   * True when one of the reminder-injecting hooks (sessionStart,
   * postToolUse) emitted a compact reminder during this turn. Read by
   * the stop-hook root-cause classifier to distinguish
   * "agent ignored available instructions" from
   * "instruction delivery missing or stale".
   */
  reminderInjected?: boolean;
  /**
   * Bounded root-cause classification for skipped-store turns. Set by
   * {@link diagnoseSkippedStore} on the stop hook. Shape is intentionally
   * forward-compatible: the schema accepts arbitrary fields, callers
   * should rely only on the documented `classification`, `signals`, and
   * `local_build` keys.
   */
  instructionDiagnostics?: Record<string, unknown>;
  /**
   * Repair hints for the local repo build that owns the instruction
   * pipeline. Hooks NEVER mutate user/client config automatically; this
   * is a record-only field surfaced via the `conversation_turn` entity
   * for operators / Inspector.
   */
  recommendedRepairs?: string[];
  /**
   * Confidence level for {@link instructionDiagnostics.classification}.
   * "high" only when a single classifier matches with strong evidence;
   * "unknown" when signals are ambiguous.
   */
  diagnosisConfidence?: "high" | "medium" | "low" | "unknown";
  startedAt?: string;
  endedAt?: string;
  cwd?: string;
  workingDirectory?: string;
  gitBranch?: string;
  activeFileRefs?: string[];
  contextSource?: string;
  extra?: Record<string, unknown>;
  /** Idempotency key override; defaults to `<sessionId>-<turnId>-turn`. */
  idempotencyKey?: string;
}

/**
 * Append an observation to the per-turn `conversation_turn` entity.
 *
 * Best-effort: any transport failure is logged at debug and swallowed so
 * the hook never blocks the agent turn.
 */
export async function recordConversationTurn(
  client: NeotomaClient | null,
  input: ConversationTurnObservationInput
): Promise<{ entityId?: string } | null> {
  if (!client) return null;
  if (!input.sessionId || !input.turnId) {
    log("debug", "recordConversationTurn: missing sessionId/turnId");
    return null;
  }
  const turnKey = `${input.sessionId}:${input.turnId}`;
  const entity: StoreEntityInput = {
    entity_type: "conversation_turn",
    session_id: input.sessionId,
    turn_id: input.turnId,
    turn_key: turnKey,
    harness: input.harness ?? "cursor",
    ...harnessProvenance(input.hookEvent ? { hook_event: input.hookEvent } : undefined),
  };
  if (input.conversationEntityId) entity.conversation_id = input.conversationEntityId;
  if (input.harnessVersion) entity.harness_version = input.harnessVersion;
  if (input.model) entity.model = input.model;
  if (input.status) entity.status = input.status;
  if (input.hookEvent) entity.hook_events = [input.hookEvent];
  if (input.missedSteps) entity.missed_steps = [...input.missedSteps];
  if (input.toolInvocationCount !== undefined)
    entity.tool_invocation_count = input.toolInvocationCount;
  if (input.storeStructuredCalls !== undefined)
    entity.store_structured_calls = input.storeStructuredCalls;
  if (input.retrieveCalls !== undefined) entity.retrieve_calls = input.retrieveCalls;
  if (input.neotomaToolFailures !== undefined)
    entity.neotoma_tool_failures = input.neotomaToolFailures;
  if (input.harnessLoopCount !== undefined) entity.harness_loop_count = input.harnessLoopCount;
  if (input.injectedContextChars !== undefined)
    entity.injected_context_chars = input.injectedContextChars;
  if (input.retrievedEntityIds && input.retrievedEntityIds.length > 0)
    entity.retrieved_entity_ids = [...input.retrievedEntityIds];
  if (input.storedEntityIds && input.storedEntityIds.length > 0)
    entity.stored_entity_ids = [...input.storedEntityIds];
  if (input.failureHintShown !== undefined) entity.failure_hint_shown = input.failureHintShown;
  if (input.safetyNetUsed !== undefined) entity.safety_net_used = input.safetyNetUsed;
  if (input.reminderInjected !== undefined) entity.reminder_injected = input.reminderInjected;
  if (input.instructionDiagnostics)
    entity.instruction_diagnostics = { ...input.instructionDiagnostics };
  if (input.recommendedRepairs && input.recommendedRepairs.length > 0)
    entity.recommended_repairs = [...input.recommendedRepairs];
  if (input.diagnosisConfidence) entity.diagnosis_confidence = input.diagnosisConfidence;
  if (input.startedAt) entity.started_at = input.startedAt;
  if (input.endedAt) entity.ended_at = input.endedAt;
  if (input.cwd) entity.cwd = input.cwd;
  if (input.workingDirectory) entity.working_directory = input.workingDirectory;
  if (input.gitBranch) entity.git_branch = input.gitBranch;
  if (input.activeFileRefs && input.activeFileRefs.length > 0)
    entity.active_file_refs = [...input.activeFileRefs];
  if (input.contextSource) entity.context_source = input.contextSource;
  if (input.extra) Object.assign(entity, input.extra);
  const idempotencyKey =
    input.idempotencyKey ?? makeIdempotencyKey(input.sessionId, input.turnId, "turn");
  try {
    const result = (await client.store({
      entities: [entity],
      idempotency_key: idempotencyKey,
    })) as {
      structured?: { entities?: Array<{ entity_id?: string }> };
    };
    return { entityId: result.structured?.entities?.[0]?.entity_id };
  } catch (err) {
    log("debug", `recordConversationTurn store failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Default substring patterns used to identify "small" / fast / cheap models
 * that statistically fail to follow long instruction blocks. The Cursor hook
 * payload includes a `model` string; we match it against this list when the
 * caller has not configured `NEOTOMA_HOOK_SMALL_MODEL_PATTERNS`.
 *
 * Patterns are compared case-insensitively. Operators can override or extend
 * the list via `NEOTOMA_HOOK_SMALL_MODEL_PATTERNS` (regex list, comma-
 * separated).
 */
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

function getSmallModelPatterns(): RegExp[] {
  const raw = process.env.NEOTOMA_HOOK_SMALL_MODEL_PATTERNS;
  const parts =
    typeof raw === "string" && raw.trim().length > 0
      ? raw
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      : DEFAULT_SMALL_MODEL_PATTERNS;
  const out: RegExp[] = [];
  for (const p of parts) {
    try {
      out.push(new RegExp(p, "i"));
    } catch (err) {
      log("debug", `invalid small-model pattern ${JSON.stringify(p)}: ${(err as Error).message}`);
    }
  }
  return out;
}

/**
 * Returns true when the given model id looks like a small / fast / cheap
 * model that historically fails to follow long instruction blocks. Used to
 * add extra wording to prompt-local reminders and compact MCP instruction
 * selection. Stop-hook follow-up is no longer model-gated: every material
 * turn must interact with Neotoma at least once.
 */
export function isSmallModel(model: string | null | undefined): boolean {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase();
  for (const pattern of getSmallModelPatterns()) {
    if (pattern.test(lower)) return true;
  }
  return false;
}

/**
 * Per-turn compliance counters tracked by the harness-side hook layer.
 *
 * Updated by `postToolUse` and `postToolUseFailure`, read by `stop` to
 * decide whether the agent skipped required Neotoma writes and a backfill
 * (or follow-up nudge) is warranted.
 */
export interface TurnComplianceState {
  conversation_id: string;
  generation_id: string;
  model: string;
  store_structured_calls: number;
  retrieve_calls: number;
  neotoma_tool_failures: number;
  tool_invocation_count: number;
  /** Non-Neotoma MCP tool calls that returned structured data this turn. */
  external_data_tool_calls: number;
  user_message_stored: boolean;
  assistant_message_stored: boolean;
  user_message_entity_id?: string;
  assistant_message_entity_id?: string;
  conversation_entity_id?: string;
  /**
   * True when sessionStart or postToolUse injected a compact reminder
   * via `additional_context` during this turn. Used by the stop-hook
   * root-cause classifier to distinguish "agent ignored available
   * instructions" from "instruction delivery missing or stale".
   */
  reminder_injected?: boolean;
  /** Names of hooks that contributed reminders this turn (e.g. `["session_start", "post_tool_use"]`). */
  reminder_hooks?: string[];
  /**
   * True when at least one Neotoma-relevant tool failure observed this
   * turn looked like a transport-level failure (fetch failed,
   * ECONNREFUSED, ENOTFOUND, timeout, ...). Set by postToolUseFailure
   * when present so the stop-hook classifier can attribute skipped
   * stores to local Neotoma being unreachable.
   */
  neotoma_connection_failure?: boolean;
  updated_at: string;
}

const TURN_TTL_MS = 6 * 60 * 60 * 1000;

function turnStatePath(conversationId: string, generationId: string): string {
  const safeConv = (conversationId || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  const safeGen = (generationId || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  return join(hookStateDir(), `turn-${safeConv}-${safeGen}.json`);
}

export function readTurnState(conversationId: string, generationId: string): TurnComplianceState {
  const path = turnStatePath(conversationId, generationId);
  if (!existsSync(path)) {
    return {
      conversation_id: conversationId,
      generation_id: generationId,
      model: "",
      store_structured_calls: 0,
      retrieve_calls: 0,
      neotoma_tool_failures: 0,
      tool_invocation_count: 0,
      external_data_tool_calls: 0,
      user_message_stored: false,
      assistant_message_stored: false,
      reminder_injected: false,
      reminder_hooks: [],
      neotoma_connection_failure: false,
      updated_at: "",
    };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return {
      conversation_id: raw.conversation_id ?? conversationId,
      generation_id: raw.generation_id ?? generationId,
      model: raw.model ?? "",
      store_structured_calls: raw.store_structured_calls ?? 0,
      retrieve_calls: raw.retrieve_calls ?? 0,
      neotoma_tool_failures: raw.neotoma_tool_failures ?? 0,
      tool_invocation_count: raw.tool_invocation_count ?? 0,
      external_data_tool_calls: raw.external_data_tool_calls ?? 0,
      user_message_stored: raw.user_message_stored ?? false,
      assistant_message_stored: raw.assistant_message_stored ?? false,
      user_message_entity_id: raw.user_message_entity_id,
      assistant_message_entity_id: raw.assistant_message_entity_id,
      conversation_entity_id: raw.conversation_entity_id,
      reminder_injected: raw.reminder_injected ?? false,
      reminder_hooks: Array.isArray(raw.reminder_hooks) ? [...raw.reminder_hooks] : [],
      neotoma_connection_failure: raw.neotoma_connection_failure ?? false,
      updated_at: raw.updated_at ?? "",
    };
  } catch (err) {
    log("debug", `turn state parse failed: ${(err as Error).message}`);
    return {
      conversation_id: conversationId,
      generation_id: generationId,
      model: "",
      store_structured_calls: 0,
      retrieve_calls: 0,
      neotoma_tool_failures: 0,
      tool_invocation_count: 0,
      external_data_tool_calls: 0,
      user_message_stored: false,
      assistant_message_stored: false,
      reminder_injected: false,
      reminder_hooks: [],
      neotoma_connection_failure: false,
      updated_at: "",
    };
  }
}

export function writeTurnState(state: TurnComplianceState): void {
  try {
    mkdirSync(hookStateDir(), { recursive: true });
    writeFileSync(
      turnStatePath(state.conversation_id, state.generation_id),
      JSON.stringify({ ...state, updated_at: new Date().toISOString() })
    );
  } catch (err) {
    log("debug", `turn state write failed: ${(err as Error).message}`);
  }
}

export function updateTurnState(
  conversationId: string,
  generationId: string,
  patch: (current: TurnComplianceState) => TurnComplianceState
): TurnComplianceState {
  const current = readTurnState(conversationId, generationId);
  const next = patch(current);
  next.updated_at = new Date().toISOString();
  writeTurnState(next);
  return next;
}

/**
 * Best-effort prune of stale per-turn state files older than {@link
 * TURN_TTL_MS}. Called opportunistically; never throws.
 */
export function pruneStaleTurnState(): void {
  try {
    const dir = hookStateDir();
    if (!existsSync(dir)) return;
    const cutoff = Date.now() - TURN_TTL_MS;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith("turn-")) continue;
      const file = join(dir, name);
      try {
        const st = statSync(file);
        if (st.mtimeMs < cutoff) unlinkSync(file);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Best-effort, debounced "tell the Neotoma server which instruction profile
 * to serve for this MCP session". Called from sessionStart once per session
 * with the model id; the server flips its in-memory profile so the NEXT
 * `initialize` retrieval (or any reread of `instructions`) returns the
 * compact variant for small models. Failure is silent — the prompt-local
 * reminder injected via additional_context already covers the most
 * important case where the server endpoint is unreachable.
 */
export async function setProfileDebounced(
  conversationId: string,
  model: string | null | undefined
): Promise<void> {
  const profile = isSmallModel(model) ? "compact" : "full";
  const safeConv = (conversationId || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  const markerPath = join(hookStateDir(), `profile-${safeConv}.json`);
  try {
    if (existsSync(markerPath)) {
      const raw = readFileSync(markerPath, "utf-8");
      const prev = JSON.parse(raw) as { profile?: string; model?: string };
      if (prev?.profile === profile && prev?.model === (model ?? "")) {
        return;
      }
    }
  } catch {
    // ignore parse errors; we'll re-send.
  }
  const connectionId =
    process.env.NEOTOMA_HOOK_CONNECTION_ID ?? process.env.X_CONNECTION_ID ?? null;
  try {
    const url = `${NEOTOMA_BASE_URL.replace(/\/$/, "")}/session/profile`;
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${NEOTOMA_TOKEN}`,
      },
      body: JSON.stringify({
        profile,
        session_id: conversationId,
        connection_id: connectionId,
      }),
    });
  } catch (err) {
    log("debug", `setProfile failed: ${(err as Error).message}`);
    return;
  }
  try {
    mkdirSync(hookStateDir(), { recursive: true });
    writeFileSync(
      markerPath,
      JSON.stringify({
        profile,
        model: model ?? "",
        updated_at: new Date().toISOString(),
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Build a compact "must-do" reminder block to inject as additional_context
 * for small-model regimes. Single source of truth — reused across the
 * cursor-hooks, claude-code-plugin, opencode-plugin, codex-hooks, and
 * claude-agent-sdk-adapter packages via copy in their respective layers.
 *
 * Keep this under ~600 tokens. The MCP server's full instructions stay
 * authoritative; this is the prompt-local reinforcement next to the model's
 * working context.
 */
export function buildCompactReminder(model?: string | null | undefined): string {
  const lines = [
    "Neotoma turn must-do (compact; full rules at MCP `instructions`):",
    "0. Every turn must interact with Neotoma at least once, usually by storing the conversation turn.",
    "1. Bounded retrieval first when the user message implies known entities (retrieve_entity_by_identifier for ids, retrieve_entities for category lists).",
    "2. User-phase store (one store_structured call): conversation + user conversation_message (sender_kind=user) + any extracted entities; PART_OF message->conversation; REFERS_TO message->each extracted entity.",
    "3. Tool calls and host edits run AFTER step 2.",
    "4. Closing store: assistant conversation_message (sender_kind=assistant, exact reply text) with REFERS_TO to every entity the reply cites or produced; PART_OF same conversation.",
    "5. Display rule: when this turn created/updated/retrieved non-bookkeeping entities, the visible reply ends with a `🧠 Neotoma` section listing them as bullets.",
    "Forbidden: skipping store on greetings, persisting only the user message, ending the turn without the assistant store. Idempotency keys are per-turn unique.",
  ];
  if (isSmallModel(model)) {
    lines.push(
      `Note: this client (${
        model ?? "unknown"
      }) is on a small/fast model. Treat the above as a hard checklist — run it every turn even when the answer feels trivial.`
    );
  }
  return lines.join("\n");
}

function tokenizeCommand(command: string): string[] {
  const matches = command.match(/"[^"]*"|'[^']*'|`[^`]*`|[^\s]+/g) ?? [];
  return matches.map((token) => token.replace(/^["'`]|["'`]$/g, ""));
}

function isNeotomaCliToken(token: string): boolean {
  return (
    token === "neotoma" ||
    token.startsWith("neotoma@") ||
    token.endsWith("/neotoma")
  );
}

function looksLikeNeotomaCliWrite(command: string): boolean {
  const tokens = tokenizeCommand(command).map((token) => token.toLowerCase());
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const neotomaIndex =
      token === "npx" && isNeotomaCliToken(tokens[i + 1] ?? "")
        ? i + 1
        : isNeotomaCliToken(token)
          ? i
          : -1;
    if (neotomaIndex < 0) continue;

    for (let j = neotomaIndex + 1; j < tokens.length; j += 1) {
      const candidate = tokens[j];
      if (
        candidate === ";" ||
        candidate === "&&" ||
        candidate === "||" ||
        candidate === "|"
      ) {
        break;
      }
      if (candidate.startsWith("-")) continue;
      if (candidate === "dev" || candidate === "prod") continue;
      return (
        candidate === "store" ||
        candidate === "store-structured" ||
        candidate === "ingest"
      );
    }
  }
  return false;
}

/**
 * Conservative heuristic: returns true when a tool name + input look like a
 * Neotoma turn write. Handles direct MCP `store_structured`, generic host
 * wrappers such as `CallMcpTool({ server: "user-neotoma", toolName:
 * "store_structured", arguments: ... })`, and Neotoma CLI backup commands
 * such as `neotoma --servers=start store ...`. Used by `postToolUse` to bump
 * the compliance counter so `stop.ts` knows whether the agent actually wrote
 * structured memory this turn, regardless of supported transport.
 */
export function looksLikeStoreStructured(
  toolName: unknown,
  toolInput: unknown
): boolean {
  if (typeof toolName !== "string") return false;
  const lower = toolName.toLowerCase();
  if (
    lower === "store_structured" ||
    lower.endsWith("_store_structured") ||
    lower === "mcp_neotoma_store_structured" ||
    lower === "mcp_user-neotoma_store_structured"
  ) {
    return true;
  }
  if (toolInput && typeof toolInput === "object") {
    const record = toolInput as Record<string, unknown>;
    const commandLike = record.command ?? record.cmd;
    if (typeof commandLike === "string" && looksLikeNeotomaCliWrite(commandLike)) {
      return true;
    }
    const server = record.server;
    const wrappedToolName = record.toolName ?? record.tool_name ?? record.name;
    if (
      typeof server === "string" &&
      server.toLowerCase().includes("neotoma") &&
      typeof wrappedToolName === "string" &&
      wrappedToolName.toLowerCase() === "store_structured"
    ) {
      return true;
    }
    const args =
      record.arguments && typeof record.arguments === "object"
        ? (record.arguments as Record<string, unknown>)
        : record;
    if (Array.isArray(record.entities) && record.entities.length > 0) {
      const has = (record.entities as unknown[]).every(
        (e) =>
          e !== null &&
          typeof e === "object" &&
          typeof (e as { entity_type?: unknown }).entity_type === "string"
      );
      if (has) return true;
    }
    if (Array.isArray(args.entities) && args.entities.length > 0) {
      const has = (args.entities as unknown[]).every(
        (e) =>
          e !== null &&
          typeof e === "object" &&
          typeof (e as { entity_type?: unknown }).entity_type === "string"
      );
      if (has) return true;
    }
  }
  return false;
}

/**
 * Conservative heuristic for retrieval-shaped tool calls.
 */
export function looksLikeRetrieve(toolName: unknown): boolean {
  if (typeof toolName !== "string") return false;
  const lower = toolName.toLowerCase();
  return (
    lower === "retrieve_entities" ||
    lower === "retrieve_entity_by_identifier" ||
    lower === "list_timeline_events" ||
    lower === "retrieve_related_entities" ||
    lower.endsWith("_retrieve_entities") ||
    lower.endsWith("_retrieve_entity_by_identifier") ||
    lower.endsWith("_list_timeline_events") ||
    lower.endsWith("_retrieve_related_entities")
  );
}

export function looksLikeRetrieveInvocation(toolName: unknown, toolInput: unknown): boolean {
  if (looksLikeRetrieve(toolName)) return true;
  if (!toolInput || typeof toolInput !== "object") return false;
  const record = toolInput as Record<string, unknown>;
  const server = record.server;
  const wrappedToolName = record.toolName ?? record.tool_name ?? record.name;
  if (
    typeof server === "string" &&
    server.toLowerCase().includes("neotoma") &&
    looksLikeRetrieve(wrappedToolName)
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true when the given tool name looks Neotoma-relevant (MCP tool
 * against the Neotoma server, the `neotoma` CLI, or a direct HTTP call
 * into a Neotoma endpoint). We use this to scope post-tool failure
 * capture so the hook only signals friction the user or agent can act on.
 */
export function isNeotomaRelevantTool(toolName: unknown, toolInput: unknown): boolean {
  if (typeof toolName === "string") {
    const lower = toolName.toLowerCase();
    if (
      lower.includes("neotoma") ||
      lower.startsWith("mcp_neotoma") ||
      lower.startsWith("mcp_user-neotoma") ||
      lower === "submit_feedback" ||
      lower === "get_feedback_status" ||
      lower === "store_structured" ||
      lower === "retrieve_entities" ||
      lower === "retrieve_entity_by_identifier" ||
      lower === "create_relationship" ||
      lower === "list_entity_types" ||
      lower === "list_timeline_events"
    ) {
      return true;
    }
  }
  if (toolInput && typeof toolInput === "object") {
    const record = toolInput as Record<string, unknown>;
    const server = record.server;
    if (typeof server === "string" && server.toLowerCase().includes("neotoma")) {
      return true;
    }
    const commandLike = record.command ?? record.cmd ?? record.url;
    if (typeof commandLike === "string") {
      const lower = commandLike.toLowerCase();
      if (
        lower.includes("neotoma ") ||
        lower.startsWith("neotoma") ||
        lower.includes("/neotoma/") ||
        lower.includes("neotoma.io")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true when the tool call looks like a non-Neotoma MCP tool that
 * returned structured data the agent should persist. Covers CallMcpTool
 * dispatches to third-party servers (gmail, calendar, slack, etc.) and
 * direct MCP tool names that are clearly external data sources.
 */
export function looksLikeExternalDataTool(
  toolName: unknown,
  toolInput: unknown,
  toolOutput: unknown,
): boolean {
  if (isNeotomaRelevantTool(toolName, toolInput)) return false;

  const name = typeof toolName === "string" ? toolName.toLowerCase() : "";

  if (name === "callmcptool" && toolInput && typeof toolInput === "object") {
    const record = toolInput as Record<string, unknown>;
    const server = typeof record.server === "string" ? record.server.toLowerCase() : "";
    if (server.includes("neotoma")) return false;
    if (server) return hasStructuredOutput(toolOutput);
  }

  const externalPatterns = [
    "search_emails", "read_email", "send_email",
    "list_events", "get_event", "create_event",
    "list_contacts", "get_contact",
    "search_messages", "read_message",
    "list_transactions", "get_transaction",
    "list_transfers", "get_transfer",
  ];
  if (externalPatterns.includes(name)) return hasStructuredOutput(toolOutput);

  return false;
}

function hasStructuredOutput(toolOutput: unknown): boolean {
  if (toolOutput == null) return false;
  if (typeof toolOutput === "string") {
    const trimmed = toolOutput.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed.length > 10;
    return trimmed.length > 50;
  }
  if (typeof toolOutput === "object") return true;
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

/**
 * Light PII scrub suitable for passing a short error message through the
 * hook layer into a structured entity. The agent is still expected to
 * apply the full PII redaction contract when it decides to call
 * `submit_feedback` — this is a defence in depth only.
 */
export function scrubErrorMessage(raw: unknown): string {
  if (raw == null) return "";
  const text = typeof raw === "string" ? raw : String(raw);
  let out = text;
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<EMAIL>");
  out = out.replace(/\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b/g, "<TOKEN>");
  out = out.replace(
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    "<UUID>"
  );
  out = out.replace(/\b(?:\+?\d[\s-]?){7,}\d\b/g, "<PHONE>");
  const homePattern = homeDirPattern();
  if (homePattern) {
    out = out.replace(homePattern, "<HOME>");
  }
  if (out.length > 400) {
    out = `${out.slice(0, 397)}...`;
  }
  return out;
}

/**
 * Classify an error message into a coarse-grained error class for
 * counter keying. Prefers explicit `ERR_*` markers from the Neotoma API
 * envelope, then falls back to standard Node/network codes.
 */
export function classifyErrorMessage(raw: unknown): string {
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

const FAILURE_TTL_MS = 24 * 60 * 60 * 1000;

function hookStateDir(): string {
  return process.env.NEOTOMA_HOOK_STATE_DIR ?? join(homedir(), ".neotoma", "hook-state");
}

function failureStatePath(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  return join(hookStateDir(), `failures-${safe}.json`);
}

export interface FailureCounterEntry {
  count: number;
  first_at: string;
  last_at: string;
  hinted: boolean;
}

export interface FailureCounterState {
  session_id: string;
  updated_at: string;
  entries: Record<string, FailureCounterEntry>;
}

function readFailureStateFile(sessionId: string): FailureCounterState {
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
  } catch (err) {
    log("debug", `failure state parse failed: ${(err as Error).message}`);
    return { session_id: sessionId, updated_at: "", entries: {} };
  }
}

function writeFailureStateFile(state: FailureCounterState): void {
  try {
    mkdirSync(hookStateDir(), { recursive: true });
    writeFileSync(failureStatePath(state.session_id), JSON.stringify(state));
  } catch (err) {
    log("debug", `failure state write failed: ${(err as Error).message}`);
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

export function failureCounterKey(toolName: string, errorClass: string): string {
  return `${toolName}::${errorClass}`;
}

export function incrementFailureCounter(
  sessionId: string,
  toolName: string,
  errorClass: string
): FailureCounterEntry {
  const state = pruneExpired(readFailureStateFile(sessionId));
  const key = failureCounterKey(toolName, errorClass);
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
  writeFailureStateFile(state);
  return next;
}

export interface FailureHint {
  tool_name: string;
  error_class: string;
  count: number;
}

/**
 * Returns the highest-priority un-shown failure hint for the session,
 * marking it shown so it is only surfaced once per
 * (tool_name, error_class) per session.
 *
 * Respects `NEOTOMA_HOOK_FEEDBACK_HINT` and
 * `NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD`.
 */
export function readFailureHint(sessionId: string): FailureHint | null {
  if ((process.env.NEOTOMA_HOOK_FEEDBACK_HINT ?? "on").toLowerCase() === "off") {
    return null;
  }
  const threshold = Math.max(
    1,
    Number.parseInt(process.env.NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD ?? "2", 10) || 2
  );
  const state = pruneExpired(readFailureStateFile(sessionId));
  let best: { key: string; entry: FailureCounterEntry } | null = null;
  for (const [key, entry] of Object.entries(state.entries)) {
    if (entry.hinted) continue;
    if (entry.count < threshold) continue;
    if (!best || entry.count > best.entry.count) {
      best = { key, entry };
    }
  }
  if (!best) return null;
  const [toolName, errorClass] = best.key.split("::");
  state.entries[best.key] = { ...best.entry, hinted: true };
  state.updated_at = new Date().toISOString();
  writeFailureStateFile(state);
  return {
    tool_name: toolName ?? "unknown",
    error_class: errorClass ?? "unknown",
    count: best.entry.count,
  };
}

export function formatFailureHint(hint: FailureHint): string {
  return [
    `Neotoma hook note: ${hint.count} recent failures this session for`,
    `tool \`${hint.tool_name}\` with error class \`${hint.error_class}\`.`,
    `If this is blocking your task, consider calling \`submit_feedback\``,
    `with kind=incident, PII-redacted title/body, and metadata.environment`,
    `per docs/developer/mcp/instructions.md. This is informational —`,
    `do not auto-submit.`,
  ].join(" ");
}

/**
 * Best-effort detection for "this hook is running inside a developer
 * checkout of the Neotoma repo built from source", as opposed to a
 * packaged installation pointing at a remote Neotoma host. Used by the
 * stop-hook root-cause classifier to decide whether
 * `recommended_repairs` should mention repo-owned remediation paths
 * (re-aligning the `src/server.ts` instruction fallback, reconnecting
 * after instruction edits, running Tier 1 evals).
 *
 * Heuristic priority:
 *   1. Explicit `NEOTOMA_LOCAL_BUILD=1` / `=0` env override.
 *   2. Otherwise, both: base URL points at localhost / 127.0.0.1 AND
 *      cwd or an ancestor contains a `package.json` whose `name` is
 *      `"neotoma"`.
 *
 * Cached for the lifetime of the hook process to avoid re-reading
 * `package.json` on every stop hook.
 */
let cachedLocalRepoBuild: boolean | undefined;

export function isLocalRepoBuild(): boolean {
  if (cachedLocalRepoBuild !== undefined) return cachedLocalRepoBuild;
  const explicit = process.env.NEOTOMA_LOCAL_BUILD;
  if (explicit === "1" || explicit?.toLowerCase() === "true") {
    cachedLocalRepoBuild = true;
    return true;
  }
  if (explicit === "0" || explicit?.toLowerCase() === "false") {
    cachedLocalRepoBuild = false;
    return false;
  }
  const baseUrl = (process.env.NEOTOMA_BASE_URL ?? "").toLowerCase();
  const localUrl =
    baseUrl.includes("127.0.0.1") ||
    baseUrl.includes("localhost") ||
    baseUrl.startsWith("http://0.0.0.0");
  let cwdLooksLikeNeotoma = false;
  try {
    let dir = process.cwd();
    while (true) {
      const pkgPath = join(dir, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "neotoma") {
          cwdLooksLikeNeotoma = true;
          break;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // ignore — fall through to heuristic-only
  }
  cachedLocalRepoBuild = localUrl && cwdLooksLikeNeotoma;
  return cachedLocalRepoBuild;
}

/** For tests — clears the cached `isLocalRepoBuild` decision. */
export function resetLocalRepoBuildCache(): void {
  cachedLocalRepoBuild = undefined;
}

/**
 * Stop-hook root-cause classification for skipped Neotoma writes.
 *
 * Inputs are bounded — only what hooks have already observed in turn
 * state — so this never makes an additional network or fs call. The
 * classifier returns one of a small fixed set of classifications, a
 * confidence level, and a list of `recommended_repairs` that operators
 * (and the local repo build) can act on.
 *
 * Repo-owned diagnoses mark proactive remediation as required. The hook
 * records the recommendations and the stop follow-up instructs the agent
 * to resolve the underlying cause in the source checkout when safe.
 * Hooks NEVER mutate Cursor / user / repo config automatically.
 */
export type SkippedStoreClassification =
  | "tooling_unavailable_or_failed"
  | "instruction_delivery_missing_or_stale"
  | "agent_ignored_available_instructions"
  | "hook_state_incomplete"
  | "false_positive_or_no_material_content"
  | "unknown";

export interface SkippedStoreDiagnosis {
  classification: SkippedStoreClassification;
  confidence: "high" | "medium" | "low" | "unknown";
  reason: string;
  signals: Record<string, unknown>;
  local_build: boolean;
  recommended_repairs: string[];
  proactive_remediation_required: boolean;
}

export interface DiagnoseSkippedStoreInput {
  state: TurnComplianceState;
  hadFinalText: boolean;
  /**
   * Optional override; defaults to {@link isLocalRepoBuild}. Tests pass
   * this explicitly to keep classification deterministic.
   */
  localBuild?: boolean;
}

export function diagnoseSkippedStore(input: DiagnoseSkippedStoreInput): SkippedStoreDiagnosis {
  const { state, hadFinalText } = input;
  const localBuild = input.localBuild ?? isLocalRepoBuild();
  const reminderInjected = state.reminder_injected === true;
  const reminderHooks = state.reminder_hooks ?? [];
  const toolFailures = state.neotoma_tool_failures ?? 0;
  const connectionFailure = state.neotoma_connection_failure === true;
  const toolCount = state.tool_invocation_count ?? 0;
  const userMessageStored = state.user_message_stored === true;
  const signals: Record<string, unknown> = {
    reminder_injected: reminderInjected,
    reminder_hooks: [...reminderHooks],
    neotoma_tool_failures: toolFailures,
    neotoma_connection_failure: connectionFailure,
    tool_invocation_count: toolCount,
    user_message_stored: userMessageStored,
    had_final_text: hadFinalText,
    model: state.model || null,
  };

  if (toolFailures > 0 || connectionFailure) {
    return {
      classification: "tooling_unavailable_or_failed",
      confidence: connectionFailure ? "high" : "medium",
      reason: connectionFailure
        ? "Neotoma transport-level failures observed this turn (fetch/ECONNREFUSED-class)."
        : `Neotoma-relevant tool failed ${toolFailures} time(s) this turn.`,
      signals,
      local_build: localBuild,
      proactive_remediation_required: localBuild,
      recommended_repairs: localBuild
        ? [
            "Verify the local Neotoma server is running (e.g. `npm run watch:prod`) and reachable at NEOTOMA_BASE_URL.",
            "Tail server logs to confirm the failing endpoint and reload the MCP client connection after fixes.",
            "Run `npm run eval:tier1` to re-validate hook + transport behavior end-to-end.",
          ]
        : [
            "Confirm the Neotoma host is reachable from this machine and that the MCP client is authenticated.",
            "If failures persist, capture an `incident` via `submit_feedback` with PII-redacted error details.",
          ],
    };
  }

  if (!reminderInjected && toolCount === 0) {
    return {
      classification: "hook_state_incomplete",
      confidence: userMessageStored ? "medium" : "high",
      reason:
        "No reminders were injected and no tool calls were observed this turn — sessionStart/postToolUse may not be wired up.",
      signals,
      local_build: localBuild,
      proactive_remediation_required: localBuild,
      recommended_repairs: localBuild
        ? [
            "Re-run the cursor-hooks installer (`packages/cursor-hooks/scripts/install.mjs`) and confirm `.cursor/hooks.json` references the compiled hooks.",
            "Verify NEOTOMA_HOOK_STATE_DIR is writable and that hooks are emitting JSON on stdout.",
            "Run `npm run eval:tier1` against `tests/fixtures/agentic_eval/agent_skips_store.json` to spot regressions.",
          ]
        : [
            "Re-install the Neotoma Cursor hooks; verify `.cursor/hooks.json` matches the published template.",
            "Reconnect the MCP client so a fresh `initialize` re-delivers Neotoma instructions.",
          ],
    };
  }

  if (!reminderInjected) {
    return {
      classification: "instruction_delivery_missing_or_stale",
      confidence: "medium",
      reason:
        "Tools ran this turn but no compact reminder was injected — instruction delivery to the agent is likely missing or stale.",
      signals,
      local_build: localBuild,
      proactive_remediation_required: localBuild,
      recommended_repairs: localBuild
        ? [
            "Confirm `docs/developer/mcp/instructions.md` is reachable from `src/server.ts#getMcpInteractionInstructions` and reconnect the MCP client to pick up edits.",
            "Compare the runtime fallback in `src/server.ts` against `docs/developer/mcp/instructions.md`; the fallback should not contradict the canonical contract.",
            "If running a packaged build, rebuild (`npm run build:server`) so `dist/` ships the latest instruction text.",
          ]
        : [
            "Reconnect the MCP client so a fresh `initialize` re-delivers Neotoma instructions.",
            "Ensure NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP is left at `auto` or `on` so the stop-hook follow-up still fires.",
          ],
    };
  }

  if (hadFinalText) {
    return {
      classification: "agent_ignored_available_instructions",
      confidence: "high",
      reason:
        "Compact reminder was injected and Neotoma tooling was reachable, but the agent did not call store_structured.",
      signals,
      local_build: localBuild,
      proactive_remediation_required: localBuild,
      recommended_repairs: localBuild
        ? [
            "Add or extend a Tier 1 fixture in `tests/fixtures/agentic_eval/` that asserts the `agent_ignored_available_instructions` classification for this model.",
            "Check the postToolUse reminder gate so wrapped host tool calls still receive the compact Neotoma reminder.",
            "Investigate whether the MCP `[COMPACT MODE]` block omits a contract this model needs; expand `docs/developer/mcp/instructions.md` accordingly.",
          ]
        : [
            "Leave NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP at `auto` or set it to `on`; only `off` suppresses skipped-store follow-up.",
          ],
    };
  }

  return {
    classification: "false_positive_or_no_material_content",
    confidence: "low",
    reason:
      "Turn ended without assistant text; backfill captured the graph but no agent reply was written.",
    signals,
    local_build: localBuild,
    proactive_remediation_required: false,
    recommended_repairs: localBuild
      ? [
          "Confirm the agent harness sent a final assistant message; otherwise the stop hook is firing on aborted turns.",
        ]
      : [],
  };
}

export async function runHook(
  name: string,
  handler: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
): Promise<void> {
  try {
    const input = await readHookInput<Record<string, unknown>>();
    const output = await handler(input);
    writeHookOutput(output);
  } catch (err) {
    log("error", `${name} hook failed: ${(err as Error).message}`);
    writeHookOutput({});
  }
}
