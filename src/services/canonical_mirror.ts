/**
 * Canonical Markdown Mirror Subsystem
 *
 * Filesystem mirror covering the first-class Neotoma data objects:
 *   - entities (one .md per entity)
 *   - relationships (one .md per canonical key)
 *   - sources (one .md per source metadata)
 *   - timeline events (one consolidated .md per day)
 *   - schemas (one .md per entity_type)
 *
 * SQLite remains the sole source of truth. The mirror is a derived,
 * read-only artifact regenerated on write:
 *   - Writes go through `mirrorEntity`, `mirrorRelationship`, etc. which are
 *     guarded by the `mirror.enabled` config and the per-kind `mirror.kinds`
 *     list. Disabled → no-ops.
 *   - Deletes are handled via `removeMirrorEntity`, `removeMirrorRelationship`,
 *     `removeMirrorSource` (sources never bring the raw blob out of SQLite).
 *   - `rebuildMirror(options)` reads from SQLite and regenerates targeted
 *     scope from scratch. `--clean` removes stale files within scope.
 *
 * Determinism:
 *   - Content-hash no-op: if rendered output matches current file content,
 *     the write is skipped. Avoids mtime/git churn.
 *   - Slugs derive from canonical_name with a short id-hash suffix on collision.
 *   - Index pages are regenerated from the DB, not from cumulative state,
 *     so re-runs are stable.
 *
 * CLI surface lives in `src/cli/commands/mirror.ts`.
 */
import { createHash } from "node:crypto";
import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { db } from "../db.js";
import { config } from "../config.js";
import { schemaRegistry } from "./schema_registry.js";
import { getEntityDisplayName } from "../shared/entity_display_name.js";
import { getRecordDisplaySummary } from "../shared/record_display_summary.js";
import {
  renderEntityMarkdown,
  renderRelationshipMarkdown,
  renderSourceMarkdown,
  renderTimelineDayMarkdown,
  renderSchemaMarkdown,
  renderIndexMarkdown,
  type RenderEntityInput,
  type RenderRelationshipInput,
  type RenderSourceInput,
  type RenderTimelineEventInput,
  type RenderSchemaInput,
} from "./canonical_markdown.js";

// ============================================================================
// Config
// ============================================================================

export type MirrorKind = "entities" | "relationships" | "sources" | "timeline" | "schemas";

export const ALL_MIRROR_KINDS: MirrorKind[] = [
  "entities",
  "relationships",
  "sources",
  "timeline",
  "schemas",
];

export interface MirrorConfig {
  enabled: boolean;
  /** Absolute filesystem path. Defaults to `<dataDir>/mirror`. */
  path: string;
  kinds: MirrorKind[];
  /** Phase 3: optional git history. */
  git_enabled: boolean;
  memory_export: {
    enabled: boolean;
    path: string;
    limit_lines: number;
  };
}

