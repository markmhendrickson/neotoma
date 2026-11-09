/**
 * Tool-capture policy shared by the Neotoma agent-hook packages.
 *
 * Hooks persist a `tool_invocation` record per tool call. Tool output is the
 * bytes of whatever the tool touched, so the record carries METADATA ONLY
 * (tool name, path, byte length) for every tool that is not positively known
 * to be a harmless non-content tool, and a bounded, secret-redacted summary
 * for the ones that are. Nothing is stored for a call that touches a
 * secret-bearing path or runs a secret-producing command. The policy fails
 * closed: an unclassified tool, an input larger than the scan limits, or a
 * scan that had to stop early all withhold output text.
 *
 * Adds fields to the stored record; never renames existing ones
 * (`input_summary` and `output_summary` keep their string shape).
 *
 * THIS FILE IS COPIED VERBATIM into packages/opencode-plugin/src,
 * packages/claude-agent-sdk-adapter/src and src/services (the packages ship
 * independently). `tests/unit/hook_capture_policy_copies.test.ts` fails if a
 * copy drifts; edit cursor-hooks' copy and re-copy. Python twins:
 * packages/claude-code-plugin/hooks/capture_policy.py and the identical copy
 * in packages/codex-hooks/hooks. Behaviour parity across all of them is pinned
 * by tests/fixtures/hook_output_capture/vectors.json.
 */

import { realpathSync } from "node:fs";

const SUMMARY_MAX_LEN = 400;
/** Redaction only ever returns the first SUMMARY_MAX_LEN characters, so it reads a bounded prefix. */
const REDACT_PREFIX_LEN = 8192;
const INPUT_STRING_CAP = 65536;
const INPUT_NODE_BUDGET = 5000;
const INPUT_MAX_DEPTH = 12;
const INPUT_ARRAY_CAP = 1000;
const OUTPUT_SCAN_CAP = 262144;
const RESOLVE_CAP = 256;

export const WITHHELD_SECRET_PATH_SUMMARY = "[output withheld]";
export const WITHHELD_READ_SUMMARY = "[output not stored]";

// ---------------------------------------------------------------------------
// Secret-bearing paths
// ---------------------------------------------------------------------------

const SECRET_BASENAME_PATTERNS: RegExp[] = [
  /^\.env/i,
  /\.env$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ppk|gpg|pgp|jwk|keychain|keychain-db|tfvars|tfstate)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?!.*\.pub$)/i,
  /^_?\.?(?:npmrc|yarnrc|netrc|pgpass|pypirc|git-credentials|htpasswd|dockercfg|vault-token|kubeconfig)$/i,
  /\.sops(?:\.|$)/i,
  /^keys?\.(?:txt|json|pem|yaml|yml)$/i,
  /^\.claude\.json$/i,
  /^\.?mcp\.json$/i,
  /^auth\.(?:json|toml|ya?ml)$/i,
  /^hosts\.ya?ml$/i,
  /^wallet\.(?:dat|json)$/i,
  /^tokens?\.(?:json|txt|ya?ml|toml|env|key|pem|cfg|conf|ini)$/i,
  /^tokens?$/i,
  /^application-(?:prod|production|secrets?)\.(?:ya?ml|properties)$/i,
  /^\.?(?:bash|zsh|sh|fish|psql|mysql|python|node_repl|irb|lesshst|viminfo)_?(?:history|rc|profile|env|aliases)$/i,
  /_history$/i,
  /^\.(?:zshrc|bashrc|zprofile|zshenv|bash_profile|profile)$/i,
  /(?:^|[._-])(?:mnemonic|seed[_-]?phrase|recovery[_-]?phrase)(?:[._-]|$)/i,
  /(?:^|[._-])(?:secrets?|credentials?|passwords?|private[_-]?keys?|service[_-]?account|client[_-]?secret|api[_-]?keys?|access[_-]?tokens?|refresh[_-]?tokens?)(?:[._-]|$)/i,
];

