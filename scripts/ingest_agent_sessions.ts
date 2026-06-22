#!/usr/bin/env tsx
/**
 * Ingest agent_session index entities from Claude Code transcripts.
 *
 * Walks ~/.claude/projects, extracts the runtime/resume metadata the existing
 * transcript parser does not surface (cwd, git branch, model, kind), and stores
 * one agent_session per session via the `neotoma store` CLI (same idempotent path
 * as backfill_harness_transcripts.ts). Top-level sessions and Task sub-agent
 * transcripts are both ingested; sub-agents are linked via parent_session_id.
 *
 * Each session emits an agent_session plus a session_transcript (linked by
 * content_hash) and stores the raw transcript bytes content-addressed via
 * `neotoma upload --local`.
 *
 * Usage:
 *   tsx scripts/ingest_agent_sessions.ts [--dry-run] [--limit N] [--base-url URL] [--verbose]
 */

import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const limitArg = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : null;
const baseUrl =
  (args.includes("--base-url") ? args[args.indexOf("--base-url") + 1] : null) ??
  process.env.NEOTOMA_BASE_URL ??
  "http://localhost:3180";

const REPO_ROOT = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "..");
const TSX = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const CLI = path.join(REPO_ROOT, "src", "cli", "index.ts");
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const READ_BYTES = 500_000; // head window for metadata; enough for cwd + swarm marker

function loadEnvFile(envPath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* env file optional */
  }
  return vars;
}

const prodEnv = loadEnvFile(path.join(REPO_ROOT, ".env.production"));
const childEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...(prodEnv.NEOTOMA_BEARER_TOKEN ? { NEOTOMA_BEARER_TOKEN: prodEnv.NEOTOMA_BEARER_TOKEN } : {}),
};

interface SessionRecord {
  entity_type: "agent_session";
  harness: string;
  native_session_id: string;
  kind: string;
  cwd: string | null;
  repo: string | null;
  source_branch: string | null;
  branch: string | null;
  worktree_path: string | null;
  model: string | null;
  message_count: number;
  created_at: string | null;
  last_activity_at: string | null;
  parent_session_id: string | null;
  _contentHash: string; // internal: idempotency + transcript content link, not stored
  _filePath: string; // internal: source path for blob upload, not stored
  _fileSize: number; // internal, not stored
}

/** Recursively collect transcript files: top-level sessions and nested sub-agents. */
async function collectTranscripts(): Promise<{ topLevel: string[]; subAgents: string[] }> {
  const topLevel: string[] = [];
  const subAgents: string[] = [];
  let projectDirs: string[];
  try {
    projectDirs = (await fs.readdir(PROJECTS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => path.join(PROJECTS_DIR, d.name));
  } catch {
    return { topLevel, subAgents };
  }
  for (const dir of projectDirs) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.endsWith(".jsonl")) {
        topLevel.push(full);
      } else if (e.isDirectory()) {
        const subDir = path.join(full, "subagents");
        try {
          for (const s of await fs.readdir(subDir)) {
            if (s.endsWith(".jsonl")) subAgents.push(path.join(subDir, s));
          }
        } catch {
          /* no subagents dir */
        }
      }
    }
  }
  return { topLevel, subAgents };
}

function extractMetadata(
  filePath: string,
  kind: string,
  parentSessionId: string | null,
): SessionRecord {
  const buf = readFileSync(filePath);
  const contentHash = createHash("sha256").update(buf).digest("hex");
  const head = buf.subarray(0, READ_BYTES).toString("utf-8");
  const isSwarm = head.includes("ateles-swarm");

  let cwd: string | null = null;
  let created: string | null = null;
  let gitBranch: string | null = null;
  let model: string | null = null;
  let messageCount = 0;

  // Read message lines, not line one: cwd/gitBranch live on message rows, not the
  // leading hook/summary event. Validated: line-one-only leaves cwd null on ~91%.
  for (const line of head.split("\n")) {
    if (!line) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!created && o.timestamp) created = o.timestamp;
    if (!cwd && o.cwd) cwd = o.cwd;
    if (!gitBranch && o.gitBranch) gitBranch = o.gitBranch;
    if (!model && o.message?.model) model = o.message.model;
    if (o.type === "user" || o.type === "assistant") messageCount++;
  }

  const worktree = cwd && cwd.includes("/.claude/worktrees/") ? cwd : null;
  const repo = cwd && cwd.includes("/repos/") ? cwd.split("/repos/")[1].split("/")[0] : null;
  const resolvedKind = kind === "subagent" ? "subagent" : isSwarm ? "autonomous" : "interactive";

  return {
    entity_type: "agent_session",
    harness: "claude_code",
    native_session_id: path.basename(filePath, ".jsonl"),
    kind: resolvedKind,
    cwd,
    repo,
    source_branch: null,
    branch: gitBranch,
    worktree_path: worktree,
    model,
    message_count: messageCount,
    created_at: created,
    last_activity_at: null, // set from mtime below
    parent_session_id: parentSessionId,
    _contentHash: contentHash,
    _filePath: filePath,
    _fileSize: buf.length,
  };
}

