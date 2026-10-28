/**
 * Reference adapter for the Claude Agent SDK.
 *
 * The Claude Agent SDK exposes a hooks interface on `query()` and
 * `ClaudeSDKClient`. This adapter returns a set of hook callbacks ready
 * to plug into that interface. The callbacks map the SDK's lifecycle
 * events onto Neotoma's state-layer writes, following the Option C
 * architecture:
 *
 * - the adapter is the reliability floor (capture + retrieval inject)
 * - MCP remains the quality ceiling (agent-driven structured writes)
 *
 * We keep the shape loose (`unknown` in, `unknown` out) so this module
 * stays compatible across SDK versions — it is a reference, not a hard
 * binding.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { NeotomaClient, recordConversationTurn, type StoreEntityInput } from "@neotoma/client";

export interface NeotomaSdkAdapterOptions {
  baseUrl?: string;
  token?: string;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  injectContext?: boolean;
  sessionId?: string;
}

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const IDENTIFIER_PATTERN = /@([A-Za-z0-9_][A-Za-z0-9_.\-]{2,})/g;

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

function harnessProvenance(
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    data_source: "claude-agent-sdk",
    harness: "claude-agent-sdk",
    cwd: process.cwd(),
    ...(extra ?? {}),
  };
}

/**
 * Returns true when the given tool name looks Neotoma-relevant (MCP tool
 * against the Neotoma server, the `neotoma` CLI, or a direct HTTP call
 * into a Neotoma endpoint). We use this to scope post-tool failure
 * capture so the hook only signals friction the user or agent can act on.
 */
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
      lower === "submit_issue" ||
      lower === "get_issue_status" ||
      lower === "store" ||
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

// ---------------------------------------------------------------------------
// Tool-capture policy
//
// Hooks persist a `tool_invocation` record per tool call. Tool output is the
// bytes of whatever the tool touched, so the record carries METADATA ONLY for
// read-type tools (tool name, path, byte length, content hash) and a bounded,
// secret-redacted summary for every other tool. Nothing is stored for a call
// that touches a secret-bearing path. Adds fields; never renames existing ones
// (`input_summary`, `output_summary` keep their string shape).
//
// This block is intentionally duplicated in each hook package (cursor-hooks,
// opencode-plugin, claude-agent-sdk-adapter; Python twins in claude-code-plugin
// and codex-hooks) because the packages ship independently. Behaviour parity is
// pinned by tests/fixtures/hook_output_capture/vectors.json.
// ---------------------------------------------------------------------------

const CAPTURE_SUMMARY_MAX_LEN = 400;
const CAPTURE_SCAN_CAP = 8192;

const WITHHELD_SECRET_PATH_SUMMARY =
  "[withheld: secret-bearing path; output text not stored]";
const WITHHELD_READ_SUMMARY = "[output text not stored: read-type tool]";

const SECRET_BASENAME_PATTERNS: RegExp[] = [
  /^\.env/i,
  /\.env$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ppk|gpg|pgp|jwk|keychain|keychain-db|tfvars|tfstate)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?!.*\.pub$)/i,
  /^_?\.?(?:npmrc|yarnrc|netrc|pgpass|pypirc|git-credentials|htpasswd|dockercfg|vault-token|kubeconfig)$/i,
  /\.sops(?:\.|$)/i,
  /^keys\.txt$/i,
  /^\.claude\.json$/i,
  /(?:^|[._-])(?:secrets?|credentials?|passwords?|private[_-]?keys?|service[_-]?account|client[_-]?secret|api[_-]?keys?)(?:[._-]|$)/i,
];

const SECRET_DIR_SEGMENTS = new Set([
  ".ssh",
  ".aws",
  ".gnupg",
  ".gpg",
  ".kube",
  ".docker",
  ".azure",
  ".password-store",
  ".sops",
]);

/** True when a path names a secret-bearing file or sits inside a secret directory. */
function isSecretBearingPath(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 4096) return false;
  const segments = trimmed.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.length === 0) return false;
  for (const segment of segments) {
    if (SECRET_DIR_SEGMENTS.has(segment.toLowerCase())) return true;
  }
  const base = segments[segments.length - 1];
  return SECRET_BASENAME_PATTERNS.some((re) => re.test(base));
}