/** Whole-path patterns (matched against the normalised, forward-slash path). */
const SECRET_PATH_PATTERNS: RegExp[] = [/(?:^|\/)\.git\/config$/i];

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

function percentDecode(text: string): string {
  return text.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

function lexicalSecretPath(raw: string): boolean {
  const normalised = raw.trim().replace(/\\/g, "/");
  if (!normalised || normalised.length > 4096) return false;
  if (SECRET_PATH_PATTERNS.some((re) => re.test(normalised))) return true;
  const segments = normalised.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  for (const segment of segments) {
    if (SECRET_DIR_SEGMENTS.has(segment.toLowerCase())) return true;
  }
  const base = segments[segments.length - 1];
  return SECRET_BASENAME_PATTERNS.some((re) => re.test(base));
}

interface ScanContext {
  /** Whether to resolve symlinks (input paths only; output text is just scanned for names). */
  resolve: boolean;
  /** Symlink resolutions left; exhausting this marks the scan truncated. */
  resolveBudget: number;
  /** True when any limit stopped the scan from looking at everything. */
  truncated: boolean;
}

function newContext(resolve = true): ScanContext {
  return { resolve, resolveBudget: RESOLVE_CAP, truncated: false };
}

function pathVariants(raw: string): string[] {
  const out = [raw];
  let current = raw.trim();
  const fileUri = /^file:(?:\/\/[^/]*)?/i.exec(current);
  if (fileUri) {
    current = current.slice(fileUri[0].length);
    out.push(current);
  }
  if (/%[0-9a-fA-F]{2}/.test(current)) out.push(percentDecode(current));
  return out;
}

function secretPathIn(raw: string, ctx: ScanContext): boolean {
  if (!raw || raw.length > 4096) return false;
  const variants = pathVariants(raw);
  if (variants.some(lexicalSecretPath)) return true;
  // A benign-looking name can be a symlink to a secret-bearing file.
  const candidate = variants[variants.length - 1].trim();
  if (
    ctx.resolve &&
    (candidate.includes("/") || candidate.includes("\\") || candidate.startsWith("."))
  ) {
    if (ctx.resolveBudget <= 0) {
      ctx.truncated = true;
      return false;
    }
    ctx.resolveBudget -= 1;
    try {
      const resolved = realpathSync(candidate);
      if (resolved !== candidate && lexicalSecretPath(resolved)) return true;
    } catch {
      // not an existing path
    }
  }
  return false;
}

/** True when a path names a secret-bearing file, sits in a secret directory, or resolves to one. */
export function isSecretBearingPath(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return secretPathIn(raw, newContext());
}

// ---------------------------------------------------------------------------
// Credential-shaped text
// ---------------------------------------------------------------------------

const SECRET_NAME_KEYWORDS =
  "secret|token|passw(?:or)?d|passphrase|pass(?![a-z])|pwd|credential|authorization|api[_-]?key|access[_-]?key|private[_-]?key|(?:encryption|signing|ssh|master|auth|license|client|service|app|deploy|crypt)[_-]?key|cookie|mnemonic|seed[_-]?phrase|session[_-]?id|signature|dsn";

const SECRET_TEXT_ASSIGNMENT_RE = new RegExp(
  "(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]*(?:" +
    SECRET_NAME_KEYWORDS +
    ")[A-Za-z0-9_.-]*\\\\?[\"']?\\s*[:=]\\s*)" +
    '((?:(?:bearer|basic)\\s+)?(?:\\\\?"(?:[^"\\\\]|\\\\(?!"))*\\\\?"|\'[^\']*\'|[^\\s"\'\\\\,;&}\\]]+))',
  "gi"
);

const SECRET_FLAG_RE = new RegExp(
  "(?<![A-Za-z0-9_-])(--?[A-Za-z0-9-]*(?:" +
    "password|passwd|pass|pwd|passphrase|token|secret|api-?key|access-?key|private-?key|credential|auth|authorization|bearer|cookie" +
    ")[A-Za-z0-9-]*(?:=|\\s+))(?!-)(\"[^\"]*\"|'[^']*'|\\S+)",
  "gi"
);

/**
 * Redact credential-shaped text. Extends the token pattern already used by
 * `scrubErrorMessage` with private-key blocks, common provider tokens, JWTs,
 * bearer/basic credentials, URL credentials, secret-looking flags
 * (`--password x`, `-pX`, `-u user:pass`) and `NAME=value` / `"name": "value"`
 * assignments for secret-looking names. Only the first REDACT_PREFIX_LEN
 * characters are read; callers return at most SUMMARY_MAX_LEN of the result.
 */
export function redactSecretText(raw: unknown): string {
  if (raw == null) return "";
  let out = typeof raw === "string" ? raw : String(raw);
  if (out.length > REDACT_PREFIX_LEN) out = out.slice(0, REDACT_PREFIX_LEN);
  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
    "<PRIVATE_KEY>"
  );
  out = out.replace(/\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b/g, "<TOKEN>");
  out = out.replace(
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{30,}|hf_[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{30,})\b/g,
    "<TOKEN>"
  );
  out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "<JWT>");
  out = out.replace(/\b((?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1<REDACTED>");
  out = out.replace(/(:\/\/)[^/\s:@]+:[^/\s@]+@/g, "$1<redacted>@");
  out = out.replace(/((?:^|\s)(?:-u|--user|--proxy-user)(?:\s+|=))(\S*:\S*)/g, "$1<REDACTED>");
  out = out.replace(/((?:^|\s)-p)(?=[^\s=-])\S+/g, "$1<REDACTED>");
  out = out.replace(SECRET_FLAG_RE, "$1<REDACTED>");
  out = out.replace(SECRET_TEXT_ASSIGNMENT_RE, "$1<REDACTED>");
  return out;
}

// ---------------------------------------------------------------------------
// Tool input scan (every string, fail closed)
// ---------------------------------------------------------------------------

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
  "directory",
  "dir",
]);