function readUserConfig(): Record<string, unknown> | null {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const configPath = path.join(home, ".config", "neotoma", "config.json");
  try {
    const raw = fsSync.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeUserConfig(patch: Record<string, unknown>): void {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return;
  const dir = path.join(home, ".config", "neotoma");
  const configPath = path.join(dir, "config.json");
  fsSync.mkdirSync(dir, { recursive: true });
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(fsSync.readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    current = {};
  }
  const merged = { ...current, ...patch };
  fsSync.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

/**
 * Effective mirror config. Priority (low → high):
 *   1. Defaults (disabled, dataDir/mirror, all kinds).
 *   2. `~/.config/neotoma/config.json` → `mirror` key.
 *   3. Environment variables:
 *      - `NEOTOMA_MIRROR_ENABLED=true`
 *      - `NEOTOMA_MIRROR_PATH=/path/to/mirror`
 *      - `NEOTOMA_MIRROR_KINDS=entities,relationships`
 *      - `NEOTOMA_MIRROR_GIT_ENABLED=true`
 *      - `NEOTOMA_MIRROR_MEMORY_EXPORT_ENABLED=true`
 *      - `NEOTOMA_MIRROR_MEMORY_EXPORT_PATH=MEMORY.md`
 *      - `NEOTOMA_MIRROR_MEMORY_EXPORT_LIMIT_LINES=200`
 */
export function getMirrorConfig(): MirrorConfig {
  const defaults: MirrorConfig = {
    enabled: false,
    path: path.join(config.dataDir, "mirror"),
    kinds: [...ALL_MIRROR_KINDS],
    git_enabled: false,
    memory_export: {
      enabled: false,
      path: "MEMORY.md",
      limit_lines: 200,
    },
  };

  const user = readUserConfig()?.mirror as Partial<MirrorConfig> | undefined;
  const merged: MirrorConfig = {
    enabled: user?.enabled ?? defaults.enabled,
    path: user?.path ?? defaults.path,
    kinds: user?.kinds ?? defaults.kinds,
    git_enabled: user?.git_enabled ?? defaults.git_enabled,
    memory_export: {
      enabled: user?.memory_export?.enabled ?? defaults.memory_export.enabled,
      path: user?.memory_export?.path ?? defaults.memory_export.path,
      limit_lines: user?.memory_export?.limit_lines ?? defaults.memory_export.limit_lines,
    },
  };

  if (process.env.NEOTOMA_MIRROR_ENABLED !== undefined) {
    merged.enabled = process.env.NEOTOMA_MIRROR_ENABLED.toLowerCase() === "true";
  }
  if (process.env.NEOTOMA_MIRROR_PATH) merged.path = process.env.NEOTOMA_MIRROR_PATH;
  if (process.env.NEOTOMA_MIRROR_KINDS) {
    merged.kinds = process.env.NEOTOMA_MIRROR_KINDS.split(",")
      .map((s) => s.trim() as MirrorKind)
      .filter((k) => ALL_MIRROR_KINDS.includes(k));
  }
  if (process.env.NEOTOMA_MIRROR_GIT_ENABLED !== undefined) {
    merged.git_enabled = process.env.NEOTOMA_MIRROR_GIT_ENABLED.toLowerCase() === "true";
  }
  if (process.env.NEOTOMA_MIRROR_MEMORY_EXPORT_ENABLED !== undefined) {
    merged.memory_export.enabled =
      process.env.NEOTOMA_MIRROR_MEMORY_EXPORT_ENABLED.toLowerCase() === "true";
  }
  if (process.env.NEOTOMA_MIRROR_MEMORY_EXPORT_PATH) {
    merged.memory_export.path = process.env.NEOTOMA_MIRROR_MEMORY_EXPORT_PATH;
  }
  if (process.env.NEOTOMA_MIRROR_MEMORY_EXPORT_LIMIT_LINES) {
    const n = parseInt(process.env.NEOTOMA_MIRROR_MEMORY_EXPORT_LIMIT_LINES, 10);
    if (Number.isFinite(n) && n > 0) merged.memory_export.limit_lines = n;
  }

  return merged;
}

export function setMirrorConfig(patch: Partial<MirrorConfig>): MirrorConfig {
  const current = getMirrorConfig();
  const next: MirrorConfig = {
    ...current,
    ...patch,
    memory_export: {
      ...current.memory_export,
      ...(patch.memory_export ?? {}),
    },
  };
  writeUserConfig({ mirror: next });
  return next;
}

function kindEnabled(kind: MirrorKind, cfg: MirrorConfig = getMirrorConfig()): boolean {
  return cfg.enabled && cfg.kinds.includes(kind);
}

// ============================================================================
// Filesystem helpers
// ============================================================================

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeFileIfChanged(
  filePath: string,
  content: string
): Promise<"written" | "unchanged"> {
  await ensureDir(path.dirname(filePath));
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === content) return "unchanged";
  } catch {
    // Not present — fall through to write.
  }
  await fs.writeFile(filePath, content, "utf8");
  return "written";
}

async function removeIfPresent(filePath: string): Promise<"removed" | "absent"> {
  try {
    await fs.unlink(filePath);
    return "removed";
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return "absent";
    throw err;
  }
}

// Deterministic slug: slug-case canonical_name; short-hash disambiguator on collision.
function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "untitled";
}

function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

/** Deterministic, URL-safe slug for an entity: `<canonical-slug>-<id-hash>`. */
export function entitySlug(entityId: string, canonicalName: string | null | undefined): string {
  const base = slugify(canonicalName ?? "");
  const suffix = shortHash(entityId);
  return base ? `${base}-${suffix}` : suffix;
}

/** Deterministic, filesystem-safe slug for a relationship key. */
export function relationshipSlug(
  relationshipKey: string,
  sourceId: string,
  targetId: string,
  relationshipType: string
): string {
  const normalized = `${relationshipType}__${slugify(sourceId)}__${slugify(targetId)}`;
  const suffix = shortHash(relationshipKey);
  return `${normalized}-${suffix}`;
}

// ============================================================================
// Paths
// ============================================================================

export function mirrorPaths(cfg: MirrorConfig = getMirrorConfig()): {
  root: string;
  entities: string;
  relationships: string;
  sources: string;
  timeline: string;
  schemas: string;
  topIndex: string;
} {
  const root = cfg.path;
  return {
    root,
    entities: path.join(root, "entities"),
    relationships: path.join(root, "relationships"),
    sources: path.join(root, "sources"),
    timeline: path.join(root, "timeline"),
    schemas: path.join(root, "schemas"),
    topIndex: path.join(root, "index.md"),
  };
}

function entityFilePath(
  entityType: string,
  entityId: string,
  canonicalName: string | null | undefined,
  cfg: MirrorConfig = getMirrorConfig()
): string {
  const p = mirrorPaths(cfg);
  return path.join(p.entities, slugify(entityType), `${entitySlug(entityId, canonicalName)}.md`);
}

function relationshipFilePath(
  relationshipKey: string,
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  cfg: MirrorConfig = getMirrorConfig()
): string {
  const p = mirrorPaths(cfg);
  return path.join(
    p.relationships,
    slugify(relationshipType),
    `${relationshipSlug(relationshipKey, sourceEntityId, targetEntityId, relationshipType)}.md`
  );
}

function sourceFilePath(sourceId: string, cfg: MirrorConfig = getMirrorConfig()): string {
  const p = mirrorPaths(cfg);
  return path.join(p.sources, `${sourceId}.md`);
}

function timelineFilePath(date: string, cfg: MirrorConfig = getMirrorConfig()): string {
  const p = mirrorPaths(cfg);
  const year = date.slice(0, 4) || "unknown";
  return path.join(p.timeline, year, `${date}.md`);
}

