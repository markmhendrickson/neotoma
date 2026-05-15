#!/usr/bin/env tsx
/**
 * Backfill harness transcripts (Claude Code, Codex, Cursor) into Neotoma.
 *
 * Usage:
 *   tsx scripts/backfill_harness_transcripts.ts [--harness claude-code|codex|cursor] [--dry-run] [--limit N]
 *
 * Each file is stored idempotently using a hash of its path as the idempotency key.
 * Re-running is safe; already-imported files are skipped by the server.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { parseTranscript, conversationsToEntities } from "../src/cli/transcript_parser.js";
import { discoverHarnessTranscripts } from "../src/cli/discovery.js";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const harnessArg = args.includes("--harness") ? args[args.indexOf("--harness") + 1] : null;
const dryRun = args.includes("--dry-run");
const limitArg = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : null;
const verbose = args.includes("--verbose");

const ALL_HARNESSES = ["claude-code", "codex", "cursor"] as const;
type Harness = typeof ALL_HARNESSES[number];

const targetHarnesses: Harness[] = harnessArg
  ? [harnessArg as Harness]
  : [...ALL_HARNESSES];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function idempotencyKey(filePath: string): string {
  return "backfill-transcript-" + createHash("sha256").update(filePath).digest("hex").slice(0, 16);
}

// Path to tsx (for running neotoma store) — use the one in node_modules
const TSX = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "..", "node_modules", ".bin", "tsx");
const CLI = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "..", "src", "cli", "index.ts");

async function storeEntities(entities: Record<string, unknown>[], filePath: string): Promise<boolean> {
  if (entities.length === 0) return true;

  const tmpFile = path.join(os.tmpdir(), `neotoma-backfill-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    await fs.writeFile(tmpFile, JSON.stringify(entities, null, 2));
    const ikey = idempotencyKey(filePath);

    if (dryRun) {
      console.log(`  [dry-run] Would store ${entities.length} entities (idempotency: ${ikey})`);
      return true;
    }

    execFileSync(TSX, [
      CLI,
      "store",
      "--file", tmpFile,
      "--observation-source", "import",
      "--idempotency-key", ikey,
      "--no-log-file",
    ], { stdio: verbose ? "inherit" : "pipe" });

    return true;
  } catch (err: any) {
    if (verbose) console.error(`  Error storing ${path.basename(filePath)}:`, err.message ?? err);
    return false;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Per-harness backfill
// ---------------------------------------------------------------------------

async function backfillFiles(
  files: string[],
  source: "claude-code" | "codex" | "cursor",
  label: string,
): Promise<{ ok: number; skipped: number; failed: number }> {
  let ok = 0, skipped = 0, failed = 0;

  const toProcess = limitArg ? files.slice(0, limitArg) : files;
  const total = toProcess.length;

  console.log(`\n${label}: processing ${total} file${total === 1 ? "" : "s"}${dryRun ? " (dry-run)" : ""}...`);

  for (let i = 0; i < toProcess.length; i++) {
    const f = toProcess[i];
    const display = f.replace(os.homedir(), "~");
    process.stdout.write(`  [${i + 1}/${total}] ${display} ... `);

    let result: Awaited<ReturnType<typeof parseTranscript>>;
    try {
      result = await parseTranscript({ filePath: f, source });
    } catch (err: any) {
      process.stdout.write(`parse error\n`);
      if (verbose) console.error("   ", err.message ?? err);
      failed++;
      continue;
    }

    if (result.conversations.length === 0) {
      process.stdout.write(`empty\n`);
      skipped++;
      continue;
    }

    const entities = conversationsToEntities(result.conversations);
    const stored = await storeEntities(entities, f);

    if (stored) {
      process.stdout.write(`ok (${result.conversations.length} conv, ${result.totalMessages} msgs)\n`);
      ok++;
    } else {
      process.stdout.write(`store failed\n`);
      failed++;
    }
  }

  return { ok, skipped, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const homeDir = os.homedir();

  console.log("Discovering harness transcript files...");
  const summaries = await discoverHarnessTranscripts(homeDir);

  if (summaries.length === 0) {
    console.log("No harness transcript files found.");
    return;
  }

  let totalOk = 0, totalSkipped = 0, totalFailed = 0;

  for (const harness of targetHarnesses) {
    const summary = summaries.find((s) => s.harness === harness);
    if (!summary) {
      console.log(`\n${harness}: no files found, skipping.`);
      continue;
    }

    const { ok, skipped, failed } = await backfillFiles(
      summary.paths,
      harness,
      harness,
    );

    totalOk += ok;
    totalSkipped += skipped;
    totalFailed += failed;
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Backfill complete: ${totalOk} stored, ${totalSkipped} skipped (empty), ${totalFailed} failed`);
  if (dryRun) console.log("(dry-run — nothing was actually stored)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
