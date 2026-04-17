/**
 * Canonical Markdown Renderer Family
 *
 * Deterministic, schema-ordered markdown (and compact text) renderers for the
 * first-class Neotoma data objects: entities, relationships, sources,
 * timeline-day logs, and schemas.
 *
 * Used by:
 *   - The filesystem mirror subsystem (src/services/canonical_mirror.ts)
 *   - MCP `retrieve_entity_snapshot` text output (via buildTextResponse)
 *   - Inspector markdown preview (GET /entities/:id/markdown)
 *   - `neotoma memory-export`
 *
 * Determinism invariants:
 *   - Field ordering: schema field order first, then alphabetically sorted for
 *     unknown/extra keys. Nested object keys are alphabetically sorted in
 *     serialization (via canonicalStringify).
 *   - No Date.now() / Math.random() — all timestamps come from input data.
 *   - Every call with the same input produces byte-identical output.
 *
 * These invariants back the public KV-cache stability claim for Neotoma text
 * output to LLMs.
 */
import {
  getEntityDisplayName,
  type EntityDisplayInput,
} from "../shared/entity_display_name.js";
import { getRecordDisplaySummary } from "../shared/record_display_summary.js";

// ============================================================================
// Types
// ============================================================================

export interface RenderEntityInput {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at?: string | null;
  observation_count?: number | null;
  last_observation_at?: string | null;
  /** Field → observation_id. Only used when opts.includeProvenance is true. */
  provenance?: Record<string, string>;
}

export interface RenderSchemaFieldDef {
  type: "string" | "number" | "date" | "boolean" | "array" | "object";
  required?: boolean;
  description?: string;
}

export interface RenderSchemaInput {
  entity_type: string;
  schema_version: string;
  schema_definition: {
    fields: Record<string, RenderSchemaFieldDef>;
  };
  active?: boolean;
  created_at?: string;
  metadata?: {
    label?: string;
    description?: string;
    category?: string;
  };
}

export interface RenderRelationshipInput {
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  schema_version?: string;
  snapshot: Record<string, unknown>;
  computed_at?: string | null;
  observation_count?: number | null;
  last_observation_at?: string | null;
  provenance?: Record<string, string>;
}