function schemaFilePath(entityType: string, cfg: MirrorConfig = getMirrorConfig()): string {
  const p = mirrorPaths(cfg);
  return path.join(p.schemas, `${slugify(entityType)}.md`);
}

// ============================================================================
// Entity hooks
// ============================================================================

export interface MirrorEntityRow {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at?: string | null;
  observation_count?: number | null;
  last_observation_at?: string | null;
  provenance?: Record<string, string> | null;
  canonical_name?: string | null;
  user_id?: string | null;
}

export async function mirrorEntity(entity: MirrorEntityRow, cfg?: MirrorConfig): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("entities", c)) return;

  const canonicalName =
    entity.canonical_name ??
    (typeof entity.snapshot?.canonical_name === "string"
      ? (entity.snapshot.canonical_name as string)
      : entity.entity_id);

  const filePath = entityFilePath(entity.entity_type, entity.entity_id, canonicalName, c);

  // Best-effort: load schema to get stable field order.
  let schemaFieldOrder: string[] = [];
  try {
    const schema = await schemaRegistry.loadActiveSchema(
      entity.entity_type,
      entity.user_id ?? undefined
    );
    if (schema) {
      schemaFieldOrder = Object.keys(schema.schema_definition?.fields ?? {});
    }
  } catch {
    // Ignore — ordering falls back to alphabetical.
  }

  const input: RenderEntityInput = {
    entity_id: entity.entity_id,
    entity_type: entity.entity_type,
    schema_version: entity.schema_version,
    snapshot: entity.snapshot ?? {},
    computed_at: entity.computed_at ?? null,
    observation_count: entity.observation_count ?? null,
    last_observation_at: entity.last_observation_at ?? null,
    provenance: entity.provenance ?? undefined,
  };

  const rendered = renderEntityMarkdown(input, schemaFieldOrder, {
    includeProvenance: true,
  });
  await writeFileIfChanged(filePath, rendered);

  await regenerateEntityTypeIndex(entity.entity_type, c);
  await regenerateEntitiesRootIndex(c);
  await regenerateTopIndex(c);
}

export async function removeMirrorEntity(
  entityType: string,
  entityId: string,
  canonicalName: string | null | undefined,
  cfg?: MirrorConfig
): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("entities", c)) return;
  await removeIfPresent(entityFilePath(entityType, entityId, canonicalName, c));
  await regenerateEntityTypeIndex(entityType, c);
  await regenerateEntitiesRootIndex(c);
  await regenerateTopIndex(c);
}

async function regenerateEntityTypeIndex(entityType: string, cfg: MirrorConfig): Promise<void> {
  const p = mirrorPaths(cfg);
  const dir = path.join(p.entities, slugify(entityType));
  const indexPath = path.join(dir, "index.md");

  const { data, error } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_type", entityType);
  if (error) return;

  const entries = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const snapshot = (row.snapshot as Record<string, unknown>) ?? {};
      const canonicalName =
        (snapshot.canonical_name as string | undefined) ?? (row.entity_id as string);
      const slug = entitySlug(row.entity_id as string, canonicalName);
      const label = getEntityDisplayName({
        entity_type: entityType,
        canonical_name: canonicalName,
        snapshot,
      });
      const summary = getRecordDisplaySummary("entities", {
        entity_type: entityType,
        canonical_name: canonicalName,
      });
      return { label, href: `${slug}.md`, summary };
    })
    .sort((a: { label: string }, b: { label: string }) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0
    );

  const rendered = renderIndexMarkdown(`Entities — ${entityType}`, entries);
  await writeFileIfChanged(indexPath, rendered);
}

async function regenerateEntitiesRootIndex(cfg: MirrorConfig): Promise<void> {
  const p = mirrorPaths(cfg);
  const indexPath = path.join(p.entities, "index.md");
  const { data, error } = await db.from("entity_snapshots").select("entity_type");
  if (error) return;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const t = (row as { entity_type?: string }).entity_type;
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .map(([type, count]) => ({
      label: type,
      href: `${slugify(type)}/index.md`,
      summary: `${count} entit${count === 1 ? "y" : "ies"}`,
    }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const rendered = renderIndexMarkdown("Entities", entries);
  await writeFileIfChanged(indexPath, rendered);
}

// ============================================================================
// Relationship hooks
// ============================================================================

export interface MirrorRelationshipRow {
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  schema_version?: string;
  snapshot: Record<string, unknown>;
  computed_at?: string | null;
  observation_count?: number | null;
  last_observation_at?: string | null;
  provenance?: Record<string, string> | null;
}

export async function mirrorRelationship(
  rel: MirrorRelationshipRow,
  cfg?: MirrorConfig
): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("relationships", c)) return;

  const filePath = relationshipFilePath(
    rel.relationship_key,
    rel.relationship_type,
    rel.source_entity_id,
    rel.target_entity_id,
    c
  );

  const input: RenderRelationshipInput = {
    relationship_key: rel.relationship_key,
    relationship_type: rel.relationship_type,
    source_entity_id: rel.source_entity_id,
    target_entity_id: rel.target_entity_id,
    schema_version: rel.schema_version,
    snapshot: rel.snapshot ?? {},
    computed_at: rel.computed_at ?? null,
    observation_count: rel.observation_count ?? null,
    last_observation_at: rel.last_observation_at ?? null,
    provenance: rel.provenance ?? undefined,
  };

  const rendered = renderRelationshipMarkdown(input, {
    includeProvenance: true,
    resolveEntityDisplay: await buildEntityDisplayResolver([
      rel.source_entity_id,
      rel.target_entity_id,
    ]),
  });
  await writeFileIfChanged(filePath, rendered);

  await regenerateRelationshipTypeIndex(rel.relationship_type, c);
  await regenerateRelationshipsRootIndex(c);
  await regenerateTopIndex(c);
}

