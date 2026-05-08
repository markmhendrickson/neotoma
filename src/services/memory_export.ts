/**
 * MEMORY.md bounded export.
 *
 * Produces a single markdown file for agent harnesses that expect file-based
 * memory. Shares the `renderEntityCompactText` renderer with MCP so the
 * on-disk MEMORY.md is byte-for-byte consistent with what agents receive via
 * `retrieve_entity_snapshot`.
 *
 * Ordering is deterministic:
 *   - `importance` (default): type-weighted signal score
 *     (`typeWeight × log2(observation_count + 2) × recency_decay`) desc, ties
 *     broken by `last_observation_at desc`, then `entity_id asc`. Favors
 *     signal-bearing entities (tasks, contacts, commitments, feedback, notes)
 *     over chat bookkeeping so a capped MEMORY.md surfaces useful memory first.
 *   - `recency`: `last_observation_at desc`, ties broken by `entity_id asc`.
 *
 * Chat bookkeeping (`conversation`, `agent_message`) is excluded by default
 * because the Neotoma display rule already treats them as internal. Opt back
 * in with `include_bookkeeping: true` or explicit `include_types`.
 *
 * Line cap behavior: after rendering, if the output exceeds `limit_lines`
 * (counted as newline-terminated lines), the remainder is replaced with a
 * single fold marker `<!-- fold: N entities not shown -->`. The fold is an
 * entity-boundary, not a line-boundary, so we never truncate mid-entity.
 * Set `limit_lines` to 0 to disable truncation and include every row.
 *
 * Auto-regeneration from the mirror batch flush lives in
 * `src/services/canonical_mirror.ts`; this module only provides the renderer
 * and the filesystem write.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { db } from "../db.js";
import { schemaRegistry } from "./schema_registry.js";
import {
  renderEntityCompactText,
  type RenderEntityInput,
} from "./canonical_markdown.js";

export type MemoryExportOrder = "recency" | "importance";

export interface MemoryExportOptions {
  /** Absolute or relative path where MEMORY.md is written. Required. */
  path: string;
  /** Hard line cap. 0 or negative disables truncation. */
  limit_lines?: number;
  /** Only include these entity_types. Empty/undefined = all (minus exclusions). */
  include_types?: string[];
  /** Always exclude these entity_types. Applied after include_types. */
  exclude_types?: string[];
  /**
   * When false (default), `conversation` and `agent_message` are filtered out
   * because they are chat bookkeeping that already lives in conversation
   * history. Set to true to include them.
   */
  include_bookkeeping?: boolean;
  /** Ordering strategy. Defaults to `importance`. */
  order?: MemoryExportOrder;
  /**
   * Optional per-field character cap. Applied by the compact renderer so
   * long-body entities (posts, notes, transcripts) do not dominate the line
   * budget. Default: 400. Pass 0 to disable.
   */
  max_field_chars?: number;
  /** Optional user scope. */
  user_id?: string;
}

export interface MemoryExportResult {
  path: string;
  total_entities: number;
  entities_written: number;
  line_count: number;
  truncated: boolean;
  order: MemoryExportOrder;
  bytes: number;
  excluded_types: string[];
}

/**
 * Chat bookkeeping entity types that exist to make conversation history
 * replayable. Excluded from MEMORY.md by default. Keep aligned with the
 * "chat bookkeeping" definition in the Neotoma display rule.
 */
export const BOOKKEEPING_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "conversation",
  "conversation_message",
  // `agent_message` is the pre-Phase-2 canonical name for `conversation_message`
  // and is kept here so historical rows stored under the old entity_type are
  // still treated as chat bookkeeping.
  "agent_message",
]);

/**
 * Per-type weights used by the `importance` ranker. Tier-1 (3x) = primary
 * signal an agent wants to recall (commitments, people, events, money,
 * explicit feedback/insights). Tier-2 (2x) = durable-but-secondary artifacts.
 * Tier-0 (0) = chat bookkeeping; filtered out above unless opted in, and
 * weighted to 0 here so they never rise above real signal when they are
 * included explicitly. Unrecognized types default to tier-3 (1).
 */
