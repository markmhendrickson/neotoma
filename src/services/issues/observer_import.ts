/**
 * Observer JSONL import — extraction, deduplication, redaction, and submission.
 *
 * This module owns the pure, testable logic for processing observer JSONL logs
 * and extracting anomaly lines for issue filing. The CLI handler in
 * `src/cli/issues.ts` calls into this module; the module does not perform I/O
 * itself beyond what is passed in.
 *
 * ## Filter predicates (hardcoded)
 *
 * A JSONL line is "anomalous" when it matches at least one of:
 *
 * 1. `exit_code != 0` AND stderr contains an `ERR_` class prefix → hard error / transport failure
 * 2. `unknown_fields_count > 0` in stdout → schema-projection drift
 * 3. `HEURISTIC_MERGE` in stderr → identity resolution bug
 * 4. `duration_ms > 5000` on store/retrieve commands → perf regression
 * 5. `ERR_STORE_RESOLUTION_FAILED` anywhere → resolver bug
 * 6. `database disk image is malformed` anywhere → SQLite corruption
 * 7. `ERR_REPORTER_ENVIRONMENT_REQUIRED` anywhere → reporter env schema enforcement
 * 8. `404` (current) or `503` (legacy, pre-neotoma#1923 servers) status on `/mcp` → stale MCP session
 *
 * Clean lines (`exit_code == 0`, no warnings) are skipped.
 */

/** Raw fields expected in each JSONL line. All optional for forward compatibility. */
export interface ObserverLogLine {
  timestamp?: string;
  command?: string;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  duration_ms?: number;
  reporter_channel?: string;
  reporter_git_sha?: string;
  reporter_app_version?: string;
  unknown_fields_count?: number;
  status_code?: number;
  path?: string;
  [key: string]: unknown;
}

export type AnomalyClass =
  | "hard_error"
  | "schema_drift"
  | "heuristic_merge"
  | "perf_regression"
  | "resolver_bug"
  | "sqlite_corruption"
  | "reporter_env_required"
  | "stale_mcp_session";

export interface ObserverAnomaly {
  line_index: number;
  timestamp: string | null;
  anomaly_class: AnomalyClass;
  command_prefix: string;
  reporter_channel: string;
  reporter_git_sha?: string;
  reporter_app_version?: string;
  raw: ObserverLogLine;
  /** Human-readable title derived from the anomaly class and command. */
  title: string;
  /** Markdown body with relevant fields extracted from the raw line. */
  body: string;
}

/** Dedup key for folding into an existing open issue. */
export function anomalyDedupKey(a: ObserverAnomaly): string {
  return `${a.anomaly_class}:${a.command_prefix}:${a.reporter_channel}`;
}

function commandPrefix(line: ObserverLogLine): string {
  const cmd = typeof line.command === "string" ? line.command.trim() : "";
  // Use first two whitespace-separated tokens as the prefix (e.g. "store entities").
  const tokens = cmd.split(/\s+/).slice(0, 2);
  return tokens.join(" ") || "unknown";
}

function isStoreOrRetrieveCommand(line: ObserverLogLine): boolean {
  const cmd = typeof line.command === "string" ? line.command.toLowerCase() : "";
  return cmd.includes("store") || cmd.includes("retrieve") || cmd.includes("retrieve_entities");
}

function anyFieldContains(line: ObserverLogLine, substr: string): boolean {
  const lower = substr.toLowerCase();
  const fields = [line.stdout, line.stderr, line.command];
  for (const f of fields) {
    if (typeof f === "string" && f.toLowerCase().includes(lower)) return true;
  }
  // Also check string values from the rest of the line.
  for (const val of Object.values(line)) {
    if (typeof val === "string" && val.toLowerCase().includes(lower)) return true;
  }
  return false;
}

