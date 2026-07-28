/**
 * CLI implementation for `neotoma digest` commands.
 *
 * Subcommands:
 *   import  -- Consume an observer NDJSON/usage-digest feed and store each
 *              digest row into the local Neotoma instance.
 *
 * This is the Mark-side receiving end of the org-level routing pipeline
 * described in issue #1492.  Simon's observer emits `usage_digest` entities
 * as NDJSON; this command ingests them into Mark's Neotoma, making the digest
 * rows available for trend queries, Inspector drill-down, and MCP retrieval.
 *
 * Each NDJSON line must be a well-formed JSON object that satisfies the
 * `usage_digest` schema (docs/subsystems/usage_digest.md).  Required fields:
 *   - schema_version (string, must be "1.0")
 *   - period_start   (ISO-8601 string)
 *   - period_end     (ISO-8601 string)
 *   - reporter_channel (string)
 *
 * Lines that fail validation are logged to stderr and skipped; the command
 * continues with the remaining lines (fail-soft, never aborts the whole run).
 *
 * Idempotency: each digest is stored with a deterministic `idempotency_key`
 * derived from `(reporter_channel, period_end)` so re-running against the
 * same file is safe — the store seam deduplicates via the existing
 * observation-merge path.
 *
 * Server-side PII redaction (free-text `notes` and `friction_notes` fields)
 * is enforced by the store seam regardless of what the emitter sent
 * (docs/subsystems/usage_digest.md §Redaction).  No client-side redaction is
 * applied here because Mark's instance trusts Simon's channel but the
 * server-side backstop still fires.
 */

import type { NeotomaApiClient } from "../shared/api_client.js";

export interface DigestImportOpts {
  fromNdjson: string;
  since?: string;
  until?: string;
  /** Override reporter_channel for every row (useful when the feed omits it). */
  reporterChannel?: string;
  dryRun?: boolean;
  limit?: number;
  json?: boolean;
}

/** Minimum shape required to store a usage_digest. */
interface UsageDigestRow {
  schema_version: string;
  period_start: string;
  period_end: string;
  reporter_channel: string;
  /** Forwarded verbatim from the NDJSON line; the store seam validates further. */
  [key: string]: unknown;
}

interface ImportReport {
  lines_scanned: number;
  lines_unparseable: number;
  lines_skipped_by_filter: number;
  lines_skipped_by_validation: number;
  digests_stored: number;
  digests_skipped: number;
  outcomes: Array<{
    line_index: number;
    reporter_channel: string;
    period_end: string;
    outcome: { status: "stored" | "skipped" | "dry_run"; reason?: string };
  }>;
}

function output(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else if (typeof data === "string") {
    process.stdout.write(data + "\n");
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

/** Parse and validate a single NDJSON line as a usage_digest row. */
function parseDigestLine(raw: string): UsageDigestRow | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("//")) return { error: "blank or comment line" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "JSON parse error" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "not a JSON object" };
  }

  const row = parsed as Record<string, unknown>;

  // Required field validation.
  if (typeof row.schema_version !== "string" || row.schema_version !== "1.0") {
    return { error: `schema_version must be "1.0", got ${JSON.stringify(row.schema_version)}` };
  }
  if (typeof row.period_start !== "string" || !row.period_start) {
    return { error: "period_start must be a non-empty ISO-8601 string" };
  }
  if (typeof row.period_end !== "string" || !row.period_end) {
    return { error: "period_end must be a non-empty ISO-8601 string" };
  }
  if (typeof row.reporter_channel !== "string" || !row.reporter_channel) {
    return { error: "reporter_channel must be a non-empty string" };
  }

  return row as UsageDigestRow;
}

/** Deterministic idempotency key: same (channel, period_end) always maps to the same digest row. */
function digestIdempotencyKey(channel: string, periodEnd: string): string {
  return `usage-digest-${channel}-${periodEnd}`;
}

/**
 * `neotoma digest import --from-ndjson <path>`
 *
 * Reads an NDJSON digest feed (one JSON object per line), validates each line
 * against the usage_digest schema, and stores it into the local Neotoma
 * instance via the store API.
 */
