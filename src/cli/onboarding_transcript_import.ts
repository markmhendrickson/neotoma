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
    };
  }

  const { discoverHarnessTranscripts } = await import("./discovery.js");
  const summaries = await discoverHarnessTranscripts(homeDir);

  const relevant = harness
    ? summaries.filter((s) => s.harness === harness)
    : summaries;

  if (relevant.length === 0) {
    const label = harness ? `harness "${harness}"` : "any harness";
    process.stdout.write(
      `[onboarding] No transcript files found for ${label}.\n`
    );
    return {
      harnesses_scanned: relevant.length,
      files_found: 0,
      files_stored: 0,
      files_skipped: 0,
      errors: [],
    };
  }

  let totalFilesFound = 0;
  let totalFilesStored = 0;
  let totalFilesSkipped = 0;
  const errors: Array<{ file: string; error: string }> = [];

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

    process.stdout.write(
      `[onboarding] ${summary.harness}: importing ${files.length} file(s)...\n`
    );

    for (const filePath of files) {
      try {
        const body: Record<string, unknown> = {
          file_path: filePath,
          observation_source: "import",
        };
        if (userId) body.user_id = userId;

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
  if (dryRun && totalFilesFound > 0) {
    process.stdout.write(
      `[onboarding] Re-run with --apply to store the discovered transcripts.\n`
    );
  }

  return {
    harnesses_scanned: relevant.length,
    files_found: totalFilesFound,
    files_stored: totalFilesStored,
    files_skipped: totalFilesSkipped,
    errors,
  };
}