/** Commands whose output is, or can be, a credential. */
const SECRET_SOURCE_COMMAND_RES: RegExp[] = [
  /(?<![A-Za-z0-9_-])op\s+(?:read|item|inject|run|document)(?![A-Za-z0-9_-])/i,
  /(?<![A-Za-z0-9_-])security\s+(?:find-generic-password|find-internet-password|dump-keychain|export)(?![A-Za-z0-9_-])/i,
  /(?<![A-Za-z0-9_-])pass\s+show(?![A-Za-z0-9_-])/i,
  /(?<![A-Za-z0-9_-])gpg2?\b[^|;&\n]*(?:--decrypt|\s-d\b)/i,
  /(?<![A-Za-z0-9_-])sops\s+(?:-d|--decrypt|exec-env)/i,
  /(?<![A-Za-z0-9_-])gh\s+auth\s+(?:token|status)/i,
  /(?<![A-Za-z0-9_-])(?:aws\s+(?:secretsmanager|ssm)|vault\s+(?:read|kv)|kubectl\s+get\s+secrets?|fly\s+secrets|doppler\s+secrets)(?![A-Za-z0-9_-])/i,
  /(?<![A-Za-z0-9_-])printenv(?![A-Za-z0-9_-])/i,
  /(?:^|[;&|(\s/])env(?:\s|$)/,
  /(?:^|[;&|(\s])set\s*(?:$|[;&|)>])/,
  /(?<![A-Za-z0-9_-])(?:export|declare|typeset)\s+-[A-Za-z]*p(?![A-Za-z0-9_-])/,
  /(?<![A-Za-z0-9_-])compgen\s+-[A-Za-z]*e/,
  /(?<![A-Za-z0-9_-])(?:fly|flyctl)\s+ssh/i,
  /(?<![A-Za-z0-9_-])(?:docker|podman)\s+(?:exec|inspect|logs)(?![A-Za-z0-9_-])/i,
  /(?<![A-Za-z0-9_-])kubectl\s+(?:exec|logs|describe)(?![A-Za-z0-9_-])/i,
  /\/proc\/[^\s/]+\/environ/i,
  /\$\{?[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASS|PASSWORD|PWD)[A-Za-z0-9_]*\}?/,
];

function textIsSecretSource(text: string): boolean {
  return SECRET_SOURCE_COMMAND_RES.some((re) => re.test(text));
}

const TOKEN_SPLIT_RE = /[\s"'`;|&<>()=,:[\]{}]+/;

function stringMentionsSecretPath(text: string, cap: number, ctx: ScanContext): boolean {
  if (text.length > cap) ctx.truncated = true;
  const bounded = text.length > cap ? text.slice(0, cap) : text;
  // Whole-string check only for a single token: prose is judged token by token below.
  if (bounded.length <= 4096 && !/\s/.test(bounded) && secretPathIn(bounded, ctx)) return true;
  const sources = [bounded];
  if (/%[0-9a-fA-F]{2}/.test(bounded)) sources.push(percentDecode(bounded));
  for (const source of sources) {
    for (const rawToken of source.split(TOKEN_SPLIT_RE)) {
      const token = rawToken.replace(/[.,;:!?]+$/, "");
      if (!token) continue;
      if (
        (token.includes("/") || token.includes("\\") || token.includes(".")) &&
        secretPathIn(token, ctx)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * A value is stored as path metadata only when it is path-shaped: no whitespace,
 * no URL scheme other than file:, and nothing for the redaction to change. Anything
 * else (a search pattern, a URL carrying credentials, credential-shaped text) is omitted.
 */
function pathShapedForMetadata(value: string): boolean {
  if (!value || value.length > 512 || /\s/.test(value)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) && !/^file:/i.test(value)) return false;
  return redactSecretText(value) === value;
}

interface CollectedInput {
  /** Values under well-known path keys (metadata only; first few). */
  paths: string[];
  /** A secret-bearing path or secret-producing command appears anywhere in the input. */
  secret: boolean;
  /** A scan limit was reached: treat the input as possibly secret. */
  truncated: boolean;
}

function collectInput(toolInput: unknown): CollectedInput {
  const ctx = newContext();
  const paths: string[] = [];
  let secret = false;
  let budget = INPUT_NODE_BUDGET;
  const walk = (value: unknown, key: string, depth: number): void => {
    if (value == null || typeof value === "number" || typeof value === "boolean") return;
    if (budget-- <= 0 || depth > INPUT_MAX_DEPTH) {
      ctx.truncated = true;
      return;
    }
    if (typeof value === "string") {
      if (
        CAPTURE_PATH_KEYS.has(key.toLowerCase()) &&
        paths.length < 8 &&
        pathShapedForMetadata(value)
      ) {
        paths.push(value);
      }
      if (stringMentionsSecretPath(value, INPUT_STRING_CAP, ctx)) secret = true;
      const head = value.length > INPUT_STRING_CAP ? value.slice(0, INPUT_STRING_CAP) : value;
      if (head.length <= 4096 && textIsSecretSource(head)) secret = true;
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > INPUT_ARRAY_CAP) ctx.truncated = true;
      for (const item of value.slice(0, INPUT_ARRAY_CAP)) walk(item, key, depth + 1);
      return;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > INPUT_ARRAY_CAP) ctx.truncated = true;
      for (const [k, v] of entries.slice(0, INPUT_ARRAY_CAP)) {
        if (stringMentionsSecretPath(k, 4096, ctx)) secret = true;
        walk(v, k, depth + 1);
      }
      return;
    }
    // functions, symbols, bigint: not serialisable input; cannot be inspected.
    ctx.truncated = true;
  };
  walk(toolInput, "", 0);
  return { paths, secret, truncated: ctx.truncated };
}

/**
 * True when a tool input names a secret-bearing path or secret-producing
 * command in ANY string value (any key, any depth), or when the input was too
 * large or too deep to scan completely.
 */
export function toolInputMentionsSecretPath(toolInput: unknown): boolean {
  const collected = collectInput(toolInput);
  return collected.secret || collected.truncated;
}

// ---------------------------------------------------------------------------
// Tool classification (default: not harmless)
// ---------------------------------------------------------------------------

function toolNameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Tools whose names say they return file or search content. */
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
  "fetch",
  "download",
  "contents",
  "content",
]);
/** Tools whose INPUT carries content, and whose result may echo content. */
const WRITE_TOOL_TOKENS = new Set([
  "write",
  "edit",
  "editor",
  "replace",
  "patch",
  "append",
  "insert",
  "save",
  "upload",
  "put",
]);
/** Tools positively known not to return file or tool-fetched content. */
const HARMLESS_TOOL_TOKENS = new Set([
  "todo",
  "todos",
  "ask",
  "question",
  "plan",
  "mode",
  "switch",
  "think",
]);

const SHELL_READ_WORD_RE = new RegExp(
  "(?<![A-Za-z0-9_-])(?:" +
    [
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
      "gawk",
      "xargs",
      "find",
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
      "tee",
      "cp",
      "mv",
      "scp",
      "rsync",
      "curl",
      "wget",
      "source",
      "eval",
      "dd",
      "type",
      "get-content",
      "gc",
      "open",
      "vi",
      "vim",
      "nano",
      "tar",
      "zip",
      "unzip",
      "cpio",
      "pbcopy",
      "diff",
      "cmp",
      "comm",
      "paste",
      "fold",
      "rev",
      "column",
      "read",
      "mapfile",
      "readarray",
    ].join("|") +
    ")(?![A-Za-z0-9_-])",
  "i"
);
const SHELL_GIT_CONTENT_RE =
  /(?<![A-Za-z0-9_-])git\b[^|;&\n]*(?<![A-Za-z0-9_-])(?:show|diff|log|blame|cat-file|grep|archive|format-patch|stash)(?![A-Za-z0-9_-])/i;
const SHELL_INLINE_CODE_RE =
  /(?<![A-Za-z0-9_-])(?:(?:bash|sh|zsh|dash|ksh)\s+(?:-[A-Za-z]*c\b)|(?:python[0-9.]*|node|perl|ruby|php|deno|bun|lua)\s+-[A-Za-z]*[ceEp]\b)/i;

/** Any command whose text could read or fetch file content. */
function commandReadsContent(command: string): boolean {
  if (command.length > INPUT_STRING_CAP) return true;
  return (
    SHELL_READ_WORD_RE.test(command) ||
    SHELL_GIT_CONTENT_RE.test(command) ||
    SHELL_INLINE_CODE_RE.test(command) ||
    command.includes("<")
  );
}

function shellCommandOf(toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== "object") return null;
  const record = toolInput as Record<string, unknown>;
  const command = record.command ?? record.cmd;
  return typeof command === "string" ? command : null;
}