const TYPE_WEIGHTS: Record<string, number> = {
  // Tier-1: primary memory signal
  task: 3,
  contact: 3,
  person: 3,
  event: 3,
  transaction: 3,
  business_opportunity: 3,
  issue: 3,
  user_persona_insight: 3,
  life_tenets: 3,
  architectural_decision: 3,
  agent_decision: 3,
  release: 3,
  feature_unit: 3,
  // Tier-2: durable secondary artifacts
  note: 2,
  post: 2,
  social_post: 2,
  meeting_transcription: 2,
  email_message: 2,
  email_draft: 2,
  location: 2,
  place: 2,
  property: 2,
  file_asset: 2,
  social_share_draft: 2,
  social_share_schedule: 2,
  developer_release_tester: 2,
  receipt: 2,
  invoice: 2,
  contract: 2,
  report: 2,
  legal_research: 2,
  competitive_analysis: 2,
  market_research: 2,
  technical_research: 2,
  company: 2,
  // Tier-0: chat bookkeeping (explicit zero so ranker always sinks them)
  conversation: 0,
  agent_message: 0,
};

const RECENCY_HALF_LIFE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function typeWeightFor(entityType: string): number {
  if (entityType in TYPE_WEIGHTS) {
    return TYPE_WEIGHTS[entityType]!;
  }
  return 1;
}