const SECRET_TEXT_ASSIGNMENT_RE =
  /(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]*(?:secret|token|passw(?:or)?d|passphrase|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization)[A-Za-z0-9_.-]*\\?["']?\s*[:=]\s*)((?:(?:bearer|basic)\s+)?(?:\\?"(?:[^"\\]|\\(?!"))*\\?"|'[^']*'|[^\s"'\\,;&}\]]+))/gi;

/**
 * Redact credential-shaped text. Extends the token pattern already used by
 * `scrubErrorMessage` (and the bearer / URL-credential patterns used elsewhere
 * in the hooks) with private-key blocks, common provider tokens, JWTs, and
 * `NAME=value` / `"name": "value"` assignments for secret-looking names.
 */
function redactSecretText(raw: unknown): string {
  if (raw == null) return "";
  let out = typeof raw === "string" ? raw : String(raw);
  if (out.length > CAPTURE_SCAN_CAP) out = out.slice(0, CAPTURE_SCAN_CAP);
  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
    "<PRIVATE_KEY>"
  );
  out = out.replace(/\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b/g, "<TOKEN>");
  out = out.replace(
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
    "<TOKEN>"
  );
  out = out.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    "<JWT>"
  );
  out = out.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1<REDACTED>");
  out = out.replace(/(:\/\/)[^/\s:@]+:[^/\s@]+@/g, "$1<redacted>@");
  out = out.replace(SECRET_TEXT_ASSIGNMENT_RE, "$1<REDACTED>");
  return out;
}

const CAPTURE_PATH_KEYS = new Set([
  "path",
  "paths",
  "file",
  "files",
  "file_path",
  "file_paths",
  "filepath",
  "filename",
  "target_file",
  "targetfile",
  "target_directory",
  "notebook_path",
  "uri",
  "directory",
  "dir",
  "glob",
  "glob_pattern",
  "include",
  "pattern",
]);
const CAPTURE_COMMAND_KEYS = new Set(["command", "cmd", "script"]);

function pathLikeToken(token: string): boolean {
  return token.includes("/") || token.includes("\\") || token.includes(".");
}

function secretPathTokensIn(text: string, splitter: RegExp): boolean {
  for (const raw of text.slice(0, CAPTURE_SCAN_CAP).split(splitter)) {
    const token = raw.replace(/[.,;:!?]+$/, "");
    if (token && pathLikeToken(token) && isSecretBearingPath(token)) return true;
  }
  return false;
}

interface CollectedInputPaths {
  paths: string[];
  secret: boolean;
}

function collectInputPaths(toolInput: unknown): CollectedInputPaths {
  const paths: string[] = [];
  let secret = false;
  let budget = 200;
  const walk = (value: unknown, key: string, depth: number): void => {
    if (budget-- <= 0 || depth > 4 || value == null) return;
    if (typeof value === "string") {
      const lowered = key.toLowerCase();
      if (CAPTURE_PATH_KEYS.has(lowered)) {
        if (paths.length < 8) paths.push(value.slice(0, 512));
        if (isSecretBearingPath(value)) secret = true;
      } else if (CAPTURE_COMMAND_KEYS.has(lowered)) {
        if (secretPathTokensIn(value, /[\s"'`;|&<>()=,]+/)) secret = true;
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 50)) walk(item, key, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, k, depth + 1);
      }
    }
  };
  walk(toolInput, "", 0);
  return { paths, secret };
}

/** True when a tool input names a secret-bearing path (path field or shell token). */
function toolInputMentionsSecretPath(toolInput: unknown): boolean {
  return collectInputPaths(toolInput).secret;
}

function toolNameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const READ_TOOL_TOKENS = new Set([
  "read",
  "cat",
  "view",
  "open",
  "grep",
  "glob",
  "search",
  "find",
  "head",
  "tail",
  "ripgrep",
  "rg",
  "parse",
  "ls",
  "dir",
  "directory",
]);
const WRITE_TOOL_TOKENS = new Set([
  "write",
  "edit",
  "editor",
  "replace",
  "patch",
  "append",
  "insert",
]);
const SHELL_READ_PROGRAMS = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "bat",
  "nl",
  "tac",
  "sed",
  "awk",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "ack",
  "strings",
  "xxd",
  "od",
  "hexdump",
  "base64",
  "cut",
  "jq",
  "yq",
  "sort",
  "uniq",
  "type",
  "get-content",
  "gc",
]);
const SHELL_WRAPPERS = new Set(["sudo", "env", "command", "time", "nohup", "exec", "builtin"]);
const GIT_CONTENT_SUBCOMMANDS = new Set(["show", "diff", "blame", "cat-file", "grep"]);