/** Classify a single parsed JSONL line; returns null if clean. */
export function classifyLine(line: ObserverLogLine): AnomalyClass | null {
  const exitCode = typeof line.exit_code === "number" ? line.exit_code : 0;
  const stderr = typeof line.stderr === "string" ? line.stderr : "";
  const unknownFieldsCount =
    typeof line.unknown_fields_count === "number" ? line.unknown_fields_count : 0;
  const durationMs = typeof line.duration_ms === "number" ? line.duration_ms : 0;
  const statusCode = typeof line.status_code === "number" ? line.status_code : 0;
  const path = typeof line.path === "string" ? line.path : "";

  // Predicate 8: 404 (current, neotoma#1923) or 503 (legacy) on /mcp → stale MCP session
  if ((statusCode === 404 || statusCode === 503) && path.includes("/mcp"))
    return "stale_mcp_session";

  // Predicate 6: SQLite corruption
  if (anyFieldContains(line, "database disk image is malformed")) return "sqlite_corruption";

  // Predicate 7: reporter env required
  if (anyFieldContains(line, "ERR_REPORTER_ENVIRONMENT_REQUIRED")) return "reporter_env_required";

  // Predicate 5: resolver bug
  if (anyFieldContains(line, "ERR_STORE_RESOLUTION_FAILED")) return "resolver_bug";

  // Predicate 3: HEURISTIC_MERGE warning
  if (stderr.includes("HEURISTIC_MERGE")) return "heuristic_merge";

  // Predicate 2: schema-projection drift
  if (unknownFieldsCount > 0) return "schema_drift";

  // Predicate 4: perf regression on store/retrieve
  if (durationMs > 5000 && isStoreOrRetrieveCommand(line)) return "perf_regression";

  // Predicate 1: hard error — exit_code != 0 with ERR_ class in stderr
  if (exitCode !== 0 && /ERR_[A-Z_]+/.test(stderr)) return "hard_error";

  // Clean line.
  return null;
}

function buildTitle(anomalyClass: AnomalyClass, line: ObserverLogLine): string {
  const prefix = commandPrefix(line);
  const ts = typeof line.timestamp === "string" ? line.timestamp.slice(0, 10) : "";
  switch (anomalyClass) {
    case "hard_error": {
      const errMatch = (line.stderr ?? "").match(/ERR_[A-Z_]+/);
      const errCode = errMatch ? errMatch[0] : "ERR_UNKNOWN";
      return `[observer] ${errCode} on \`${prefix}\`${ts ? ` (${ts})` : ""}`;
    }
    case "schema_drift":
      return `[observer] Schema projection drift on \`${prefix}\`${ts ? ` (${ts})` : ""}`;
    case "heuristic_merge":
      return `[observer] HEURISTIC_MERGE warning on \`${prefix}\`${ts ? ` (${ts})` : ""}`;
    case "perf_regression":
      return `[observer] Perf regression on \`${prefix}\` (${line.duration_ms}ms)${ts ? ` (${ts})` : ""}`;
    case "resolver_bug":
      return `[observer] ERR_STORE_RESOLUTION_FAILED on \`${prefix}\`${ts ? ` (${ts})` : ""}`;
    case "sqlite_corruption":
      return `[observer] SQLite corruption detected${ts ? ` (${ts})` : ""}`;
    case "reporter_env_required":
      return `[observer] ERR_REPORTER_ENVIRONMENT_REQUIRED on \`${prefix}\`${ts ? ` (${ts})` : ""}`;
    case "stale_mcp_session":
      return `[observer] Stale MCP session (503) on \`${line.path ?? "/mcp"}\`${ts ? ` (${ts})` : ""}`;
    default:
      return `[observer] Anomaly on \`${prefix}\`${ts ? ` (${ts})` : ""}`;
  }
}

function buildBody(anomalyClass: AnomalyClass, line: ObserverLogLine): string {
  const parts: string[] = [];
  parts.push(`**Anomaly class:** \`${anomalyClass}\``);
  if (line.timestamp) parts.push(`**Timestamp:** ${line.timestamp}`);
  if (line.command) parts.push(`**Command:** \`${line.command}\``);
  if (typeof line.exit_code === "number") parts.push(`**Exit code:** ${line.exit_code}`);
  if (typeof line.duration_ms === "number") parts.push(`**Duration:** ${line.duration_ms}ms`);
  if (typeof line.unknown_fields_count === "number")
    parts.push(`**Unknown fields count:** ${line.unknown_fields_count}`);
  if (typeof line.status_code === "number") parts.push(`**Status code:** ${line.status_code}`);
  if (line.path) parts.push(`**Path:** ${line.path}`);
  if (line.reporter_channel) parts.push(`**Reporter channel:** ${line.reporter_channel}`);
  if (line.reporter_git_sha) parts.push(`**Reporter git SHA:** ${line.reporter_git_sha}`);
  if (line.reporter_app_version)
    parts.push(`**Reporter app version:** ${line.reporter_app_version}`);

  if (line.stderr && line.stderr.trim()) {
    parts.push(`\n**stderr:**\n\`\`\`\n${line.stderr.trim()}\n\`\`\``);
  }
  if (line.stdout && line.stdout.trim()) {
    parts.push(`\n**stdout:**\n\`\`\`\n${line.stdout.trim()}\n\`\`\``);
  }

  return parts.join("\n");
}