function recencyDecay(
  lastObservationAtMs: number,
  nowMs: number,
  halfLifeDays = RECENCY_HALF_LIFE_DAYS
): number {
  if (!Number.isFinite(lastObservationAtMs) || lastObservationAtMs <= 0) {
    // Undated rows get a small floor so they still rank by type weight, but
    // always below rows with any real timestamp. Picked empirically small
    // enough that a Tier-1 undated row still loses to a Tier-2 recent row.
    return 0.01;
  }
  const ageDays = Math.max(0, (nowMs - lastObservationAtMs) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Importance score. Exported for tests so we can assert ordering by real
 * inputs rather than reaching into the sort closure.
 */
export function importanceScore(
  row: Record<string, unknown>,
  nowMs: number = Date.now()
): number {
  const entityType = (row.entity_type as string | undefined) ?? "";
  const weight = typeWeightFor(entityType);
  const obsCount = (row.observation_count as number | undefined) ?? 0;
  const lastRaw = (row.last_observation_at as string | undefined) ?? null;
  const lastMs = lastRaw ? Date.parse(lastRaw) : 0;
  // log2(obs+2) so a row with 0 observations still gets 1.0 weight and extra
  // observations contribute logarithmically (1 → 1.58, 4 → 2.58, 16 → 4.17).
  const obsFactor = Math.log2(Math.max(0, obsCount) + 2);
  const decay = recencyDecay(lastMs, nowMs);
  return weight * obsFactor * decay;
}

/** Sort in a stable way so output is byte-for-byte reproducible. Exported for tests. */
export function sortEntities(
  rows: Array<Record<string, unknown>>,
  order: MemoryExportOrder,
  nowMs: number = Date.now()
): Array<Record<string, unknown>> {
  const byEntityIdAsc = (
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): number => {
    const ax = (a.entity_id as string) ?? "";
    const bx = (b.entity_id as string) ?? "";
    return ax < bx ? -1 : ax > bx ? 1 : 0;
  };

  const ts = (row: Record<string, unknown>): number => {
    const raw = row.last_observation_at as string | undefined | null;
    if (!raw) return 0;
    const n = Date.parse(raw);
    return Number.isFinite(n) ? n : 0;
  };

  if (order === "importance") {
    return rows.slice().sort((a, b) => {
      const aScore = importanceScore(a, nowMs);
      const bScore = importanceScore(b, nowMs);
      if (aScore !== bScore) return bScore - aScore;
      const at = ts(a);
      const bt = ts(b);
      if (at !== bt) return bt - at;
      return byEntityIdAsc(a, b);
    });
  }

  return rows.slice().sort((a, b) => {
    const at = ts(a);
    const bt = ts(b);
    if (at !== bt) return bt - at;
    return byEntityIdAsc(a, b);
  });
}

function rowToRenderInput(row: Record<string, unknown>): RenderEntityInput {
  return {
    entity_id: row.entity_id as string,
    entity_type: row.entity_type as string,
    schema_version: (row.schema_version as string | undefined) ?? "1.0",
    snapshot: (row.snapshot as Record<string, unknown>) ?? {},
    computed_at: (row.computed_at as string | undefined) ?? null,
    observation_count: (row.observation_count as number | undefined) ?? null,
    last_observation_at: (row.last_observation_at as string | undefined) ?? null,
    provenance: undefined,
  };
}

/**
 * Render and write MEMORY.md. Pure function over DB contents; the only side
 * effect is `fs.writeFile` on the resolved output path.
 */
export async function exportMemory(
  options: MemoryExportOptions
): Promise<MemoryExportResult> {
  const order: MemoryExportOrder = options.order ?? "importance";
  const limitLines = options.limit_lines ?? 200;
  const maxFieldChars = options.max_field_chars ?? 400;
  const includeTypes = (options.include_types ?? []).filter((t) => t.length > 0);
  const explicitExcludes = (options.exclude_types ?? []).filter((t) => t.length > 0);

  // If the caller passed include_types, they are being explicit and we don't
  // silently filter bookkeeping; otherwise bookkeeping is excluded unless
  // include_bookkeeping=true. explicit exclude_types is always applied.
  const effectiveExcludes = new Set<string>(explicitExcludes);
  if (includeTypes.length === 0 && !options.include_bookkeeping) {
    for (const t of BOOKKEEPING_ENTITY_TYPES) effectiveExcludes.add(t);
  }

  let query = db.from("entity_snapshots").select("*");
  if (options.user_id) query = query.eq("user_id", options.user_id);
  if (includeTypes.length === 1) {
    query = query.eq("entity_type", includeTypes[0]!);
  } else if (includeTypes.length > 1) {
    query = query.in("entity_type", includeTypes);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load entities for memory-export: ${String(error)}`);
  }

  const rawRows = (data ?? []) as Array<Record<string, unknown>>;
  const rows =
    effectiveExcludes.size > 0
      ? rawRows.filter(
          (r) => !effectiveExcludes.has((r.entity_type as string) ?? "")
        )
      : rawRows;
  const ordered = sortEntities(rows, order);

  const excludedTypesList = Array.from(effectiveExcludes).sort();

  const lines: string[] = [];
  lines.push("# Neotoma memory");
  lines.push("");
  lines.push(`order: ${order}`);
  if (includeTypes.length > 0) {
    lines.push(`include_types: ${includeTypes.slice().sort().join(", ")}`);
  }
  if (excludedTypesList.length > 0) {
    lines.push(`excluded_types: ${excludedTypesList.join(", ")}`);
  }
  lines.push(`total_entities: ${ordered.length}`);
  lines.push("");

  // Build an array of per-entity blocks so we can enforce the line cap at
  // entity boundaries rather than mid-record.
  const blocks: string[] = [];
  for (const row of ordered) {
    const entityType = row.entity_type as string;
    let schemaFieldOrder: string[] | undefined;
    try {
      const schema = await schemaRegistry.loadActiveSchema(
        entityType,
        (row.user_id as string | undefined) ?? undefined
      );
      if (schema?.schema_definition?.fields) {
        schemaFieldOrder = Object.keys(schema.schema_definition.fields);
      }
    } catch {
      // Alphabetical fallback.
    }
    const rendered = renderEntityCompactText(
      rowToRenderInput(row),
      schemaFieldOrder,
      { maxFieldChars: maxFieldChars > 0 ? maxFieldChars : undefined }
    );
    blocks.push(rendered.trimEnd());
  }

  let entitiesWritten = 0;
  let truncated = false;

  const appendBlock = (block: string) => {
    if (entitiesWritten > 0) {
      lines.push("");
      lines.push("---");
      lines.push("");
    }
    lines.push(block);
    entitiesWritten += 1;
  };

  for (const block of blocks) {
    if (limitLines && limitLines > 0) {
      // Project the candidate line count including the fold marker, so we
      // never emit output that exceeds the limit even after truncation.
      const tentative = [...lines];
      if (entitiesWritten > 0) {
        tentative.push("", "---", "");
      }
      tentative.push(block);
      tentative.push("");
      tentative.push(`<!-- fold: 0 entities not shown -->`);
      const projected = tentative.join("\n").split("\n").length;
      if (projected > limitLines && entitiesWritten > 0) {
        truncated = true;
        break;
      }
    }
    appendBlock(block);
  }

  if (truncated) {
    lines.push("");
    lines.push(`<!-- fold: ${blocks.length - entitiesWritten} entities not shown -->`);
  }

  // Normalize trailing whitespace and ensure the file ends with a single \n.
  const output = lines.join("\n").replace(/\s+$/, "") + "\n";

  const outPath = path.resolve(options.path);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, output, "utf8");

  const byteSize = Buffer.byteLength(output, "utf8");
  return {
    path: outPath,
    total_entities: blocks.length,
    entities_written: entitiesWritten,
    line_count: output.split("\n").length,
    truncated,
    order,
    bytes: byteSize,
    excluded_types: excludedTypesList,
  };
}
