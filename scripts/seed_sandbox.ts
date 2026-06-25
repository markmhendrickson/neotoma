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
  /** Fixture reference (`reuse://` or `inline://`). Omit when `entities` is set. */
  fixture?: string;
  /**
   * Inline entity objects (showcase packs author the data directly in the
   * manifest). Each entity may carry a `_ref` string used by manifest-level
   * `relationships` to wire the graph; any `_`-prefixed key is stripped before
   * the entity is sent to /store.
   */
  entities?: Record<string, unknown>[];
  entity_type_override?: string;
  note?: string;
}

/**
 * Manifest-level relationship between two seeded entities, referenced by the
 * `_ref` handles assigned in entity_batches. Resolved to entity ids after all
 * batches are stored, then created via /create_relationships — this is what
 * populates the Relationships list and Graph Explorer.
 */
export interface SandboxRelationship {
  source_ref: string;
  target_ref: string;
  relationship_type: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxUnstructuredSource {
  agent_index: number;
  fixture_path: string;
  mime_type: string;
  original_filename: string;
  note?: string;
  /**
   * Optional entities "extracted" from this file. When present, they are stored
   * against the raw file source as an interpretation (source_ref: "unstructured"),
   * populating the Sources → Interpretations → derived-entities chain.
   */
  interpretation_entities?: Record<string, unknown>[];
  interpretation_config?: Record<string, unknown>;
}

export interface SandboxManifest {
  schema_version: string;
  description: string;
  agent_identities: SandboxAgentIdentity[];
  entity_batches: SandboxEntityBatch[];
  unstructured_sources: SandboxUnstructuredSource[];
  excluded_fixtures: string[];
  /** Optional graph edges wired by `_ref` after entity batches are stored. */
  relationships?: SandboxRelationship[];
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
  relationships_created: number;
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
  repoRoot: string
): Promise<Record<string, unknown>[]> {
  // Inline entities authored directly in the manifest (showcase packs).
  if (Array.isArray(batch.entities)) {
    return batch.entities.map((row) =>
      batch.entity_type_override ? { entity_type: batch.entity_type_override, ...row } : row
    );
  }
  if (!batch.fixture) {
    throw new Error(`Batch ${batch.idempotency_prefix} has neither 'entities' nor 'fixture'`);
  }
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
      relationships_created: 0,
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
  let relationshipsCreated = 0;
  // `_ref` handle -> server-assigned entity id, so manifest relationships can
  // wire the graph after every entity exists.
  const refToEntityId = new Map<string, string>();

  for (let i = 0; i < manifest.entity_batches.length; i++) {
    const batch = manifest.entity_batches[i];
    const agent = manifest.agent_identities[batch.agent_index];
    if (!agent) {
      throw new Error(
        `Batch ${i} (${batch.idempotency_prefix}) references agent_index ${batch.agent_index}, which is out of range`
      );
    }
    const resolved = await resolveFixtureEntities(batch, repoRoot);
    entitiesPlanned += resolved.length;

    // Strip `_ref` (and any `_`-prefixed authoring keys) before /store; remember
    // each entity's ref by position so we can map ids back from the response.
    const refsByIndex: (string | undefined)[] = [];
    const entities = resolved.map((row) => {
      const clean: Record<string, unknown> = {};
      let ref: string | undefined;
      for (const [k, v] of Object.entries(row)) {
        if (k === "_ref") ref = typeof v === "string" ? v : undefined;
        else if (!k.startsWith("_")) clean[k] = v;
      }
      refsByIndex.push(ref);
      return clean;
    });

    if (options.dryRun) {
      logger(
        `[dry-run] batch ${batch.idempotency_prefix} — ${entities.length} entities as ${agent.client_name}`
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

    try {
      const res = await fetchFn(`${baseUrl}/store`, {
        method: "POST",
        headers: headersForAgent(agent, options.bearer),
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // Best-effort: one bad batch must not abort the rest of the seed.
        logger(
          `WARN: seed batch ${batch.idempotency_prefix} failed (${res.status}): ${text.slice(0, 200)}`
        );
        continue;
      }
      const result = (await res.json().catch(() => null)) as {
        entities?: { observation_index?: number; entity_id?: string }[];
      } | null;
      for (const ent of result?.entities ?? []) {
        const ref =
          typeof ent.observation_index === "number"
            ? refsByIndex[ent.observation_index]
            : undefined;
        if (ref && ent.entity_id) refToEntityId.set(ref, ent.entity_id);
      }
      entityBatchesSubmitted++;
      logger(`seeded batch ${batch.idempotency_prefix} (${entities.length} entities)`);
    } catch (err) {
      logger(`WARN: seed batch ${batch.idempotency_prefix} threw: ${(err as Error).message}`);
    }
  }

  // Relationship pass — wire the graph from `_ref` handles now that ids exist.
  if (!options.dryRun && Array.isArray(manifest.relationships) && manifest.relationships.length) {
    const relAgent = manifest.agent_identities[0];
    const resolvedRels = manifest.relationships
      .map((rel) => {
        const source_entity_id = refToEntityId.get(rel.source_ref);
        const target_entity_id = refToEntityId.get(rel.target_ref);
        if (!source_entity_id || !target_entity_id) {
          logger(
            `WARN: relationship ${rel.source_ref} -[${rel.relationship_type}]-> ${rel.target_ref} skipped (unresolved ref)`
          );
          return null;
        }
        return {
          source_entity_id,
          target_entity_id,
          relationship_type: rel.relationship_type,
          ...(rel.metadata ? { metadata: rel.metadata } : {}),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (resolvedRels.length) {
      try {
        const res = await fetchFn(`${baseUrl}/create_relationships`, {
          method: "POST",
          headers: headersForAgent(relAgent, options.bearer),
          body: JSON.stringify({ relationships: resolvedRels }),
        });
        if (res.ok) {
          relationshipsCreated = resolvedRels.length;
          logger(`created ${relationshipsCreated} relationships`);
        } else {
          const text = await res.text().catch(() => "");
          logger(`WARN: create_relationships failed (${res.status}): ${text.slice(0, 200)}`);
        }
      } catch (err) {
        logger(`WARN: create_relationships threw: ${(err as Error).message}`);
      }
    }
  }

  for (const source of manifest.unstructured_sources) {
    const agent = manifest.agent_identities[source.agent_index];
    if (!agent) {
      throw new Error(
        `Unstructured source for ${source.fixture_path} references agent_index ${source.agent_index} (out of range)`
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
    const payload: Record<string, unknown> = {
      file_content: base64,
      mime_type: source.mime_type,
      original_filename: source.original_filename,
      idempotency_key: stableIdempotencyKey(
        `sandbox-seed-unstructured-${source.original_filename}`,
        0
      ),
    };
    // Optional interpretation: attach extracted entities to the raw file source
    // so the Sources → Interpretations → derived-entities chain is populated.
    if (Array.isArray(source.interpretation_entities) && source.interpretation_entities.length) {
      payload.entities = source.interpretation_entities;
      payload.interpretation = {
        source_ref: "unstructured",
        ...(source.interpretation_config
          ? { interpretation_config: source.interpretation_config }
          : {}),
      };
    }

    // Unstructured storage is handled by the unified /store endpoint (file_content
    // + optional interpretation); there is no separate /store/unstructured route.
    const res = await fetchFn(`${baseUrl}/store`, {
      method: "POST",
      headers: headersForAgent(agent, options.bearer),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Non-fatal for seeding — we log and continue so one bad fixture
      // doesn't blow up the whole reset.
      logger(
        `WARN: unstructured source ${source.fixture_path} failed (${res.status}): ${text.slice(0, 200)}`
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
    relationships_created: relationshipsCreated,
    dry_run: options.dryRun === true,
  };
}

function parseArgs(argv: string[]): {
  baseUrl: string;
  dryRun: boolean;
  manifestPath?: string;
} {
  let baseUrl = process.env.NEOTOMA_SANDBOX_BASE_URL?.trim() || "http://localhost:3180";
  let dryRun = false;
  let manifestPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url" && argv[i + 1]) {
      baseUrl = argv[i + 1];
      i++;
    } else if (arg === "--manifest" && argv[i + 1]) {
      // Per-pack manifest (use-case packs); defaults to the generic manifest.
      manifestPath = argv[i + 1];
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }
  return { baseUrl, dryRun, manifestPath };
}

async function main(): Promise<void> {
  const { baseUrl, dryRun, manifestPath } = parseArgs(process.argv.slice(2));
  const bearer = process.env.NEOTOMA_SANDBOX_BEARER?.trim() || undefined;
  const result = await seedSandbox({ baseUrl, bearer, dryRun, manifestPath });
  process.stdout.write(JSON.stringify({ ok: true, base_url: baseUrl, ...result }, null, 2) + "\n");
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
