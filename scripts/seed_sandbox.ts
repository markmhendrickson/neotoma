#!/usr/bin/env tsx
/**
 * Seed the public sandbox deployment at `sandbox.neotoma.io` with a mix of
 * reused fixtures and synthetic conversation / public-domain content. Driven
 * by `tests/fixtures/sandbox/manifest.json` so the dataset is defined in one
 * place and can be audited independently of seeding code.
 *
 * Runs against a live Neotoma API over HTTP (the same surface visitors use),
 * so observations, timeline events, and the Agents directory populate
 * realistically. Four synthetic agent identities rotate through submissions
 * via X-Client-Name / X-Client-Version / X-Connection-Id headers so the
 * `/agents` page shows diversity.
 *
 * Usage:
 *   tsx scripts/seed_sandbox.ts [--base-url http://localhost:3180] [--dry-run]
 *
 * Environment:
 *   NEOTOMA_SANDBOX_BASE_URL   Same effect as --base-url. Default http://localhost:3180.
 *   NEOTOMA_SANDBOX_BEARER     Optional Bearer token (only needed when the target
 *                              is running without NEOTOMA_SANDBOX_MODE=1).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface SandboxAgentIdentity {
  agent_sub: string;
  client_name: string;
  client_version: string;
  label: string;
}

export interface SandboxEntityBatch {
  agent_index: number;
  idempotency_prefix: string;
  fixture: string;
  entity_type_override?: string;
  note?: string;
}

export interface SandboxUnstructuredSource {
  agent_index: number;
  fixture_path: string;
  mime_type: string;
  original_filename: string;
  note?: string;
}

export interface SandboxManifest {
  schema_version: string;
  description: string;
  agent_identities: SandboxAgentIdentity[];
  entity_batches: SandboxEntityBatch[];
  unstructured_sources: SandboxUnstructuredSource[];
  excluded_fixtures: string[];
}

export interface SeedOptions {
  baseUrl: string;
  bearer?: string;
  dryRun?: boolean;
  repoRoot?: string;
  fetchImpl?: typeof fetch;
  logger?: (message: string) => void;
  /** Override manifest path (absolute). When set, loadManifest uses this instead of the default. */
  manifestPath?: string;
  /** Seed into a specific user_id (used by session-based seeding). */
  targetUserId?: string;
  /** Skip seeding entirely (returns zeroed result). */
  skipSeeding?: boolean;
}

export interface SeedResult {
  entity_batches_submitted: number;
  entities_planned: number;
  unstructured_sources_submitted: number;
  dry_run: boolean;
}

export const SANDBOX_MANIFEST_REL_PATH = "tests/fixtures/sandbox/manifest.json";

export async function loadManifest(repoRoot: string): Promise<SandboxManifest> {
  const manifestPath = path.join(repoRoot, SANDBOX_MANIFEST_REL_PATH);
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as SandboxManifest;
}

function inlineConversation(key: string): Record<string, unknown>[] {
  if (key === "conversation_chatgpt") {
    const convId = "conv-sandbox-chatgpt-1";
    return [
      {
        entity_type: "conversation",
        canonical_name: "Planning a weekend hike",
        title: "Planning a weekend hike",
        platform: "chatgpt",
        started_at: "2026-03-15T09:30:00Z",
        ended_at: "2026-03-15T10:12:00Z",
        turn_count: 5,
        idempotency_hint: convId,
      },
      {
        entity_type: "conversation_message",
        canonical_name: "hike-planning-msg-1",
        role: "user",
        sender_kind: "user",
        content: "I want to plan a weekend hike under 10km with a view at the top.",
        turn_key: `${convId}:turn:1`,
        timestamp: "2026-03-15T09:30:00Z",
      },
      {
        entity_type: "conversation_message",
        canonical_name: "hike-planning-msg-2",
        role: "assistant",
        sender_kind: "assistant",
        content: "Three solid candidates: Cedar Ridge, Hollow Creek, Painted Bluff.",
        turn_key: `${convId}:turn:2`,
        timestamp: "2026-03-15T09:30:30Z",
      },
    ];
  }
  if (key === "conversation_claude") {
    const convId = "conv-sandbox-claude-1";
    return [
      {
        entity_type: "conversation",
        canonical_name: "Sourdough crumb diagnosis",
        title: "Sourdough crumb diagnosis",
        platform: "claude",
        started_at: "2026-02-12T18:04:00Z",
        ended_at: "2026-02-12T18:07:05Z",
        turn_count: 5,
        idempotency_hint: convId,
      },
      {
        entity_type: "conversation_message",
        canonical_name: "sourdough-msg-1",
        role: "user",
        sender_kind: "user",
        content: "Crumb was too tight despite longer bulk.",
        turn_key: `${convId}:turn:1`,
        timestamp: "2026-02-12T18:04:00Z",
      },
      {
        entity_type: "conversation_message",
        canonical_name: "sourdough-msg-2",
        role: "assistant",
        sender_kind: "assistant",
        content: "Likely under-proofed final shape at 18C. Try a 2h final proof.",
        turn_key: `${convId}:turn:2`,
        timestamp: "2026-02-12T18:06:40Z",
      },
    ];
  }
  throw new Error(`Unknown inline fixture key: ${key}`);
}

async function resolveFixtureEntities(
  batch: SandboxEntityBatch,
  repoRoot: string,
): Promise<Record<string, unknown>[]> {
  if (batch.fixture.startsWith("inline://")) {
    const key = batch.fixture.slice("inline://".length);
    return inlineConversation(key);
  }
  if (batch.fixture.startsWith("reuse://")) {
    const relPath = batch.fixture.slice("reuse://".length);
    const fullPath = path.join(repoRoot, relPath);
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = JSON.parse(raw);
    const rows: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
    if (batch.entity_type_override) {
      return rows.map((row) => ({
        entity_type: batch.entity_type_override!,
        ...row,
      }));
    }
    return rows;
  }
  throw new Error(`Unsupported fixture scheme: ${batch.fixture}`);
}