function isNeotomaFamily(toolName: string, toolInput: unknown): boolean {
  if (toolName.toLowerCase().includes("neotoma")) return true;
  if (toolInput && typeof toolInput === "object") {
    const record = toolInput as Record<string, unknown>;
    for (const key of ["server", "toolName", "tool_name"]) {
      const value = record[key];
      if (typeof value === "string" && value.toLowerCase().includes("neotoma")) return true;
    }
  }
  return false;
}

/** Tools whose names say they read, search, fetch or parse content. */
export function isReadTypeTool(toolName: unknown, toolInput: unknown): boolean {
  const tokens = toolNameTokens(typeof toolName === "string" ? toolName : "");
  if (tokens.some((t) => READ_TOOL_TOKENS.has(t))) return true;
  const command = shellCommandOf(toolInput);
  return command !== null && commandReadsContent(command);
}

/** Tools whose input carries the file content being written. */
export function isWriteTypeTool(toolName: unknown): boolean {
  const tokens = toolNameTokens(typeof toolName === "string" ? toolName : "");
  if (tokens.some((t) => WRITE_TOOL_TOKENS.has(t))) return true;
  return tokens.includes("create") && tokens.includes("file");
}

/**
 * Positive classification of a tool as returning no file or fetched content:
 * Neotoma's own tools and a few planning/UI tools. Shell commands are NOT
 * harmless: a program name says nothing about what it prints, so shell output is
 * stored as metadata only like every other unclassified tool.
 */