function commandReadsFiles(command: string): boolean {
  for (const segment of command.slice(0, CAPTURE_SCAN_CAP).split(/[|;&\n]+/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (
      i < words.length &&
      (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || SHELL_WRAPPERS.has(words[i]))
    ) {
      i += 1;
    }
    const program = (words[i] ?? "").replace(/^.*[\\/]/, "").toLowerCase();
    if (SHELL_READ_PROGRAMS.has(program)) return true;
    if (program === "git") {
      if (words.slice(i + 1).some((w) => GIT_CONTENT_SUBCOMMANDS.has(w))) return true;
    }
  }
  return false;
}

function shellCommandOf(toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== "object") return null;
  const record = toolInput as Record<string, unknown>;
  const command = record.command ?? record.cmd;
  return typeof command === "string" ? command : null;
}

/** File reads and searches that return file content, including shell `cat`/`grep`/`git show`. */
function isReadTypeTool(toolName: unknown, toolInput: unknown): boolean {
  const tokens = toolNameTokens(typeof toolName === "string" ? toolName : "");
  if (tokens.some((t) => READ_TOOL_TOKENS.has(t))) return true;
  const command = shellCommandOf(toolInput);
  return command !== null && commandReadsFiles(command);
}

/** Tools whose INPUT carries the file content being written. */
function isWriteTypeTool(toolName: unknown): boolean {
  const tokens = toolNameTokens(typeof toolName === "string" ? toolName : "");
  if (tokens.some((t) => WRITE_TOOL_TOKENS.has(t))) return true;
  return tokens.includes("create") && tokens.includes("file");
}

function serializeForCapture(value: unknown): string | null {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return null;
  }
}

function boundCapture(text: string, maxLen = CAPTURE_SUMMARY_MAX_LEN): string {
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 3)}...`;
}

interface ToolCaptureFields {
  input_summary: string;
  output_summary: string;
  input_capture: "redacted_summary" | "metadata_only";
  output_capture: "redacted_summary" | "metadata_only" | "withheld_secret_path";
  output_bytes: number;
  output_sha256?: string;
  target_path?: string;
}

/**
 * Build the capture fields for a `tool_invocation` record.
 *
 * - read-type tool: metadata only (`output_bytes`, `output_sha256`, path); no text.
 * - any tool touching a secret-bearing path (input path, shell token, or a path
 *   named in the output): no output text and no input content; byte length only.
 * - write-type tool: input stored as metadata (paths, key names), never content.
 * - everything else: bounded summary with credential-shaped text redacted.
 */
function describeToolCapture(args: {
  toolName: unknown;
  toolInput: unknown;
  toolOutput: unknown;
}): ToolCaptureFields {
  const { toolName, toolInput, toolOutput } = args;
  const collected = collectInputPaths(toolInput);
  const outText = serializeForCapture(toolOutput);
  const outputBytes = outText === null ? 0 : Buffer.byteLength(outText, "utf8");
  const secret =
    collected.secret ||
    (outText !== null && secretPathTokensIn(outText, /[\s"'`;|&<>()=,:[\]{}]+/));
  const read = isReadTypeTool(toolName, toolInput);

  const fields: Partial<ToolCaptureFields> = { output_bytes: outputBytes };
  if (collected.paths.length > 0) fields.target_path = collected.paths[0];

  if (secret) {
    fields.output_summary = WITHHELD_SECRET_PATH_SUMMARY;
    fields.output_capture = "withheld_secret_path";
  } else if (read) {
    fields.output_summary = WITHHELD_READ_SUMMARY;
    fields.output_capture = "metadata_only";
    if (outText !== null) {
      fields.output_sha256 = createHash("sha256").update(outText, "utf8").digest("hex");
    }
  } else {
    fields.output_summary =
      outText === null ? "<unserializable>" : boundCapture(redactSecretText(outText));
    fields.output_capture = "redacted_summary";
  }

  if (secret || isWriteTypeTool(toolName)) {
    const record =
      toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)
        ? (toolInput as Record<string, unknown>)
        : {};
    const command = shellCommandOf(toolInput);
    const meta: Record<string, unknown> = {
      paths: collected.paths.slice(0, 5),
      keys: Object.keys(record).slice(0, 32),
    };
    if (command !== null) meta.command = boundCapture(redactSecretText(command), 200);
    fields.input_summary = boundCapture(JSON.stringify(meta));
    fields.input_capture = "metadata_only";
  } else {
    const inText = serializeForCapture(toolInput);
    fields.input_summary =
      inText === null ? "<unserializable>" : boundCapture(redactSecretText(inText));
    fields.input_capture = "redacted_summary";
  }
  return fields as ToolCaptureFields;
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
 * `submit_issue` — this is a defence in depth only.
 */
