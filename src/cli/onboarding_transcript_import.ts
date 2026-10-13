/**
 * Onboarding transcript import — shared logic for:
 *   - `neotoma init --import-transcripts`
 *   - `neotoma onboarding import-transcripts`
 *
 * Discovers transcript files from known harness locations (claude-code, codex,
 * cursor), optionally filters to one harness, and submits each file to the
 * store pipeline via POST /store (unstructured file path). Dry-run by default.
 */

import { stat } from "node:fs/promises";
import type { NeotomaApiClient } from "../shared/api_client.js";

export interface TranscriptImportOptions {
  /** Limit discovery to a specific harness. Default: all detected harnesses. */
  harness?: "claude-code" | "codex" | "cursor";
  /** Maximum number of transcript files to process per harness. */
  limit?: number;
  /**
   * When true (default), report discovered files without sending them to the
   * store pipeline. Pass false to actually store.
   */
  dryRun?: boolean;
  /** Neotoma API client (must be connected to a running server). */
  api: NeotomaApiClient;
  /** User ID to scope the store operation. */
  userId?: string;
}

export interface TranscriptImportResult {
  harnesses_scanned: number;
  files_found: number;
  files_stored: number;
  files_skipped: number;
  errors: Array<{ file: string; error: string }>;
  /**
   * Files stored WITHOUT session identity (`agent_session` /
   * `session_transcript`). The raw transcript is still stored, but such a
   * session cannot be located or resumed — `cwd` is load-bearing, not
   * decorative. Surfaced so a caller can distinguish a full import from a
   * degraded one without re-parsing every file.
   */
  session_identity_degraded: Array<{
    file: string;
    reason: string;
    /**
     * `expected` — the source has no resumable session by design (a ChatGPT or
     * Slack export). Re-running will never change this.
     * `unexpected` — a parse failure or empty parse; re-running after a parser
     * fix can backfill identity.
     */
    kind: "expected" | "unexpected";
  }>;
}

/**
 * Parse a transcript and derive its session-identity entities. Best-effort: a
 * parse failure must not block storing the raw file, which remains the durable
 * artifact. Degradation is reported rather than swallowed — the caller records
 * it on `session_identity_degraded` and warns on stderr.
 */
async function deriveSessionEntities(filePath: string): Promise<{
  entities: Array<Record<string, unknown>>;
  contentHash?: string;
  reason?: string;
  kind?: "expected" | "unexpected";
}> {
  try {
    const { parseTranscript, conversationsToEntities, HARNESS_SOURCES } =
      await import("./transcript_parser.js");
    const result = await parseTranscript({ filePath });
    if (result.conversations.length === 0) {
      return {
        entities: [],
        reason: "no messages parsed from transcript",
        kind: "unexpected",
      };
    }
    const contentHash = result.contentHash;

    const entities = conversationsToEntities(result.conversations, {
      filePath: result.filePath,
      contentHash: result.contentHash,
      fileSize: result.fileSize,
    }).filter((e) => e.entity_type === "agent_session" || e.entity_type === "session_transcript");

    if (entities.length === 0) {
      // The source is known here — name it rather than guessing. A non-harness
      // export (chatgpt, slack, …) has no resumable session by design.
      const source = result.conversations[0]?.source;
      const expected = source !== undefined && !HARNESS_SOURCES.has(source);
      return {
        entities,
        contentHash,
        reason: expected
          ? `non-harness source (${source}) — no resumable session`
          : "no session identity derived",
        kind: expected ? "expected" : "unexpected",
      };
    }
    return { entities, contentHash };
  } catch (err) {
    return {
      entities: [],
      reason: `parse failed: ${(err as Error).message}`,
      kind: "unexpected",
    };
  }
}