function headersForAgent(agent: SandboxAgentIdentity, bearer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-client-name": agent.client_name,
    "x-client-version": agent.client_version,
    "x-connection-id": `sandbox-seed-${agent.agent_sub}`,
    "user-agent": `neotoma-sandbox-seed/1.0 (${agent.label})`,
  };
  if (bearer) headers["authorization"] = `Bearer ${bearer}`;
  return headers;
}

function stableIdempotencyKey(prefix: string, entityIndex: number): string {
  // Stable (non-random) so re-running the seeder is idempotent — the server
  // replays the existing source rather than creating duplicates.
  const hash = crypto
    .createHash("sha256")
    .update(`${prefix}:${entityIndex}`)
    .digest("hex")
    .slice(0, 12);
  return `${prefix}-${hash}`;
}

export async function seedSandbox(options: SeedOptions): Promise<SeedResult> {
  if (options.skipSeeding) {
    return {
      entity_batches_submitted: 0,
      entities_planned: 0,
      unstructured_sources_submitted: 0,
      dry_run: false,
    };
  }
  const logger = options.logger ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const fetchFn = options.fetchImpl ?? fetch;
  const repoRoot = options.repoRoot ?? process.cwd();
  const manifest = options.manifestPath
    ? (JSON.parse(await fs.readFile(options.manifestPath, "utf8")) as SandboxManifest)
    : await loadManifest(repoRoot);

  const baseUrl = options.baseUrl.replace(/\/$/, "");

  let entityBatchesSubmitted = 0;
  let entitiesPlanned = 0;
  let unstructuredSubmitted = 0;

  for (let i = 0; i < manifest.entity_batches.length; i++) {
    const batch = manifest.entity_batches[i];
    const agent = manifest.agent_identities[batch.agent_index];
    if (!agent) {
      throw new Error(
        `Batch ${i} (${batch.idempotency_prefix}) references agent_index ${batch.agent_index}, which is out of range`,
      );
    }
    const entities = await resolveFixtureEntities(batch, repoRoot);
    entitiesPlanned += entities.length;

    if (options.dryRun) {
      logger(
        `[dry-run] batch ${batch.idempotency_prefix} — ${entities.length} entities as ${agent.client_name}`,
      );
      entityBatchesSubmitted++;
      continue;
    }

    const idempotencyKey = stableIdempotencyKey(batch.idempotency_prefix, i);
    const body = JSON.stringify({
      entities,
      idempotency_key: idempotencyKey,
      source_priority: 80,
    });

    const res = await fetchFn(`${baseUrl}/store`, {
      method: "POST",
      headers: headersForAgent(agent, options.bearer),
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `seed batch ${batch.idempotency_prefix} failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }
    entityBatchesSubmitted++;
    logger(`seeded batch ${batch.idempotency_prefix} (${entities.length} entities)`);
  }

  for (const source of manifest.unstructured_sources) {
    const agent = manifest.agent_identities[source.agent_index];
    if (!agent) {
      throw new Error(
        `Unstructured source for ${source.fixture_path} references agent_index ${source.agent_index} (out of range)`,
      );
    }

    if (options.dryRun) {
      logger(`[dry-run] unstructured source ${source.fixture_path}`);
      unstructuredSubmitted++;
      continue;
    }

    const abs = path.join(repoRoot, source.fixture_path);
    const buf = await fs.readFile(abs);
    const base64 = buf.toString("base64");
    const body = JSON.stringify({
      file_content: base64,
      mime_type: source.mime_type,
      original_filename: source.original_filename,
      idempotency_key: stableIdempotencyKey(
        `sandbox-seed-unstructured-${source.original_filename}`,
        0,
      ),
    });

    const res = await fetchFn(`${baseUrl}/store/unstructured`, {
      method: "POST",
      headers: headersForAgent(agent, options.bearer),
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Non-fatal for seeding — we log and continue so one bad fixture
      // doesn't blow up the whole reset.
      logger(
        `WARN: unstructured source ${source.fixture_path} failed (${res.status}): ${text.slice(0, 200)}`,
      );
      continue;
    }
    unstructuredSubmitted++;
    logger(`seeded unstructured source ${source.original_filename}`);
  }

  return {
    entity_batches_submitted: entityBatchesSubmitted,
    entities_planned: entitiesPlanned,
    unstructured_sources_submitted: unstructuredSubmitted,
    dry_run: options.dryRun === true,
  };
}

function parseArgs(argv: string[]): { baseUrl: string; dryRun: boolean } {
  let baseUrl =
    process.env.NEOTOMA_SANDBOX_BASE_URL?.trim() || "http://localhost:3180";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url" && argv[i + 1]) {
      baseUrl = argv[i + 1];
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }
  return { baseUrl, dryRun };
}

async function main(): Promise<void> {
  const { baseUrl, dryRun } = parseArgs(process.argv.slice(2));
  const bearer = process.env.NEOTOMA_SANDBOX_BEARER?.trim() || undefined;
  const result = await seedSandbox({ baseUrl, bearer, dryRun });
  process.stdout.write(
    JSON.stringify({ ok: true, base_url: baseUrl, ...result }, null, 2) + "\n",
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[seed_sandbox] ${(err as Error).message}\n`);
    process.exit(1);
  });
}