function scrubErrorMessage(raw: unknown): string {
  if (raw == null) return "";
  const text = typeof raw === "string" ? raw : String(raw);
  let out = redactSecretText(text);
  out = out.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "<EMAIL>"
  );
  out = out.replace(
    /\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b/g,
    "<TOKEN>"
  );
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
 * counter keying.
 */
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

function extractErrorMessage(toolOutput: unknown): string {
  if (!toolOutput) return "";
  if (typeof toolOutput === "string") return toolOutput;
  if (typeof toolOutput !== "object") return "";
  const record = toolOutput as Record<string, unknown>;
  const candidate =
    record.error ?? record.message ?? record.error_message ?? record.stderr;
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object") {
    const nested = candidate as { message?: unknown };
    if (typeof nested.message === "string") return nested.message;
    try {
      return JSON.stringify(candidate);
    } catch {
      return "";
    }
  }
  return "";
}

function extractInvocationShape(toolInput: unknown): Record<string, unknown> {
  if (!toolInput || typeof toolInput !== "object") return {};
  const record = toolInput as Record<string, unknown>;
  const shape: Record<string, unknown> = {};
  for (const key of [
    "command",
    "cmd",
    "url",
    "method",
    "endpoint",
    "path",
    "operation",
  ]) {
    const value = record[key];
    if (typeof value === "string") {
      shape[key] = value.length > 120 ? `${value.slice(0, 117)}...` : value;
    }
  }
  if (Array.isArray(record.entities)) {
    shape.entity_count = record.entities.length;
  }
  return shape;
}

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
  } catch {
    return { session_id: sessionId, updated_at: "", entries: {} };
  }
}