export interface RenderSourceInput {
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

export interface RenderTimelineEventInput {
  id: string;
  event_type: string;
  event_timestamp: string;
  source_id?: string | null;
  source_field?: string | null;
  entity_ids?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Render options shared across kinds. None trigger nondeterminism.
 */
export interface RenderOpts {
  /** Include the per-field provenance footer (entities and relationships). */
  includeProvenance?: boolean;
  /** Resolve entity ids to display labels when rendering relationships / timeline. */
  resolveEntityDisplay?: (entityId: string) => EntityDisplayInput | null;
  /** Absolute URL base used when rendering "view raw source" links for sources. */
  apiBase?: string;
  /** Include the "do not edit" header notice (default true). */
  includeDoNotEditHeader?: boolean;
  /**
   * Optional hard cap on the character length of a single formatted field
   * value in compact text rendering. When set and a value exceeds the cap,
   * the value is truncated with a deterministic suffix
   * `… (<N> chars truncated)` so downstream diffs and KV prefixes remain
   * stable across reruns. Leave unset for the full-fidelity MCP output; the
   * memory-export flow sets this so long bodies (posts, notes, transcripts)
   * do not blow a MEMORY.md line budget.
   */
  maxFieldChars?: number;
}

// ============================================================================
// Deterministic primitives
// ============================================================================

/** JSON stringify with alphabetically sorted object keys (deterministic). */
export function canonicalStringify(value: unknown, indent: 0 | 2 = 0): string {
  const replacer = (_: string, v: unknown): unknown => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    const entries = Object.entries(v as Record<string, unknown>);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sorted: Record<string, unknown> = {};
    for (const [k, vv] of entries) sorted[k] = vv;
    return sorted;
  };
  return indent === 0
    ? JSON.stringify(value, replacer)
    : JSON.stringify(value, replacer, indent);
}

const EXCLUDED_SNAPSHOT_KEYS = new Set([
  "schema_version",
  "entity_type",
  "_deleted",
]);

const SPECIAL_FIRST_KEYS = [
  "title",
  "name",
  "canonical_name",
  "description",
  "summary",
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Order the keys of a snapshot-like record deterministically.
 *
 * Priority:
 *   1. Conceptual first keys (title, name, canonical_name, description, summary)
 *      that actually appear.
 *   2. Schema-declared field order (when schema is provided).
 *   3. Any remaining keys, alphabetically sorted.
 *
 * Keys in EXCLUDED_SNAPSHOT_KEYS are dropped (they live in the header instead).
 * Keys whose value is the `_deleted` sentinel are also dropped.
 */
export function orderedSnapshotKeys(
  snapshot: Record<string, unknown>,
  schemaFieldOrder: string[] = []
): string[] {
  const present = new Set(Object.keys(snapshot));
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const k of SPECIAL_FIRST_KEYS) {
    if (present.has(k) && !EXCLUDED_SNAPSHOT_KEYS.has(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  for (const k of schemaFieldOrder) {
    if (present.has(k) && !EXCLUDED_SNAPSHOT_KEYS.has(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  const remaining = [...present]
    .filter((k) => !EXCLUDED_SNAPSHOT_KEYS.has(k) && !seen.has(k))
    .sort();
  for (const k of remaining) ordered.push(k);

  return ordered;
}

/** Format a single scalar-or-complex value for a markdown body block. */
function formatFieldValueMarkdown(value: unknown): string {
  if (value === null || value === undefined) return "_(empty)_";
  if (typeof value === "string") {
    if (!value) return "_(empty)_";
    return value.includes("\n") ? "\n" + value.trimEnd() + "\n" : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "_(empty)_";
    const allScalars = value.every(
      (v) => v === null || typeof v !== "object"
    );
    if (allScalars) {
      return value
        .map((v) => `- ${v === null || v === undefined ? "_(empty)_" : typeof v === "string" ? v : canonicalStringify(v)}`)
        .join("\n");
    }
    return "```json\n" + canonicalStringify(value, 2) + "\n```";
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return "_(empty)_";
    return "```json\n" + canonicalStringify(value, 2) + "\n```";
  }
  return String(value);
}

/** Format a value for compact text output (MCP KV-cache friendly). */
function formatFieldValueCompact(value: unknown, maxChars?: number): string {
  let formatted: string;
  if (value === null || value === undefined) {
    formatted = "—";
  } else if (typeof value === "string") {
    formatted = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    formatted = String(value);
  } else {
    formatted = canonicalStringify(value);
  }
  if (maxChars && maxChars > 0 && formatted.length > maxChars) {
    const truncated = formatted.length - maxChars;
    return `${formatted.slice(0, maxChars)}… (${truncated} chars truncated)`;
  }
  return formatted;
}

// ============================================================================
// Header helpers
// ============================================================================

const DO_NOT_EDIT_NOTICE =
  "<!-- Do not edit this file directly. Corrections go through `neotoma corrections create`, `neotoma edit <id>`, or the Neotoma Inspector. This file is regenerated on every relevant write. -->";

function frontmatter(pairs: Array<[string, string | number | null | undefined]>): string {
  const lines: string[] = ["---"];
  for (const [k, v] of pairs) {
    if (v === null || v === undefined || v === "") continue;
    lines.push(`${k}: ${v}`);
  }
  lines.push("---");
  return lines.join("\n");
}

// ============================================================================
// Entity renderer
// ============================================================================

export function renderEntityMarkdown(
  entity: RenderEntityInput,
  schemaFieldOrder: string[] | undefined,
  opts: RenderOpts = {}
): string {
  const snapshot = entity.snapshot ?? {};
  const displayName = getEntityDisplayName({
    entity_type: entity.entity_type,
    canonical_name:
      (snapshot.canonical_name as string | undefined) ?? entity.entity_id,
    snapshot,
  });

  const parts: string[] = [];

  if (opts.includeDoNotEditHeader !== false) {
    parts.push(DO_NOT_EDIT_NOTICE);
  }
  parts.push(
    frontmatter([
      ["entity_id", entity.entity_id],
      ["entity_type", entity.entity_type],
      ["schema_version", entity.schema_version],
      ["last_observation_at", entity.last_observation_at ?? ""],
      ["observation_count", entity.observation_count ?? 0],
      ["computed_at", entity.computed_at ?? ""],
    ])
  );
  parts.push(`# ${displayName}`);

  const orderedKeys = orderedSnapshotKeys(snapshot, schemaFieldOrder ?? []);
  for (const key of orderedKeys) {
    const value = snapshot[key];
    if (value === undefined) continue;
    parts.push(`## ${key}`);
    parts.push(formatFieldValueMarkdown(value));
  }

  if (opts.includeProvenance && entity.provenance && Object.keys(entity.provenance).length > 0) {
    parts.push("## provenance");
    parts.push("| field | observation_id |");
    parts.push("| --- | --- |");
    const sortedFields = Object.keys(entity.provenance).sort();
    for (const f of sortedFields) {
      parts.push(`| ${f} | ${entity.provenance[f]} |`);
    }
  }

  return parts.join("\n\n") + "\n";
}

/**
 * Compact text variant for MCP `retrieve_entity_snapshot` text output.
 *
 * Dense, single section per field, no markdown code fences for nested values
 * (they are canonical JSON). Deterministic across reruns so LLM KV caches
 * remain stable.
 */
export function renderEntityCompactText(
  entity: RenderEntityInput,
  schemaFieldOrder: string[] | undefined,
  opts: RenderOpts = {}
): string {
  const snapshot = entity.snapshot ?? {};
  const displayName = getEntityDisplayName({
    entity_type: entity.entity_type,
    canonical_name:
      (snapshot.canonical_name as string | undefined) ?? entity.entity_id,
    snapshot,
  });
  const lines: string[] = [];
  lines.push(`# ${displayName}`);
  lines.push(`entity_id: ${entity.entity_id}`);
  lines.push(`entity_type: ${entity.entity_type}`);
  lines.push(`schema_version: ${entity.schema_version}`);
  if (entity.last_observation_at) {
    lines.push(`last_observation_at: ${entity.last_observation_at}`);
  }
  if (typeof entity.observation_count === "number") {
    lines.push(`observation_count: ${entity.observation_count}`);
  }

  const orderedKeys = orderedSnapshotKeys(snapshot, schemaFieldOrder ?? []);
  if (orderedKeys.length > 0) lines.push("");
  for (const key of orderedKeys) {
    const value = snapshot[key];
    if (value === undefined) continue;
    lines.push(`${key}: ${formatFieldValueCompact(value, opts.maxFieldChars)}`);
  }

  if (opts.includeProvenance && entity.provenance && Object.keys(entity.provenance).length > 0) {
    lines.push("");
    lines.push("provenance:");
    const sortedFields = Object.keys(entity.provenance).sort();
    for (const f of sortedFields) {
      lines.push(`  ${f}: ${entity.provenance[f]}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ============================================================================
// Relationship renderer
// ============================================================================

export function renderRelationshipMarkdown(
  rel: RenderRelationshipInput,
  opts: RenderOpts = {}
): string {
  const snapshot = rel.snapshot ?? {};
  const sourceLabel = resolveEntityLabel(rel.source_entity_id, opts);
  const targetLabel = resolveEntityLabel(rel.target_entity_id, opts);

  const parts: string[] = [];
  if (opts.includeDoNotEditHeader !== false) parts.push(DO_NOT_EDIT_NOTICE);
  parts.push(
    frontmatter([
      ["relationship_key", rel.relationship_key],
      ["relationship_type", rel.relationship_type],
      ["source_entity_id", rel.source_entity_id],
      ["target_entity_id", rel.target_entity_id],
      ["schema_version", rel.schema_version ?? ""],
      ["last_observation_at", rel.last_observation_at ?? ""],
      ["observation_count", rel.observation_count ?? 0],
      ["computed_at", rel.computed_at ?? ""],
    ])
  );
  parts.push(`# ${sourceLabel} — ${rel.relationship_type} → ${targetLabel}`);

  const orderedKeys = orderedSnapshotKeys(snapshot, []);
  for (const key of orderedKeys) {
    const value = snapshot[key];
    if (value === undefined) continue;
    parts.push(`## ${key}`);
    parts.push(formatFieldValueMarkdown(value));
  }

  if (opts.includeProvenance && rel.provenance && Object.keys(rel.provenance).length > 0) {
    parts.push("## provenance");
    parts.push("| field | observation_id |");
    parts.push("| --- | --- |");
    const sortedFields = Object.keys(rel.provenance).sort();
    for (const f of sortedFields) {
      parts.push(`| ${f} | ${rel.provenance[f]} |`);
    }
  }

  return parts.join("\n\n") + "\n";
}

function resolveEntityLabel(entityId: string, opts: RenderOpts): string {
  if (!opts.resolveEntityDisplay) return entityId;
  const input = opts.resolveEntityDisplay(entityId);
  if (!input) return entityId;
  return `${getEntityDisplayName(input)} (${entityId})`;
}

// ============================================================================
// Source renderer
// ============================================================================

export function renderSourceMarkdown(
  source: RenderSourceInput,
  opts: RenderOpts = {}
): string {
  const parts: string[] = [];
  if (opts.includeDoNotEditHeader !== false) parts.push(DO_NOT_EDIT_NOTICE);
  parts.push(
    frontmatter([
      ["source_id", source.id],
      ["source_type", source.source_type],
      ["mime_type", source.mime_type],
      ["file_name", source.file_name ?? source.original_filename ?? ""],
      ["byte_size", source.byte_size ?? 0],
      ["content_hash", source.content_hash],
      ["storage_status", source.storage_status ?? ""],
      ["created_at", source.created_at ?? ""],
      ["source_agent_id", source.source_agent_id ?? ""],
    ])
  );

  const displayName =
    getRecordDisplaySummary("sources", {
      original_filename: source.original_filename,
      file_name: source.file_name,
      mime_type: source.mime_type,
    }) || source.id;

  parts.push(`# ${displayName}`);

  const rawUrl = opts.apiBase
    ? `${opts.apiBase.replace(/\/+$/, "")}/sources/${source.id}/content`
    : `/sources/${source.id}/content`;
  parts.push(`## raw content`);
  parts.push(`[View raw content](${rawUrl})`);

  if (source.source_metadata && Object.keys(source.source_metadata).length > 0) {
    parts.push(`## source_metadata`);
    parts.push("```json\n" + canonicalStringify(source.source_metadata, 2) + "\n```");
  }

  return parts.join("\n\n") + "\n";
}

// ============================================================================
// Timeline day renderer
// ============================================================================

export function renderTimelineDayMarkdown(
  date: string,
  events: RenderTimelineEventInput[],
  opts: RenderOpts = {}
): string {
  const parts: string[] = [];
  if (opts.includeDoNotEditHeader !== false) parts.push(DO_NOT_EDIT_NOTICE);
  parts.push(
    frontmatter([
      ["date", date],
      ["event_count", events.length],
    ])
  );
  parts.push(`# Timeline — ${date}`);

  const sorted = [...events].sort((a, b) => {
    const ta = a.event_timestamp ?? "";
    const tb = b.event_timestamp ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.event_type !== b.event_type) return a.event_type < b.event_type ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const evt of sorted) {
    const title =
      getRecordDisplaySummary("timeline_events", {
        metadata: evt.metadata ?? undefined,
        event_type: evt.event_type,
        event_timestamp: evt.event_timestamp,
      }) || evt.event_type;

    parts.push(`## ${evt.event_timestamp} — ${evt.event_type}`);
    parts.push(`- **summary:** ${title}`);
    parts.push(`- **event_id:** ${evt.id}`);
    if (evt.source_id) parts.push(`- **source_id:** ${evt.source_id}`);
    if (evt.source_field) parts.push(`- **source_field:** ${evt.source_field}`);
    if (evt.entity_ids && evt.entity_ids.length > 0) {
      const sortedIds = [...evt.entity_ids].sort();
      parts.push(`- **entity_ids:** ${sortedIds.join(", ")}`);
    }
    if (evt.metadata && Object.keys(evt.metadata).length > 0) {
      parts.push("```json\n" + canonicalStringify(evt.metadata, 2) + "\n```");
    }
  }

  return parts.join("\n\n") + "\n";
}

// ============================================================================
// Schema renderer
// ============================================================================

export function renderSchemaMarkdown(
  schema: RenderSchemaInput,
  opts: RenderOpts = {}
): string {
  const parts: string[] = [];
  if (opts.includeDoNotEditHeader !== false) parts.push(DO_NOT_EDIT_NOTICE);
  parts.push(
    frontmatter([
      ["entity_type", schema.entity_type],
      ["schema_version", schema.schema_version],
      ["active", schema.active === undefined ? "" : String(schema.active)],
      ["category", schema.metadata?.category ?? ""],
      ["created_at", schema.created_at ?? ""],
    ])
  );
  const label = schema.metadata?.label ?? schema.entity_type;
  parts.push(`# Schema: ${label}`);

  if (schema.metadata?.description) {
    parts.push(schema.metadata.description);
  }

  const fields = schema.schema_definition?.fields ?? {};
  const fieldNames = Object.keys(fields).sort();

  parts.push("## fields");
  parts.push("| name | type | required | description |");
  parts.push("| --- | --- | --- | --- |");
  for (const name of fieldNames) {
    const f = fields[name];
    const req = f.required ? "yes" : "no";
    const desc = (f.description ?? "").replace(/\|/g, "\\|");
    parts.push(`| ${name} | ${f.type} | ${req} | ${desc} |`);
  }

  return parts.join("\n\n") + "\n";
}

// ============================================================================
// Index-page helper (used by mirror subsystem)
// ============================================================================

export function renderIndexMarkdown(
  title: string,
  entries: Array<{ label: string; href: string; summary?: string }>,
  opts: RenderOpts = {}
): string {
  const parts: string[] = [];
  if (opts.includeDoNotEditHeader !== false) parts.push(DO_NOT_EDIT_NOTICE);
  parts.push(`# ${title}`);

  if (entries.length === 0) {
    parts.push("_(no entries)_");
    return parts.join("\n\n") + "\n";
  }

  const sorted = [...entries].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const lines: string[] = [];
  for (const e of sorted) {
    lines.push(
      e.summary ? `- [${e.label}](${e.href}) — ${e.summary}` : `- [${e.label}](${e.href})`
    );
  }
  parts.push(lines.join("\n"));
  return parts.join("\n\n") + "\n";
}