export async function removeMirrorRelationship(
  relationshipKey: string,
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  cfg?: MirrorConfig
): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("relationships", c)) return;
  await removeIfPresent(
    relationshipFilePath(relationshipKey, relationshipType, sourceEntityId, targetEntityId, c)
  );
  await regenerateRelationshipTypeIndex(relationshipType, c);
  await regenerateRelationshipsRootIndex(c);
  await regenerateTopIndex(c);
}

async function buildEntityDisplayResolver(
  entityIds: string[]
): Promise<
  (entityId: string) => import("../shared/entity_display_name.js").EntityDisplayInput | null
> {
  const ids = [...new Set(entityIds)].filter(Boolean);
  if (ids.length === 0) return () => null;
  const { data } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, snapshot")
    .in("entity_id", ids);
  const map = new Map<string, { entity_type: string; snapshot: Record<string, unknown> }>();
  for (const row of data ?? []) {
    const r = row as { entity_id: string; entity_type: string; snapshot: Record<string, unknown> };
    map.set(r.entity_id, { entity_type: r.entity_type, snapshot: r.snapshot ?? {} });
  }
  return (entityId: string) => {
    const hit = map.get(entityId);
    if (!hit) return null;
    return {
      entity_type: hit.entity_type,
      canonical_name: (hit.snapshot?.canonical_name as string | undefined) ?? entityId,
      snapshot: hit.snapshot,
    };
  };
}

async function regenerateRelationshipTypeIndex(
  relationshipType: string,
  cfg: MirrorConfig
): Promise<void> {
  const p = mirrorPaths(cfg);
  const dir = path.join(p.relationships, slugify(relationshipType));
  const indexPath = path.join(dir, "index.md");
  const { data, error } = await db
    .from("relationship_snapshots")
    .select("relationship_key, relationship_type, source_entity_id, target_entity_id")
    .eq("relationship_type", relationshipType);
  if (error) return;
  const entries = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const key = row.relationship_key as string;
      const slug = relationshipSlug(
        key,
        row.source_entity_id as string,
        row.target_entity_id as string,
        relationshipType
      );
      const label = `${row.source_entity_id} → ${row.target_entity_id}`;
      return { label, href: `${slug}.md` };
    })
    .sort((a: { label: string }, b: { label: string }) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0
    );
  const rendered = renderIndexMarkdown(`Relationships — ${relationshipType}`, entries);
  await writeFileIfChanged(indexPath, rendered);
}

async function regenerateRelationshipsRootIndex(cfg: MirrorConfig): Promise<void> {
  const p = mirrorPaths(cfg);
  const indexPath = path.join(p.relationships, "index.md");
  const { data, error } = await db.from("relationship_snapshots").select("relationship_type");
  if (error) return;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const t = (row as { relationship_type?: string }).relationship_type;
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .map(([type, count]) => ({
      label: type,
      href: `${slugify(type)}/index.md`,
      summary: `${count} relationship${count === 1 ? "" : "s"}`,
    }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const rendered = renderIndexMarkdown("Relationships", entries);
  await writeFileIfChanged(indexPath, rendered);
}

// ============================================================================
// Source hooks
// ============================================================================

export interface MirrorSourceRow {
  id: string;
  content_hash: string;
  mime_type: string;
  file_name?: string | null;
  original_filename?: string | null;
  byte_size?: number | null;
  source_type: string;
  source_agent_id?: string | null;
  source_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  storage_status?: string | null;
}

export async function mirrorSource(source: MirrorSourceRow, cfg?: MirrorConfig): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("sources", c)) return;
  const input: RenderSourceInput = {
    id: source.id,
    content_hash: source.content_hash,
    mime_type: source.mime_type,
    file_name: source.file_name ?? null,
    original_filename: source.original_filename ?? null,
    byte_size: source.byte_size ?? null,
    source_type: source.source_type,
    source_agent_id: source.source_agent_id ?? null,
    source_metadata: source.source_metadata ?? null,
    created_at: source.created_at ?? null,
    storage_status: source.storage_status ?? null,
  };
  const rendered = renderSourceMarkdown(input, { apiBase: config.apiBase });
  await writeFileIfChanged(sourceFilePath(source.id, c), rendered);
  await regenerateSourcesIndex(c);
  await regenerateTopIndex(c);
}

export async function removeMirrorSource(sourceId: string, cfg?: MirrorConfig): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("sources", c)) return;
  await removeIfPresent(sourceFilePath(sourceId, c));
  await regenerateSourcesIndex(c);
  await regenerateTopIndex(c);
}