export function isHarmlessNonContentTool(toolName: unknown, toolInput: unknown): boolean {
  const name = typeof toolName === "string" ? toolName : "";
  if (isReadTypeTool(name, toolInput) || isWriteTypeTool(name)) return false;
  if (isNeotomaFamily(name, toolInput)) return true;
  return toolNameTokens(name).some((t) => HARMLESS_TOOL_TOKENS.has(t));
}

// ---------------------------------------------------------------------------
// Capture fields
// ---------------------------------------------------------------------------

function serializeForCapture(value: unknown): string | null {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return null;
  }
}

function boundCapture(text: string, maxLen = SUMMARY_MAX_LEN): string {
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 3)}...`;
}

export interface ToolCaptureFields {
  input_summary: string;
  output_summary: string;
  input_capture: "redacted_summary" | "metadata_only";
  output_capture: "redacted_summary" | "metadata_only" | "withheld_secret_path";
  output_bytes: number;
  target_path?: string;
}

/**
 * Build the capture fields for a `tool_invocation` record.
 *
 * - secret-bearing path or secret-producing command anywhere in the input, a
 *   secret-bearing path named in the output, or any scan that hit a limit:
 *   no output text and no input content; byte length only.
 * - any tool that is not positively harmless (file reads, searches, fetches,
 *   parses, writes whose results can echo content, unknown tools): metadata only.
 * - harmless non-content tools: bounded summary with credential-shaped text redacted.
 * - write-type tools and secret calls store their input as metadata (paths and
 *   key names), never the content.
 */
export function describeToolCapture(args: {
  toolName: unknown;
  toolInput: unknown;
  toolOutput: unknown;
}): ToolCaptureFields {
  const { toolName, toolInput, toolOutput } = args;
  const collected = collectInput(toolInput);
  const outText = serializeForCapture(toolOutput);
  const outputBytes = outText === null ? 0 : Buffer.byteLength(outText, "utf8");
  const outCtx = newContext(false);
  const outputSecret =
    outText !== null &&
    (stringMentionsSecretPath(outText, OUTPUT_SCAN_CAP, outCtx) || outCtx.truncated);
  const secret = collected.secret || collected.truncated || outputSecret;

  const fields: Partial<ToolCaptureFields> = { output_bytes: outputBytes };
  if (collected.paths.length > 0) fields.target_path = collected.paths[0];

  if (secret) {
    fields.output_summary = WITHHELD_SECRET_PATH_SUMMARY;
    fields.output_capture = "withheld_secret_path";
  } else if (!isHarmlessNonContentTool(toolName, toolInput)) {
    fields.output_summary = WITHHELD_READ_SUMMARY;
    fields.output_capture = "metadata_only";
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

/**
 * Shape of a failed call's input for `tool_invocation_failure.invocation_shape`:
 * which well-known fields were present and how long each was, never their text.
 */
export function summarizeInvocationShape(toolInput: unknown): Record<string, unknown> {
  if (!toolInput || typeof toolInput !== "object") return {};
  const record = toolInput as Record<string, unknown>;
  const shape: Record<string, unknown> = {};
  for (const key of ["command", "cmd", "url", "method", "endpoint", "path", "operation"]) {
    const value = record[key];
    if (typeof value === "string") shape[key] = `<${value.length} chars>`;
  }
  if (Array.isArray(record.entities)) shape.entity_count = record.entities.length;
  return shape;
}