export async function digestImport(
  opts: DigestImportOpts,
  api: NeotomaApiClient
): Promise<void> {
  const fs = await import("node:fs/promises");

  let content: string;
  try {
    content = await fs.readFile(opts.fromNdjson, "utf8");
  } catch (err) {
    process.stderr.write(
      `digest import: cannot read file ${opts.fromNdjson}: ${(err as Error).message}\n`
    );
    process.exitCode = 1;
    return;
  }

  const lines = content.split("\n");
  const report: ImportReport = {
    lines_scanned: 0,
    lines_unparseable: 0,
    lines_skipped_by_filter: 0,
    lines_skipped_by_validation: 0,
    digests_stored: 0,
    digests_skipped: 0,
    outcomes: [],
  };

  const sinceMs = opts.since ? Date.parse(opts.since) : null;
  const untilMs = opts.until ? Date.parse(opts.until) : null;
  const limitN =
    typeof opts.limit === "number" && Number.isFinite(opts.limit) && opts.limit > 0
      ? opts.limit
      : null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;

    if (limitN !== null && report.digests_stored >= limitN) break;

    const parsed = parseDigestLine(raw);
    if ("error" in parsed) {
      report.lines_unparseable++;
      if (!opts.json) {
        process.stderr.write(`[digest import] Line ${i}: skipping — ${parsed.error}\n`);
      }
      continue;
    }

    report.lines_scanned++;

    // Apply reporter_channel override.
    const channel =
      typeof opts.reporterChannel === "string" && opts.reporterChannel.trim()
        ? opts.reporterChannel.trim()
        : parsed.reporter_channel;

    const periodEnd = parsed.period_end;
    const periodEndMs = Date.parse(periodEnd);

    // Apply timestamp filters against period_end.
    if (sinceMs !== null && !isNaN(periodEndMs) && periodEndMs < sinceMs) {
      report.lines_skipped_by_filter++;
      continue;
    }
    if (untilMs !== null && !isNaN(periodEndMs) && periodEndMs > untilMs) {
      report.lines_skipped_by_filter++;
      continue;
    }

    const idempotencyKey = digestIdempotencyKey(channel, periodEnd);
    const entityPayload: Record<string, unknown> = {
      ...parsed,
      reporter_channel: channel,
      entity_type: "usage_digest",
      idempotency_key: idempotencyKey,
    };

    if (opts.dryRun) {
      report.outcomes.push({
        line_index: i,
        reporter_channel: channel,
        period_end: periodEnd,
        outcome: { status: "dry_run" },
      });
      continue;
    }

    try {
      const { error } = await api.POST("/store", {
        body: { entities: [entityPayload] },
      });

      if (error) {
        const reason = `store failed: ${JSON.stringify(error)}`;
        report.digests_skipped++;
        report.outcomes.push({
          line_index: i,
          reporter_channel: channel,
          period_end: periodEnd,
          outcome: { status: "skipped", reason },
        });
        if (!opts.json) {
          process.stderr.write(`[digest import] Line ${i}: skipped — ${reason}\n`);
        }
        continue;
      }

      report.digests_stored++;
      report.outcomes.push({
        line_index: i,
        reporter_channel: channel,
        period_end: periodEnd,
        outcome: { status: "stored" },
      });
    } catch (err) {
      const reason = `store error: ${(err as Error).message}`;
      report.digests_skipped++;
      report.outcomes.push({
        line_index: i,
        reporter_channel: channel,
        period_end: periodEnd,
        outcome: { status: "skipped", reason },
      });
      if (!opts.json) {
        process.stderr.write(`[digest import] Line ${i}: skipped — ${reason}\n`);
      }
    }
  }

  // Emit report.
  if (opts.json || opts.dryRun) {
    output(report, true);
  } else {
    process.stdout.write(`\n=== Digest NDJSON import report ===\n`);
    process.stdout.write(`  Lines scanned:           ${report.lines_scanned}\n`);
    process.stdout.write(`  Lines unparseable:       ${report.lines_unparseable}\n`);
    process.stdout.write(`  Lines filtered:          ${report.lines_skipped_by_filter}\n`);
    process.stdout.write(`  Lines invalid:           ${report.lines_skipped_by_validation}\n`);
    if (opts.dryRun) {
      process.stdout.write(`  (dry-run: nothing stored)\n`);
    } else {
      process.stdout.write(`  Digests stored:          ${report.digests_stored}\n`);
      process.stdout.write(`  Digests skipped:         ${report.digests_skipped}\n`);
    }
  }
}