async function regenerateSourcesIndex(cfg: MirrorConfig): Promise<void> {
  const p = mirrorPaths(cfg);
  const indexPath = path.join(p.sources, "index.md");
  const { data, error } = await db
    .from("sources")
    .select("id, mime_type, file_name, original_filename, created_at");
  if (error) return;
  const entries = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const id = row.id as string;
      const label =
        getRecordDisplaySummary("sources", {
          original_filename: row.original_filename,
          file_name: row.file_name,
          mime_type: row.mime_type,
        }) || id;
      return { label: `${label} (${id.slice(0, 8)}…)`, href: `${id}.md` };
    })
    .sort((a: { label: string }, b: { label: string }) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0
    );
  const rendered = renderIndexMarkdown("Sources", entries);
  await writeFileIfChanged(indexPath, rendered);
}

// ============================================================================
// Timeline hooks
// ============================================================================

export async function mirrorTimelineDay(date: string, cfg?: MirrorConfig): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("timeline", c)) return;

  // Fetch all events for this date.
  const start = `${date}T00:00:00.000Z`;
  const next = nextDay(date);
  const end = `${next}T00:00:00.000Z`;
  const { data, error } = await db
    .from("timeline_events")
    .select("*")
    .gte("event_timestamp", start)
    .lt("event_timestamp", end);
  if (error) return;
  const events: RenderTimelineEventInput[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    event_type: row.event_type as string,
    event_timestamp: row.event_timestamp as string,
    source_id: (row.source_id as string | undefined) ?? null,
    source_field: (row.source_field as string | undefined) ?? null,
    entity_ids: Array.isArray(row.entity_ids) ? (row.entity_ids as string[]) : null,
    metadata: (row.metadata as Record<string, unknown> | undefined) ?? null,
  }));

  const filePath = timelineFilePath(date, c);
  if (events.length === 0) {
    await removeIfPresent(filePath);
  } else {
    const rendered = renderTimelineDayMarkdown(date, events);
    await writeFileIfChanged(filePath, rendered);
  }
  await regenerateTimelineIndex(c);
  await regenerateTopIndex(c);
}

function nextDay(date: string): string {
  // date is YYYY-MM-DD
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function regenerateTimelineIndex(cfg: MirrorConfig): Promise<void> {
  const p = mirrorPaths(cfg);
  const indexPath = path.join(p.timeline, "index.md");
  const { data, error } = await db.from("timeline_events").select("event_timestamp");
  if (error) return;
  const days = new Map<string, number>();
  for (const row of data ?? []) {
    const ts = (row as { event_timestamp?: string }).event_timestamp;
    if (!ts) continue;
    const date = ts.slice(0, 10);
    days.set(date, (days.get(date) ?? 0) + 1);
  }
  const entries = [...days.entries()]
    .map(([date, count]) => ({
      label: date,
      href: `${date.slice(0, 4)}/${date}.md`,
      summary: `${count} event${count === 1 ? "" : "s"}`,
    }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const rendered = renderIndexMarkdown("Timeline", entries);
  await writeFileIfChanged(indexPath, rendered);
}

// ============================================================================
// Schema hooks
// ============================================================================

export interface MirrorSchemaRow {
  entity_type: string;
  schema_version: string;
  schema_definition: {
    fields: Record<string, import("./canonical_markdown.js").RenderSchemaFieldDef>;
  };
  active?: boolean;
  created_at?: string;
  metadata?: { label?: string; description?: string; category?: string };
}

export async function mirrorSchema(schema: MirrorSchemaRow, cfg?: MirrorConfig): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("schemas", c)) return;
  const input: RenderSchemaInput = {
    entity_type: schema.entity_type,
    schema_version: schema.schema_version,
    schema_definition: schema.schema_definition,
    active: schema.active,
    created_at: schema.created_at,
    metadata: schema.metadata,
  };
  const rendered = renderSchemaMarkdown(input);
  await writeFileIfChanged(schemaFilePath(schema.entity_type, c), rendered);
  await regenerateSchemasIndex(c);
  await regenerateTopIndex(c);
}

export async function removeMirrorSchema(entityType: string, cfg?: MirrorConfig): Promise<void> {
  const c = cfg ?? getMirrorConfig();
  if (!kindEnabled("schemas", c)) return;
  await removeIfPresent(schemaFilePath(entityType, c));
  await regenerateSchemasIndex(c);
  await regenerateTopIndex(c);
}

async function regenerateSchemasIndex(cfg: MirrorConfig): Promise<void> {
  const p = mirrorPaths(cfg);
  const indexPath = path.join(p.schemas, "index.md");
  const { data, error } = await db
    .from("schema_registry")
    .select("entity_type, schema_version, active, metadata")
    .eq("active", true);
  if (error) return;
  const entries = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const et = row.entity_type as string;
      const metadata = row.metadata as { label?: string; description?: string } | undefined;
      const label = metadata?.label ?? et;
      return {
        label,
        href: `${slugify(et)}.md`,
        summary: metadata?.description,
      };
    })
    .sort((a: { label: string }, b: { label: string }) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0
    );
  const rendered = renderIndexMarkdown("Schemas", entries);
  await writeFileIfChanged(indexPath, rendered);
}

// ============================================================================
// Top-level index
// ============================================================================

async function regenerateTopIndex(cfg: MirrorConfig): Promise<void> {
  const p = mirrorPaths(cfg);
  const entries = cfg.kinds.map((kind) => ({
    label: kind,
    href: `${kind}/index.md`,
  }));
  const rendered = renderIndexMarkdown("Neotoma mirror", entries);
  await writeFileIfChanged(p.topIndex, rendered);
}