/** Parse a single JSONL line string into a structured object. Returns null if unparseable. */
export function parseJsonlLine(raw: string): ObserverLogLine | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as ObserverLogLine;
  } catch {
    return null;
  }
}

export interface ExtractionOptions {
  since?: string;
  until?: string;
  reporterChannel?: string;
  limit?: number;
}

export interface ExtractionResult {
  anomalies: ObserverAnomaly[];
  lines_scanned: number;
  lines_skipped_by_filter: number;
  lines_unparseable: number;
}

/**
 * Extract anomalies from a JSONL content string (the file contents, not a path).
 * Pure function — no I/O.
 */
export function extractAnomalies(content: string, opts: ExtractionOptions = {}): ExtractionResult {
  const lines = content.split("\n");
  const anomalies: ObserverAnomaly[] = [];
  let lines_scanned = 0;
  let lines_skipped_by_filter = 0;
  let lines_unparseable = 0;

  const sinceMs = opts.since ? Date.parse(opts.since) : null;
  const untilMs = opts.until ? Date.parse(opts.until) : null;
  const limitN = typeof opts.limit === "number" && opts.limit > 0 ? opts.limit : null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;

    const parsed = parseJsonlLine(raw);
    if (parsed === null) {
      lines_unparseable++;
      continue;
    }

    lines_scanned++;

    // Apply timestamp filters.
    const tsStr = typeof parsed.timestamp === "string" ? parsed.timestamp : "";
    if (tsStr) {
      const tsMs = Date.parse(tsStr);
      if (sinceMs !== null && !isNaN(tsMs) && tsMs < sinceMs) {
        lines_skipped_by_filter++;
        continue;
      }
      if (untilMs !== null && !isNaN(tsMs) && tsMs > untilMs) {
        lines_skipped_by_filter++;
        continue;
      }
    }

    const anomalyClass = classifyLine(parsed);
    if (anomalyClass === null) continue;

    const channel =
      opts.reporterChannel ??
      (typeof parsed.reporter_channel === "string" ? parsed.reporter_channel : "unknown");

    const anomaly: ObserverAnomaly = {
      line_index: i,
      timestamp: tsStr || null,
      anomaly_class: anomalyClass,
      command_prefix: commandPrefix(parsed),
      reporter_channel: channel,
      reporter_git_sha:
        typeof parsed.reporter_git_sha === "string" ? parsed.reporter_git_sha : undefined,
      reporter_app_version:
        typeof parsed.reporter_app_version === "string" ? parsed.reporter_app_version : undefined,
      raw: parsed,
      title: buildTitle(anomalyClass, parsed),
      body: buildBody(anomalyClass, parsed),
    };

    anomalies.push(anomaly);

    if (limitN !== null && anomalies.length >= limitN) break;
  }

  return { anomalies, lines_scanned, lines_skipped_by_filter, lines_unparseable };
}

/** Outcome for a single anomaly after dedup + submission. */
export type AnomalyOutcome =
  | { status: "filed"; entity_id: string; issue_number?: number }
  | { status: "folded"; existing_entity_id: string }
  | { status: "skipped"; reason: string }
  | { status: "dry_run"; title: string; body: string };

export interface SweepReport {
  lines_scanned: number;
  lines_unparseable: number;
  lines_skipped_by_filter: number;
  anomalies_extracted: number;
  issues_filed: number;
  issues_folded: number;
  issues_skipped: number;
  outcomes: Array<{
    anomaly: Pick<ObserverAnomaly, "line_index" | "anomaly_class" | "title">;
    outcome: AnomalyOutcome;
  }>;
}