/** Discover and (optionally) import transcript files from known harness locations. */
export async function runTranscriptImport(
  options: TranscriptImportOptions
): Promise<TranscriptImportResult> {
  const { harness, limit, dryRun = true, api, userId } = options;

  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (!homeDir) {
    process.stderr.write(
      "[onboarding] Cannot determine home directory; skipping transcript import.\n"
    );
    return {
      harnesses_scanned: 0,
      files_found: 0,
      files_stored: 0,
      files_skipped: 0,
      errors: [],
      session_identity_degraded: [],
    };
  }

  const { discoverHarnessTranscripts } = await import("./discovery.js");
  const summaries = await discoverHarnessTranscripts(homeDir);

  const relevant = harness ? summaries.filter((s) => s.harness === harness) : summaries;

  if (relevant.length === 0) {
    const label = harness ? `harness "${harness}"` : "any harness";
    process.stdout.write(`[onboarding] No transcript files found for ${label}.\n`);
    // A zero match is ambiguous without saying where we looked — name the
    // scanned locations so the reader can tell "nothing there" from
    // "looked in the wrong place".
    process.stdout.write(
      `[onboarding] hint: scanned ~/.claude/projects/ (claude-code), ` +
        `~/.codex/sessions/ + ~/.codex/archived_sessions/ (codex), ` +
        `~/.cursor/chats/ (cursor). ` +
        `If your transcripts live elsewhere, they are not discovered automatically.\n`
    );
    return {
      harnesses_scanned: relevant.length,
      files_found: 0,
      files_stored: 0,
      files_skipped: 0,
      errors: [],
      session_identity_degraded: [],
    };
  }

  // Report what discovery actually saw before importing anything. Codex keeps
  // live sessions and archived ones in different trees, so a single count hides
  // which shape matched — that distinction is the whole point of #2072.
  for (const summary of relevant) {
    const live = summary.paths.filter((p) => p.includes("/.codex/sessions/")).length;
    const archived = summary.paths.filter((p) => p.includes("/.codex/archived_sessions/")).length;
    const split =
      summary.harness === "codex" && (live > 0 || archived > 0)
        ? ` (${live} live, ${archived} archived)`
        : "";
    process.stdout.write(
      `[onboarding] scan: ${summary.harness} — ${summary.fileCount} transcript(s)${split}\n`
    );
  }

  let totalFilesFound = 0;
  let totalFilesStored = 0;
  let totalFilesSkipped = 0;
  const errors: Array<{ file: string; error: string }> = [];
  const sessionIdentityDegraded: Array<{
    file: string;
    reason: string;
    kind: "expected" | "unexpected";
  }> = [];

  for (const summary of relevant) {
    // Apply per-harness file limit (most recently modified first).
    let files = summary.paths;
    if (limit && limit > 0) {
      const withMtime = await Promise.all(
        files.map(async (f) => {
          try {
            const s = await stat(f);
            return { path: f, mtime: s.mtime.getTime() };
          } catch {
            return { path: f, mtime: 0 };
          }
        })
      );
      withMtime.sort((a, b) => b.mtime - a.mtime);
      files = withMtime.slice(0, limit).map((x) => x.path);
    }

    totalFilesFound += files.length;

    if (dryRun) {
      process.stdout.write(
        `[onboarding][dry-run] ${summary.harness}: ${files.length} file(s) would be imported.\n`
      );
      for (const f of files) {
        process.stdout.write(`  ${f}\n`);
      }
      totalFilesSkipped += files.length;
      continue;
    }

    process.stdout.write(`[onboarding] ${summary.harness}: importing ${files.length} file(s)...\n`);

    for (const filePath of files) {
      try {
        const body: Record<string, unknown> = {
          file_path: filePath,
          observation_source: "import",
        };
        if (userId) body.user_id = userId;

        // Alongside the raw file, derive the session-identity rows
        // (agent_session + session_transcript). These carry cwd, native session
        // id, and a content hash — without them a stored transcript cannot be
        // located or re-materialized on another machine.
        const derived = await deriveSessionEntities(filePath);
        if (derived.entities.length > 0) {
          body.entities = derived.entities;
          // Attaching `entities` upgrades /store to the structured path, which
          // REQUIRES idempotency_key -- without it the whole call is rejected
          // 400 and the raw file is not stored either. Key on content_hash so a
          // re-import of identical bytes is idempotent by construction.
          body.idempotency_key = `transcript-import-${derived.contentHash ?? filePath}`;
        } else {
          const reason = derived.reason ?? "unknown";
          const kind = derived.kind ?? "unexpected";
          sessionIdentityDegraded.push({ file: filePath, reason, kind });
          process.stderr.write(`  [warn] no session identity for ${filePath}: ${reason}\n`);
        }

        const { error } = await (api as any).POST("/store", { body });
        if (error) {
          const msg =
            typeof error === "object" && error !== null && "message" in error
              ? String((error as { message: string }).message)
              : JSON.stringify(error);
          errors.push({ file: filePath, error: msg });
          totalFilesSkipped += 1;
          process.stderr.write(`  [error] ${filePath}: ${msg}\n`);
        } else {
          totalFilesStored += 1;
          process.stdout.write(`  [stored] ${filePath}\n`);
        }
      } catch (err) {
        const msg = (err as Error).message;
        errors.push({ file: filePath, error: msg });
        totalFilesSkipped += 1;
        process.stderr.write(`  [error] ${filePath}: ${msg}\n`);
      }
    }
  }

  process.stdout.write(
    `[onboarding] Transcript import ${dryRun ? "(dry-run) " : ""}complete: ` +
      `${totalFilesFound} found, ${totalFilesStored} stored, ` +
      `${totalFilesSkipped} skipped, ${errors.length} error(s).\n`
  );
  const unexpectedDegraded = sessionIdentityDegraded.filter((d) => d.kind === "unexpected");
  const expectedDegraded = sessionIdentityDegraded.length - unexpectedDegraded.length;
  if (expectedDegraded > 0) {
    process.stdout.write(
      `[onboarding] ${expectedDegraded} file(s) stored without session identity ` +
        `— non-harness sources have no resumable session by design.\n`
    );
  }
  if (unexpectedDegraded.length > 0) {
    process.stdout.write(
      `[onboarding] ${unexpectedDegraded.length} file(s) stored WITHOUT session identity ` +
        `— those transcripts are not resumable. Re-run after a parser fix to backfill.\n`
    );
  }
  if (dryRun && totalFilesFound > 0) {
    process.stdout.write(`[onboarding] Re-run with --apply to store the discovered transcripts.\n`);
  }

  return {
    harnesses_scanned: relevant.length,
    files_found: totalFilesFound,
    files_stored: totalFilesStored,
    files_skipped: totalFilesSkipped,
    errors,
    session_identity_degraded: sessionIdentityDegraded,
  };
}