// ============================================================================
// Rebuild
// ============================================================================

export interface RebuildOptions {
  kind?: MirrorKind | "all";
  entityType?: string;
  entityId?: string;
  clean?: boolean;
}

export interface RebuildReport {
  kinds: MirrorKind[];
  counts: Record<MirrorKind, { written: number; unchanged: number; removed: number }>;
}

function emptyReport(): RebuildReport {
  const counts = {} as RebuildReport["counts"];
  for (const k of ALL_MIRROR_KINDS) {
    counts[k] = { written: 0, unchanged: 0, removed: 0 };
  }
  return { kinds: [], counts };
}

export async function rebuildMirror(options: RebuildOptions = {}): Promise<RebuildReport> {
  const cfg = getMirrorConfig();
  const report = emptyReport();

  await ensureDir(cfg.path);

  const kinds: MirrorKind[] =
    !options.kind || options.kind === "all"
      ? cfg.kinds
      : cfg.kinds.includes(options.kind as MirrorKind)
        ? [options.kind as MirrorKind]
        : [];
  report.kinds = kinds;

  if (kinds.includes("entities")) {
    await rebuildEntities(cfg, options, report);
  }
  if (kinds.includes("relationships")) {
    await rebuildRelationships(cfg, options, report);
  }
  if (kinds.includes("sources")) {
    await rebuildSources(cfg, options, report);
  }
  if (kinds.includes("timeline")) {
    await rebuildTimeline(cfg, options, report);
  }
  if (kinds.includes("schemas")) {
    await rebuildSchemas(cfg, options, report);
  }

  await regenerateTopIndex(cfg);

  // Phase 3: if git is enabled, ensure a repo exists and land either the
  // initial commit (first rebuild) or a deterministic batch commit covering
  // this rebuild pass. Import lazily to avoid loading simple-git when git is
  // disabled.
  if (cfg.git_enabled) {
    try {
      const { initMirrorRepo, ensureInitialCommit, commitMirrorBatch } =
        await import("./canonical_mirror_git.js");
      await initMirrorRepo(cfg);
      const initRes = await ensureInitialCommit(cfg);
      if (!initRes.committed) {
        // Repo already had a HEAD; record this rebuild as a batch commit.
        await commitMirrorBatch(
          {
            trigger: "rebuild",
            kinds,
          },
          cfg
        );
      }
    } catch {
      // Git failures must not break the mirror; the mirror is still a valid
      // filesystem artifact without git.
    }
  }

  // Phase 5: optional MEMORY.md auto-regeneration. Runs only when the mirror
  // is itself enabled and `memory_export.enabled` is set, so a user who opts
  // into the mirror can also opt into a single-file export without having to
  // remember to run `neotoma memory-export` manually. Failures are swallowed
  // for the same reason as git: the mirror is still a valid artifact.
  if (cfg.enabled && cfg.memory_export.enabled) {
    try {
      const { exportMemory } = await import("./memory_export.js");
      await exportMemory({
        path: cfg.memory_export.path,
        limit_lines: cfg.memory_export.limit_lines,
        order: "recency",
      });
    } catch {
      // Intentionally swallow.
    }
  }

  return report;
}

async function rebuildEntities(
  cfg: MirrorConfig,
  opts: RebuildOptions,
  report: RebuildReport
): Promise<void> {
  const p = mirrorPaths(cfg);

  let query = db.from("entity_snapshots").select("*");
  if (opts.entityType) query = query.eq("entity_type", opts.entityType);
  if (opts.entityId) query = query.eq("entity_id", opts.entityId);
  const { data, error } = await query;
  if (error) return;

  const writtenPaths = new Set<string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const entity: MirrorEntityRow = {
      entity_id: row.entity_id as string,
      entity_type: row.entity_type as string,
      schema_version: row.schema_version as string,
      snapshot: (row.snapshot as Record<string, unknown>) ?? {},
      computed_at: (row.computed_at as string | undefined) ?? null,
      observation_count: (row.observation_count as number | undefined) ?? null,
      last_observation_at: (row.last_observation_at as string | undefined) ?? null,
      provenance: (row.provenance as Record<string, string> | undefined) ?? null,
      canonical_name:
        ((row.snapshot as Record<string, unknown> | undefined)?.canonical_name as
          | string
          | undefined) ?? null,
      user_id: (row.user_id as string | undefined) ?? null,
    };
    const targetPath = entityFilePath(
      entity.entity_type,
      entity.entity_id,
      entity.canonical_name,
      cfg
    );
    writtenPaths.add(targetPath);
    // Use direct render path (avoid per-call index regeneration).
    let schemaFieldOrder: string[] = [];
    try {
      const schema = await schemaRegistry.loadActiveSchema(
        entity.entity_type,
        entity.user_id ?? undefined
      );
      if (schema) {
        schemaFieldOrder = Object.keys(schema.schema_definition?.fields ?? {});
      }
    } catch {
      /* ignore */
    }
    const rendered = renderEntityMarkdown(
      {
        entity_id: entity.entity_id,
        entity_type: entity.entity_type,
        schema_version: entity.schema_version,
        snapshot: entity.snapshot,
        computed_at: entity.computed_at,
        observation_count: entity.observation_count,
        last_observation_at: entity.last_observation_at,
        provenance: entity.provenance ?? undefined,
      },
      schemaFieldOrder,
      { includeProvenance: true }
    );
    const result = await writeFileIfChanged(targetPath, rendered);
    report.counts.entities[result === "written" ? "written" : "unchanged"]++;
  }

  if (opts.clean) {
    const removed = await cleanStale(
      opts.entityType ? path.join(p.entities, slugify(opts.entityType)) : p.entities,
      writtenPaths,
      /* preserveNames */ new Set(["index.md"])
    );
    report.counts.entities.removed += removed;
  }

  // Regenerate indexes once per affected type and root.
  const touchedTypes = new Set<string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    touchedTypes.add(row.entity_type as string);
  }
  for (const t of touchedTypes) await regenerateEntityTypeIndex(t, cfg);
  await regenerateEntitiesRootIndex(cfg);
}