function idempotencyKey(rec: SessionRecord): string {
  // Same content -> same key (server skips); changed content -> new observation
  // that merges onto the entity via its [harness, native_session_id] identity.
  return `agent-session-${rec.native_session_id}-${rec._contentHash.slice(0, 12)}`;
}

/**
 * Store the raw transcript bytes content-addressed in the sources bucket via the
 * in-process storeRawContent path (`neotoma upload --local`). Best-effort: the
 * session_transcript entity links to the bytes by content_hash, so a failed
 * upload still leaves a valid (if blob-less) index entry to retry later.
 */
function uploadTranscriptBlob(rec: SessionRecord): boolean {
  try {
    execFileSync(
      TSX,
      [CLI, "upload", rec._filePath, "--local",
        "--idempotency-key", `transcript-${rec._contentHash.slice(0, 16)}`,
        "--mime-type", "application/jsonl"],
      { stdio: verbose ? "inherit" : "pipe", encoding: "utf-8", env: childEnv },
    );
    return true;
  } catch (err: any) {
    if (verbose) console.error(`  blob upload failed ${rec.native_session_id}:`, err.stderr ?? err.message ?? err);
    return false;
  }
}

async function storeOne(rec: SessionRecord): Promise<"ok" | "failed"> {
  const { _contentHash, _filePath, _fileSize, ...session } = rec;
  // session_transcript links to the stored bytes by content_hash (same SHA-256
  // that storeRawContent computes), so source_id/storage_url need not be parsed.
  const transcript = {
    entity_type: "session_transcript",
    content_hash: _contentHash,
    file_size: _fileSize,
    mime_type: "application/jsonl",
    harness: "claude_code",
    format: "claude_code_jsonl",
    transcript_kind: rec.kind === "subagent" ? "subagent" : "main",
    agent_session_id: rec.native_session_id,
  };
  const tmp = path.join(os.tmpdir(), `neotoma-agent-session-${rec.native_session_id}.json`);
  try {
    await fs.writeFile(tmp, JSON.stringify([session, transcript], null, 2));
    if (dryRun) return "ok";
    uploadTranscriptBlob(rec); // best-effort: stores raw bytes keyed by content_hash
    execFileSync(
      TSX,
      [CLI, "store", "--file", tmp, "--observation-source", "import",
        "--idempotency-key", idempotencyKey(rec), "--base-url", baseUrl, "--no-log-file"],
      { stdio: verbose ? "inherit" : "pipe", encoding: "utf-8", env: childEnv },
    );
    return "ok";
  } catch (err: any) {
    if (verbose) console.error(`  store failed ${rec.native_session_id}:`, err.stderr ?? err.message ?? err);
    return "failed";
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

async function main() {
  const { topLevel, subAgents } = await collectTranscripts();
  const parentOf = (subPath: string) => path.basename(path.dirname(path.dirname(subPath)));

  let items: Array<{ file: string; kind: string; parent: string | null }> = [
    ...topLevel.map((f) => ({ file: f, kind: "auto", parent: null })),
    ...subAgents.map((f) => ({ file: f, kind: "subagent", parent: parentOf(f) })),
  ];
  if (limitArg) items = items.slice(0, limitArg);

  console.log(
    `Found ${topLevel.length} sessions + ${subAgents.length} sub-agents. ` +
      `Ingesting ${items.length}${dryRun ? " (dry-run)" : ""} -> ${baseUrl}`,
  );

  const counts = { ok: 0, failed: 0 };
  const byKind: Record<string, number> = {};
  for (let i = 0; i < items.length; i++) {
    const { file, kind, parent } = items[i];
    let rec: SessionRecord;
    try {
      rec = extractMetadata(file, kind, parent);
      rec.last_activity_at = (await fs.stat(file)).mtime.toISOString();
    } catch (err: any) {
      counts.failed++;
      if (verbose) console.error(`  read failed ${file}:`, err.message ?? err);
      continue;
    }
    byKind[rec.kind] = (byKind[rec.kind] ?? 0) + 1;
    const res = await storeOne(rec);
    counts[res]++;
    if (verbose || (i + 1) % 100 === 0) {
      console.log(`  [${i + 1}/${items.length}] ${rec.native_session_id} kind=${rec.kind} repo=${rec.repo ?? "-"}`);
    }
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Ingest complete: ${counts.ok} ok, ${counts.failed} failed. By kind:`, byKind);
  if (dryRun) console.log("(dry-run - nothing stored)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
