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
 * Parent / transcript linking (arch review PR #1743):
 * Two-pass ingestion — store all top-level sessions first, build a
 * `native_session_id → entity_id` map from store JSON responses, then store
 * sub-agents with `parent_session_id` set to the parent's **entity_id** and a
 * typed PART_OF relationship (`source_index` → `target_entity_id`). Within a
 * single session store, `[session, transcript]` is written together with
 * `relationships: [{ PART_OF, source_index: 1, target_index: 0 }]`; after the
 * store response yields the session entity_id, a follow-up observation sets
 * `session_transcript.agent_session_id` to that entity_id (FK is entity_id,
 * not the harness-scoped native id — joint identity is [harness, native_session_id]).
 *
 * Usage:
 *   tsx scripts/ingest_agent_sessions.ts [--dry-run] [--limit N] [--base-url URL] [--verbose]
 */

import fs from "node:fs/promises";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
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

const REPO_ROOT = path.join(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  ".."
);
const TSX = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const CLI = path.join(REPO_ROOT, "src", "cli", "index.ts");
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const READ_BYTES = 500_000; // head window for metadata; enough for cwd + swarm marker
const HARNESS = "claude-code";

function loadEnvFile(envPath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      vars[t.slice(0, eq).trim()] = t
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
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

export interface SessionRecord {
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
  /** Parent agent_session entity_id once resolved; null for top-level. */
  parent_session_id: string | null;
  /** Internal: parent native id before entity_id resolution (not stored). */
  _parentNativeSessionId: string | null;
  _contentHash: string; // internal: idempotency + transcript content link, not stored
  _filePath: string; // internal: source path for blob upload, not stored
  _fileSize: number; // internal, not stored
}

export interface StoreEnvelope {
  entities: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
}

/** Recursively collect transcript files: top-level sessions and nested sub-agents. */
export async function collectTranscripts(
  projectsDir: string = PROJECTS_DIR
): Promise<{ topLevel: string[]; subAgents: string[] }> {
  const topLevel: string[] = [];
  const subAgents: string[] = [];
  let projectDirs: string[];
  try {
    projectDirs = (await fs.readdir(projectsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => path.join(projectsDir, d.name));
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

export function contentHashOf(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Extract runtime/resume metadata from a transcript. cwd / gitBranch / model
 * live on message rows, not the leading hook/summary event — reading only
 * line 1 leaves cwd null on ~91% of real transcripts.
 */
export function extractMetadata(
  filePath: string,
  kind: string,
  parentNativeSessionId: string | null,
  fileContents?: Buffer
): SessionRecord {
  const buf = fileContents ?? readFileSync(filePath);
  const contentHash = contentHashOf(buf);
  const head = buf.subarray(0, READ_BYTES).toString("utf-8");
  const isSwarm = head.includes("ateles-swarm");

  let cwd: string | null = null;
  let created: string | null = null;
  let gitBranch: string | null = null;
  let model: string | null = null;
  let messageCount = 0;

  for (const line of head.split("\n")) {
    if (!line) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!created && typeof o.timestamp === "string") created = o.timestamp;
    if (!cwd && typeof o.cwd === "string") cwd = o.cwd;
    if (!gitBranch && typeof o.gitBranch === "string") gitBranch = o.gitBranch;
    const message = o.message as { model?: string } | undefined;
    if (!model && message?.model) model = message.model;
    if (o.type === "user" || o.type === "assistant") messageCount++;
  }

  const worktree = cwd && cwd.includes("/.claude/worktrees/") ? cwd : null;
  const repo = cwd && cwd.includes("/repos/") ? cwd.split("/repos/")[1].split("/")[0] : null;
  const resolvedKind = kind === "subagent" ? "subagent" : isSwarm ? "autonomous" : "interactive";

  return {
    entity_type: "agent_session",
    harness: HARNESS,
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
    last_activity_at: null,
    parent_session_id: null, // filled with entity_id after parent pass
    _parentNativeSessionId: parentNativeSessionId,
    _contentHash: contentHash,
    _filePath: filePath,
    _fileSize: buf.length,
  };
}

export function idempotencyKey(rec: SessionRecord): string {
  // v2: payload now includes entity_id FKs + PART_OF relationships. Bumping the
  // key namespace avoids ERR_IDEMPOTENCY_MISMATCH against pre-fix v1 ingests
  // that used the same content hash but a different entity/relationship shape.
  return `agent-session-v2-${rec.native_session_id}-${rec._contentHash.slice(0, 12)}`;
}

export function transcriptIdempotencyKey(contentHash: string): string {
  return `transcript-${contentHash.slice(0, 16)}`;
}

/**
 * Build the store envelope for [session, transcript].
 * `sessionEntityId` — when known (re-ingest), set as transcript.agent_session_id.
 * `parentEntityId` — parent agent_session entity_id for sub-agents.
 */
export function buildStoreEnvelope(
  rec: SessionRecord,
  opts: { sessionEntityId?: string | null; parentEntityId?: string | null } = {}
): StoreEnvelope {
  const {
    _contentHash,
    _filePath: _fp,
    _fileSize,
    _parentNativeSessionId: _p,
    ...sessionFields
  } = rec;
  const session: Record<string, unknown> = {
    ...sessionFields,
    parent_session_id: opts.parentEntityId ?? null,
  };

  const transcript: Record<string, unknown> = {
    entity_type: "session_transcript",
    content_hash: _contentHash,
    file_size: _fileSize,
    mime_type: "application/jsonl",
    harness: HARNESS,
    format: "claude_code_jsonl",
    transcript_kind: rec.kind === "subagent" ? "subagent" : "main",
    // Prefer entity_id when known; null on first write until follow-up fill.
    agent_session_id: opts.sessionEntityId ?? null,
  };

  const relationships: Array<Record<string, unknown>> = [
    // transcript PART_OF session (same-request index pair)
    { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
  ];
  if (opts.parentEntityId) {
    // sub-agent session PART_OF parent session (cross-request target id)
    relationships.push({
      relationship_type: "PART_OF",
      source_index: 0,
      target_entity_id: opts.parentEntityId,
    });
  }

  return { entities: [session, transcript], relationships };
}

/** Parse `neotoma store --json` stdout for the agent_session entity_id. */
export function parseSessionEntityIdFromStoreOutput(stdout: string): string | null {
  try {
    const data = JSON.parse(stdout) as {
      entities?: Array<{ entity_id?: string; id?: string; entity_type?: string }>;
      entities_created?: Array<{ id?: string }>;
    };
    const typed = (data.entities ?? []).find((e) => e.entity_type === "agent_session");
    if (typed?.entity_id) return typed.entity_id;
    if (typed?.id) return typed.id;
    const first =
      data.entities_created?.[0]?.id ?? data.entities?.[0]?.entity_id ?? data.entities?.[0]?.id;
    return typeof first === "string" && first.length > 0 ? first : null;
  } catch {
    // Pretty mode or mixed stderr: scan for ent_ tokens near agent_session.
    const m = stdout.match(/ent_[a-f0-9]{16,}/);
    return m ? m[0] : null;
  }
}

/**
 * Store the raw transcript bytes content-addressed in the sources bucket via the
 * in-process storeRawContent path (`neotoma upload --local`). Best-effort: the
 * session_transcript entity links to the bytes by content_hash, so a failed
 * upload still leaves a valid (if blob-less) index entry to retry later.
 */
export function uploadTranscriptBlob(rec: SessionRecord): boolean {
  try {
    execFileSync(
      TSX,
      [
        CLI,
        "upload",
        rec._filePath,
        "--local",
        "--idempotency-key",
        transcriptIdempotencyKey(rec._contentHash),
        "--mime-type",
        "application/jsonl",
        "--json",
      ],
      { stdio: verbose ? "inherit" : "pipe", encoding: "utf-8", env: childEnv }
    );
    return true;
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    if (verbose)
      console.error(`  blob upload failed ${rec.native_session_id}:`, e.stderr ?? e.message ?? err);
    return false;
  }
}

function runStore(envelope: StoreEnvelope, key: string): { ok: boolean; stdout: string } {
  const tmp = path.join(os.tmpdir(), `neotoma-agent-session-${key}.json`);
  try {
    writeFileSync(tmp, JSON.stringify(envelope, null, 2));
    if (dryRun) return { ok: true, stdout: "{}" };
    const stdout = execFileSync(
      TSX,
      [
        CLI,
        "store",
        "--file",
        tmp,
        "--observation-source",
        "import",
        "--idempotency-key",
        key,
        "--base-url",
        baseUrl,
        "--no-log-file",
        "--json",
      ],
      { stdio: ["pipe", "pipe", verbose ? "inherit" : "pipe"], encoding: "utf-8", env: childEnv }
    );
    return { ok: true, stdout: typeof stdout === "string" ? stdout : String(stdout) };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string; stdout?: string };
    if (verbose) console.error(`  store failed ${key}:`, e.stderr ?? e.message ?? err);
    return { ok: false, stdout: e.stdout ?? "" };
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fill session_transcript.agent_session_id with the session entity_id after the
 * initial store (same content_hash identity → merges onto the transcript row).
 * Returns false if the follow-up store fails (caller should treat as failed).
 */
function fillTranscriptSessionFk(contentHash: string, sessionEntityId: string): boolean {
  if (dryRun) return true;
  const envelope: StoreEnvelope = {
    entities: [
      {
        entity_type: "session_transcript",
        content_hash: contentHash,
        agent_session_id: sessionEntityId,
      },
    ],
    relationships: [
      {
        relationship_type: "PART_OF",
        source_index: 0,
        target_entity_id: sessionEntityId,
      },
    ],
  };
  return runStore(envelope, `agent-session-fk-v2-${contentHash.slice(0, 12)}`).ok;
}

export async function storeOne(
  rec: SessionRecord,
  sessionEntityIds: Map<string, string>
): Promise<"ok" | "failed"> {
  const parentEntityId =
    rec._parentNativeSessionId != null
      ? (sessionEntityIds.get(rec._parentNativeSessionId) ?? null)
      : null;

  if (rec._parentNativeSessionId && !parentEntityId && verbose) {
    console.error(
      `  parent entity_id unresolved for native_session_id=${rec._parentNativeSessionId} ` +
        `(harness=${HARNESS}); storing sub-agent without parent PART_OF edge`
    );
  }

  const envelope = buildStoreEnvelope(rec, {
    parentEntityId,
    sessionEntityId: sessionEntityIds.get(rec.native_session_id) ?? null,
  });

  if (dryRun) return "ok";
  uploadTranscriptBlob(rec);
  const { ok, stdout } = runStore(envelope, idempotencyKey(rec));
  if (!ok) return "failed";

  const sessionEntityId = parseSessionEntityIdFromStoreOutput(stdout);
  if (sessionEntityId) {
    sessionEntityIds.set(rec.native_session_id, sessionEntityId);
    // Ensure denormalized FK holds entity_id (not native id).
    if (!envelope.entities[1]?.agent_session_id) {
      if (!fillTranscriptSessionFk(rec._contentHash, sessionEntityId)) {
        if (verbose) {
          console.error(
            `  FK fill failed for transcript content_hash=${rec._contentHash.slice(0, 12)} ` +
              `session=${sessionEntityId}`
          );
        }
        return "failed";
      }
    }
  } else if (verbose) {
    console.error(
      `  could not parse session entity_id from store output for ${rec.native_session_id}`
    );
  }
  return "ok";
}

async function main() {
  const { topLevel, subAgents } = await collectTranscripts();
  const parentOf = (subPath: string) => path.basename(path.dirname(path.dirname(subPath)));

  // Two-pass: top-level first so sub-agent parent entity_ids resolve.
  let topItems = topLevel.map((f) => ({ file: f, kind: "auto", parent: null as string | null }));
  let subItems = subAgents.map((f) => ({
    file: f,
    kind: "subagent",
    parent: parentOf(f) as string | null,
  }));
  if (limitArg) {
    const combined = [...topItems, ...subItems].slice(0, limitArg);
    topItems = combined.filter((i) => i.kind !== "subagent");
    subItems = combined.filter((i) => i.kind === "subagent");
  }

  const total = topItems.length + subItems.length;
  console.log(
    `Found ${topLevel.length} sessions + ${subAgents.length} sub-agents. ` +
      `Ingesting ${total}${dryRun ? " (dry-run)" : ""} -> ${baseUrl} (two-pass parent linking)`
  );

  const sessionEntityIds = new Map<string, string>();
  const counts = { ok: 0, failed: 0 };
  const byKind: Record<string, number> = {};

  async function ingestItem(
    item: { file: string; kind: string; parent: string | null },
    index: number
  ) {
    let rec: SessionRecord;
    try {
      rec = extractMetadata(item.file, item.kind, item.parent);
      rec.last_activity_at = (await fs.stat(item.file)).mtime.toISOString();
    } catch (err: unknown) {
      counts.failed++;
      if (verbose) console.error(`  read failed ${item.file}:`, (err as Error).message ?? err);
      return;
    }
    byKind[rec.kind] = (byKind[rec.kind] ?? 0) + 1;
    const res = await storeOne(rec, sessionEntityIds);
    counts[res]++;
    if (verbose || (index + 1) % 100 === 0) {
      console.log(
        `  [${index + 1}/${total}] ${rec.native_session_id} kind=${rec.kind} repo=${rec.repo ?? "-"}`
      );
    }
  }

  let i = 0;
  for (const item of topItems) {
    await ingestItem(item, i++);
  }
  for (const item of subItems) {
    await ingestItem(item, i++);
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Ingest complete: ${counts.ok} ok, ${counts.failed} failed. By kind:`, byKind);
  if (dryRun) console.log("(dry-run - nothing stored)");
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("ingest_agent_sessions.ts") ||
    process.argv[1].endsWith("ingest_agent_sessions.js"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