async function rebuildRelationships(
  cfg: MirrorConfig,
  opts: RebuildOptions,
  report: RebuildReport
): Promise<void> {
  const p = mirrorPaths(cfg);

  const query = db.from("relationship_snapshots").select("*");
  if (opts.entityId) {
    // We can't filter in one query; fetch then filter in memory for correctness.
  }
  const { data, error } = await query;
  if (error) return;
  const filtered = (data ?? []).filter((row: Record<string, unknown>) => {
    const r = row as Record<string, unknown>;
    if (
      opts.entityId &&
      r.source_entity_id !== opts.entityId &&
      r.target_entity_id !== opts.entityId
    ) {
      return false;
    }
    return true;
  });

  const writtenPaths = new Set<string>();
  const touchedTypes = new Set<string>();
  for (const row of filtered as Array<Record<string, unknown>>) {
    const relRow: MirrorRelationshipRow = {
      relationship_key: row.relationship_key as string,
      relationship_type: row.relationship_type as string,
      source_entity_id: row.source_entity_id as string,
      target_entity_id: row.target_entity_id as string,
      schema_version: row.schema_version as string | undefined,
      snapshot: (row.snapshot as Record<string, unknown>) ?? {},
      computed_at: (row.computed_at as string | undefined) ?? null,
      observation_count: (row.observation_count as number | undefined) ?? null,
      last_observation_at: (row.last_observation_at as string | undefined) ?? null,
      provenance: (row.provenance as Record<string, string> | undefined) ?? null,
    };
    const targetPath = relationshipFilePath(
      relRow.relationship_key,
      relRow.relationship_type,
      relRow.source_entity_id,
      relRow.target_entity_id,
      cfg
    );
    writtenPaths.add(targetPath);
    touchedTypes.add(relRow.relationship_type);
    const rendered = renderRelationshipMarkdown(
      {
        relationship_key: relRow.relationship_key,
        relationship_type: relRow.relationship_type,
        source_entity_id: relRow.source_entity_id,
        target_entity_id: relRow.target_entity_id,
        schema_version: relRow.schema_version,
        snapshot: relRow.snapshot,
        computed_at: relRow.computed_at,
        observation_count: relRow.observation_count,
        last_observation_at: relRow.last_observation_at,
        provenance: relRow.provenance ?? undefined,
      },
      {
        includeProvenance: true,
        resolveEntityDisplay: await buildEntityDisplayResolver([
          relRow.source_entity_id,
          relRow.target_entity_id,
        ]),
      }
    );
    const result = await writeFileIfChanged(targetPath, rendered);
    report.counts.relationships[result === "written" ? "written" : "unchanged"]++;
  }

  if (opts.clean) {
    const removed = await cleanStale(p.relationships, writtenPaths, new Set(["index.md"]));
    report.counts.relationships.removed += removed;
  }
  for (const t of touchedTypes) await regenerateRelationshipTypeIndex(t, cfg);
  await regenerateRelationshipsRootIndex(cfg);
}

async function rebuildSources(
  cfg: MirrorConfig,
  opts: RebuildOptions,
  report: RebuildReport
): Promise<void> {
  const p = mirrorPaths(cfg);
  const { data, error } = await db.from("sources").select("*");
  if (error) return;
  const writtenPaths = new Set<string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const source: MirrorSourceRow = {
      id: row.id as string,
      content_hash: (row.content_hash as string) ?? "",
      mime_type: (row.mime_type as string) ?? "application/octet-stream",
      file_name: (row.file_name as string | undefined) ?? null,
      original_filename: (row.original_filename as string | undefined) ?? null,
      byte_size:
        (row.file_size as number | undefined) ?? (row.byte_size as number | undefined) ?? null,
      source_type: (row.source_type as string) ?? "unknown",
      source_agent_id: (row.source_agent_id as string | undefined) ?? null,
      source_metadata: (row.provenance as Record<string, unknown> | undefined) ?? null,
      created_at: (row.created_at as string | undefined) ?? null,
      storage_status: (row.storage_status as string | undefined) ?? null,
    };
    const targetPath = sourceFilePath(source.id, cfg);
    writtenPaths.add(targetPath);
    const rendered = renderSourceMarkdown(
      {
        id: source.id,
        content_hash: source.content_hash,
        mime_type: source.mime_type,
        file_name: source.file_name,
        original_filename: source.original_filename,
        byte_size: source.byte_size,
        source_type: source.source_type,
        source_agent_id: source.source_agent_id,
        source_metadata: source.source_metadata,
        created_at: source.created_at,
        storage_status: source.storage_status,
      },
      { apiBase: config.apiBase }
    );
    const result = await writeFileIfChanged(targetPath, rendered);
    report.counts.sources[result === "written" ? "written" : "unchanged"]++;
  }
  if (opts.clean) {
    const removed = await cleanStale(p.sources, writtenPaths, new Set(["index.md"]));
    report.counts.sources.removed += removed;
  }
  await regenerateSourcesIndex(cfg);
}