function writeFailureStateFile(state: FailureCounterState): void {
  try {
    mkdirSync(hookStateDir(), { recursive: true });
    writeFileSync(failureStatePath(state.session_id), JSON.stringify(state));
  } catch {
    // best-effort
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

function failureCounterKey(toolName: string, errorClass: string): string {
  return `${toolName}::${errorClass}`;
}

function incrementFailureCounter(
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

interface FailureHint {
  tool_name: string;
  error_class: string;
  count: number;
}

function readFailureHint(sessionId: string): FailureHint | null {
  if (
    (process.env.NEOTOMA_HOOK_FEEDBACK_HINT ?? "on").toLowerCase() === "off"
  ) {
    return null;
  }
  const threshold = Math.max(
    1,
    Number.parseInt(
      process.env.NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD ?? "2",
      10
    ) || 2
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

function formatFailureHint(hint: FailureHint): string {
  return [
    `Neotoma hook note: ${hint.count} recent failures this session for`,
    `tool \`${hint.tool_name}\` with error class \`${hint.error_class}\`.`,
    `If this is blocking your task, consider calling \`submit_issue\``,
    `with a PII-redacted title/body describing the friction`,
    `per docs/developer/mcp/instructions.md. This is informational —`,
    `do not auto-submit.`,
  ].join(" ");
}

/**
 * Hook callbacks compatible with the Claude Agent SDK.
 *
 * Each handler matches the SDK's hook signature: it accepts an input
 * record and returns a record (possibly with `additionalContext`,
 * `hookSpecificOutput`, etc.). Unknown fields are ignored.
 */
export interface NeotomaAgentHooks {
  UserPromptSubmit: (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  PostToolUse: (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  PreCompact: (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  Stop: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export function createNeotomaAgentHooks(
  options: NeotomaSdkAdapterOptions = {}
): NeotomaAgentHooks {
  const baseUrl =
    options.baseUrl ?? process.env.NEOTOMA_BASE_URL ?? "http://127.0.0.1:3080";
  const token = options.token ?? process.env.NEOTOMA_TOKEN ?? "dev-local";
  const logLevel =
    options.logLevel ??
    (process.env.NEOTOMA_LOG_LEVEL as NeotomaSdkAdapterOptions["logLevel"]) ??
    "warn";
  const sessionId =
    options.sessionId ?? `claude-agent-sdk-${Date.now().toString(36)}`;
  const injectContext = options.injectContext ?? true;

  const threshold = LEVEL_ORDER[logLevel] ?? 2;
  function log(level: string, message: string) {
    const requested = LEVEL_ORDER[level] ?? 3;
    if (requested >= threshold) {
      process.stderr.write(
        `[neotoma-claude-agent-sdk] ${level}: ${message}\n`
      );
    }
  }

  const client = new NeotomaClient({ transport: "http", baseUrl, token });

  function idemp(turnId: string, suffix: string): string {
    return `conversation-${sessionId}-${turnId}-${suffix}`;
  }

  return {
    async UserPromptSubmit(input) {
      const prompt =
        (input.prompt as string) ?? (input.user_prompt as string) ?? "";
      const turnId = (input.turn_id as string) ?? String(Date.now());

      try {
        await client.store({
          entities: [
            {
              entity_type: "conversation_message",
              role: "user",
              sender_kind: "user",
              content: prompt,
              turn_key: `${sessionId}:${turnId}`,
              ...harnessProvenance({ hook_event: "UserPromptSubmit" }),
            },
          ],
          idempotency_key: idemp(turnId, "user"),
        });
      } catch (err) {
        log("warn", `UserPromptSubmit store failed: ${(err as Error).message}`);
      }

      recordConversationTurn(client, {
        sessionId,
        turnId,
        hookEvent: "UserPromptSubmit",
        harness: "claude-agent-sdk",
        startedAt: new Date().toISOString(),
        cwd: process.cwd(),
      }).catch(() => {});

      if (!injectContext) return {};

      const sections: Array<{ heading: string; body: unknown }> = [];
      for (const identifier of extractIdentifiers(prompt)) {
        try {
          const match = await client.retrieveEntityByIdentifier({ identifier });
          if (match) sections.push({ heading: `Entity: ${identifier}`, body: match });
        } catch (err) {
          log("debug", `retrieve(${identifier}) failed: ${(err as Error).message}`);
        }
      }
      try {
        const timeline = await client.listTimelineEvents({ limit: 5 });
        if (timeline) sections.push({ heading: "Recent timeline", body: timeline });
      } catch (err) {
        log("debug", `listTimelineEvents failed: ${(err as Error).message}`);
      }

      const formatted = sections.length === 0 ? "" : formatContext(sections);
      const hint = readFailureHint(sessionId);
      const hintText = hint ? formatFailureHint(hint) : "";
      const additional = [formatted, hintText].filter(Boolean).join("\n\n");
      if (!additional) return {};
      return {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: additional,
        },
      };
    },

    async PostToolUse(input) {
      const turnId = (input.turn_id as string) ?? String(Date.now());
      const toolName =
        (input.tool_name as string) ?? (input.tool as string) ?? "unknown";
      const toolInput = (input.tool_input as unknown) ?? {};
      const toolOutput =
        (input.tool_response as unknown) ?? (input.tool_output as unknown) ?? {};
      const hasError = Boolean(
        toolOutput &&
          typeof toolOutput === "object" &&
          (toolOutput as { error?: unknown }).error
      );

      if (hasError && isNeotomaRelevantTool(toolName, toolInput)) {
        const errorMessage = extractErrorMessage(toolOutput);
        const errorClass = classifyErrorMessage(errorMessage);
        const scrubbed = toolInputMentionsSecretPath(toolInput)
          ? WITHHELD_SECRET_PATH_SUMMARY
          : scrubErrorMessage(errorMessage);
        const counter = incrementFailureCounter(sessionId, toolName, errorClass);
        try {
          const failureEntity: StoreEntityInput = {
            entity_type: "tool_invocation_failure",
            tool_name: toolName,
            error_class: errorClass,
            error_message_redacted: scrubbed,
            invocation_shape: extractInvocationShape(toolInput),
            turn_key: `${sessionId}:${turnId}`,
            hit_count_session: counter.count,
            ...harnessProvenance({ hook_event: "PostToolUse.failure" }),
          };
          await client.store({
            entities: [failureEntity],
            idempotency_key: idemp(
              turnId,
              `tool-failure-${toolName}-${counter.count}`
            ),
          });
        } catch (err) {
          log("debug", `PostToolUse failure store failed: ${(err as Error).message}`);
        }
        return {};
      }

      try {
        await client.store({
          entities: [
            {
              entity_type: "tool_invocation",
              tool_name: toolName,
              turn_key: `${sessionId}:${turnId}`,
              has_error: hasError,
              // Metadata-only for read-type tools; redacted bounded summary
              // otherwise; nothing for secret-bearing paths.
              ...describeToolCapture({ toolName, toolInput, toolOutput }),
              ...harnessProvenance({ hook_event: "PostToolUse" }),
            },
          ],
          idempotency_key: idemp(turnId, `tool-${toolName}-${Date.now()}`),
        });
      } catch (err) {
        log("debug", `PostToolUse store failed: ${(err as Error).message}`);
      }
      return {};
    },

    async PreCompact(input) {
      const turnId = (input.turn_id as string) ?? String(Date.now());
      const trigger = (input.trigger as string) ?? "auto";
      try {
        await client.store({
          entities: [
            {
              entity_type: "context_event",
              event: "pre_compact",
              trigger,
              turn_key: `${sessionId}:${turnId}`,
              observed_at: new Date().toISOString(),
              ...harnessProvenance({ hook_event: "PreCompact" }),
            },
          ],
          idempotency_key: idemp(turnId, "compact"),
        });
      } catch (err) {
        log("debug", `PreCompact store failed: ${(err as Error).message}`);
      }
      return {};
    },

    async Stop(input) {
      const turnId = (input.turn_id as string) ?? String(Date.now());
      const final =
        (input.response as string) ??
        (input.assistant_response as string) ??
        "";
      if (!final) return {};
      try {
        await client.store({
          entities: [
            {
              entity_type: "conversation_message",
              role: "assistant",
              sender_kind: "assistant",
              content: final,
              turn_key: `${sessionId}:${turnId}:assistant`,
              observed_at: new Date().toISOString(),
              ...harnessProvenance({ hook_event: "Stop" }),
            },
          ],
          idempotency_key: idemp(turnId, "assistant"),
        });
      } catch (err) {
        log("debug", `Stop store failed: ${(err as Error).message}`);
      }

      recordConversationTurn(client, {
        sessionId,
        turnId,
        hookEvent: "Stop",
        harness: "claude-agent-sdk",
        endedAt: new Date().toISOString(),
      }).catch(() => {});

      return {};
    },
  };
}

export default createNeotomaAgentHooks;