async function rebuildTimeline(
  cfg: MirrorConfig,
  opts: RebuildOptions,
  report: RebuildReport
): Promise<void> {
  const p = mirrorPaths(cfg);
  const { data, error } = await db.from("timeline_events").select("*");
  if (error) return;
  const byDay = new Map<string, RenderTimelineEventInput[]>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const ts = (row.event_timestamp as string) ?? "";
    const date = ts.slice(0, 10);
    if (!date) continue;
    const evt: RenderTimelineEventInput = {
      id: row.id as string,
      event_type: (row.event_type as string) ?? "event",
      event_timestamp: ts,
      source_id: (row.source_id as string | undefined) ?? null,
      source_field: (row.source_field as string | undefined) ?? null,
      entity_ids: Array.isArray(row.entity_ids) ? (row.entity_ids as string[]) : null,
      metadata: (row.metadata as Record<string, unknown> | undefined) ?? null,
    };
    const list = byDay.get(date) ?? [];
    list.push(evt);
    byDay.set(date, list);
  }
  const writtenPaths = new Set<string>();
  for (const [date, events] of byDay.entries()) {
    const target = timelineFilePath(date, cfg);
    writtenPaths.add(target);
    const rendered = renderTimelineDayMarkdown(date, events);
    const result = await writeFileIfChanged(target, rendered);
    report.counts.timeline[result === "written" ? "written" : "unchanged"]++;
  }
  if (opts.clean) {
    const removed = await cleanStale(p.timeline, writtenPaths, new Set(["index.md"]));
    report.counts.timeline.removed += removed;
  }
  await regenerateTimelineIndex(cfg);
}

async function rebuildSchemas(
  cfg: MirrorConfig,
  opts: RebuildOptions,
  report: RebuildReport
): Promise<void> {
  const p = mirrorPaths(cfg);
  let query = db.from("schema_registry").select("*").eq("active", true);
  if (opts.entityType) query = query.eq("entity_type", opts.entityType);
  const { data, error } = await query;
  if (error) return;
  const writtenPaths = new Set<string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const schema: MirrorSchemaRow = {
      entity_type: row.entity_type as string,
      schema_version: (row.schema_version as string) ?? "1.0",
      schema_definition: (row.schema_definition as MirrorSchemaRow["schema_definition"]) ?? {
        fields: {},
      },
      active: row.active as boolean | undefined,
      created_at: row.created_at as string | undefined,
      metadata: row.metadata as MirrorSchemaRow["metadata"],
    };
    const target = schemaFilePath(schema.entity_type, cfg);
    writtenPaths.add(target);
    const rendered = renderSchemaMarkdown({
      entity_type: schema.entity_type,
      schema_version: schema.schema_version,
      schema_definition: schema.schema_definition,
      active: schema.active,
      created_at: schema.created_at,
      metadata: schema.metadata,
    });
    const result = await writeFileIfChanged(target, rendered);
    report.counts.schemas[result === "written" ? "written" : "unchanged"]++;
  }
  if (opts.clean) {
    const removed = await cleanStale(p.schemas, writtenPaths, new Set(["index.md"]));
    report.counts.schemas.removed += removed;
  }
  await regenerateSchemasIndex(cfg);
}

/** Walk `dir` recursively; remove files not in `keep`. Returns count removed. */
async function cleanStale(
  dir: string,
  keep: Set<string>,
  preserveNames: Set<string>
): Promise<number> {
  let removed = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += await cleanStale(full, keep, preserveNames);
      // Remove empty dir.
      try {
        const remaining = await fs.readdir(full);
        if (remaining.length === 0) await fs.rmdir(full);
      } catch {
        /* ignore */
      }
    } else if (entry.isFile()) {
      if (preserveNames.has(entry.name)) continue;
      if (!full.endsWith(".md")) continue;
      if (keep.has(full)) continue;
      await fs.unlink(full);
      removed++;
    }
  }
  return removed;
}

// ============================================================================
// Status
// ============================================================================

export interface MirrorStatus {
  enabled: boolean;
  path: string;
  kinds: MirrorKind[];
  git_enabled: boolean;
  counts: Record<MirrorKind, number>;
}

export async function getMirrorStatus(cfg?: MirrorConfig): Promise<MirrorStatus> {
  const c = cfg ?? getMirrorConfig();
  const counts = {} as Record<MirrorKind, number>;
  const p = mirrorPaths(c);
  for (const kind of ALL_MIRROR_KINDS) {
    counts[kind] = await countMarkdownFiles((p as Record<string, string>)[kind]);
  }
  return {
    enabled: c.enabled,
    path: c.path,
    kinds: c.kinds,
    git_enabled: c.git_enabled,
    counts,
  };
}

async function countMarkdownFiles(dir: string): Promise<number> {
  let count = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countMarkdownFiles(full);
    else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") count++;
  }
  return count;
}
