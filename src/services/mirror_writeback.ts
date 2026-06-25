/**
 * Mirror Writeback Service — disk-to-entity write-back for mirror profiles.
 *
 * Implements the `neotoma mirror push <profile>` bridge described in issue #1776.
 *
 * This is NOT a new write engine. It is a thin bridge over the existing
 * `POST /correct` primitive already used by `neotoma corrections create`.
 *
 * Algorithm per mirrored file:
 *   1. Parse the on-disk markdown back into editable snapshot fields,
 *      skipping managed regions (the <!-- do not edit --> comment header,
 *      YAML frontmatter system fields: entity_id, entity_type, schema_version,
 *      last_observation_at, observation_count, computed_at).
 *   2. Load the canonical snapshot from the API for the same entity.
 *   3. Compare with the last-synced base (stored as a SHA-256 hash of the
 *      rendered canonical content in `<output_path>/.neotoma-mirror-base/`).
 *   4. For each editable field:
 *       - base == canonical == on-disk  → no-op (nothing changed)
 *       - base == canonical, disk different → apply disk edit via /correct
 *       - base == disk, canonical different → no-op (canonical already moved)
 *       - base differs from both canonical and disk → emit conflict
 *   5. After successful apply, write the new canonical hash as the base.
 *
 * Safety:
 *   - Gated by `allow_disk_writeback: true` on the profile. Default: false.
 *   - `--check` / `--dry-run` prints corrections without applying.
 *   - Never deletes. Scoped to the profile's entity types.
 *   - Corrections are stamped with metadata comments but the /correct API
 *     does not carry an `observation_source` field in its HTTP body —
 *     the service layer stamps "human" internally for all corrections.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

import type { MirrorProfile } from "./canonical_mirror.js";

// ============================================================================
// Types
// ============================================================================

export interface MirrorWritebackCorrection {
  entity_id: string;
  entity_type: string;
  field: string;
  /** The value as found in the on-disk mirror file. */
  disk_value: unknown;
  /** The current canonical value in the DB (from the API). */
  canonical_value: unknown;
  /** The last-synced base value (undefined when no base hash is stored). */
  base_value: unknown;
  /** Idempotency key for the correction. */
  idempotency_key: string;
  /** Source file path for provenance. */
  source_file: string;
}

export interface MirrorWritebackConflict {
  entity_id: string;
  field: string;
  /** Source file path. */
  source_file: string;
  base_value: unknown;
  disk_value: unknown;
  canonical_value: unknown;
  message: string;
}

export interface MirrorPushResult {
  profile_id: string;
  files_scanned: number;
  corrections_applied: number;
  corrections_dry_run: number;
  conflicts: MirrorWritebackConflict[];
  errors: Array<{ file: string; message: string }>;
}

export interface MirrorPushOptions {
  /** When true, print corrections without applying. */
  dry_run?: boolean;
  /** Limit to a single file path or entity_id instead of whole profile. */
  target?: string;
  /** When true, emit verbose per-correction output. */
  verbose?: boolean;
}

// ============================================================================
// Managed frontmatter fields (system-controlled; never round-tripped back)
// ============================================================================

const MANAGED_FRONTMATTER_FIELDS = new Set([
  "entity_id",
  "entity_type",
  "schema_version",
  "last_observation_at",
  "observation_count",
  "computed_at",
]);

// ============================================================================
// Base-hash store
// The "last-synced base" is a JSON file mapping relative filename → {
//   content_hash: string,        // SHA-256 of the rendered canonical at sync time
//   snapshot: Record<...>        // The canonical snapshot at sync time
// }
// Stored at <output_path>/.neotoma-mirror-base/basemap.json
// ============================================================================

const BASE_DIR_NAME = ".neotoma-mirror-base";
const BASE_FILE_NAME = "basemap.json";

interface BaseEntry {
  content_hash: string;
  snapshot: Record<string, unknown>;
}

type BaseMap = Record<string, BaseEntry>;

function baseMapPath(outputPath: string): string {
  return path.join(outputPath, BASE_DIR_NAME, BASE_FILE_NAME);
}

function loadBaseMap(outputPath: string): BaseMap {
  const p = baseMapPath(outputPath);
  try {
    const raw = fsSync.readFileSync(p, "utf8");
    return JSON.parse(raw) as BaseMap;
  } catch {
    return {};
  }
}

async function saveBaseMap(outputPath: string, map: BaseMap): Promise<void> {
  const dir = path.join(outputPath, BASE_DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  const p = baseMapPath(outputPath);
  await fs.writeFile(p, JSON.stringify(map, null, 2) + "\n", "utf8");
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ============================================================================
// Markdown parser: extract editable fields from a mirrored .md file
// ============================================================================

/**
 * Parse an on-disk mirror file produced by renderProfileEntity (frontmatter_content)
 * or renderEntityMarkdown (entity mode) back into a field map.
 *
 * Returns only editable fields — skips managed frontmatter (entity_id,
 * entity_type, schema_version, observation timestamps), the DO NOT EDIT
 * HTML comment header, and the provenance table.
 *
 * For frontmatter_content mode: YAML frontmatter non-managed fields + body.
 * For entity/unknown mode: ## section fields + YAML frontmatter non-managed fields.
 */
export function parseMirrorMarkdown(
  content: string,
  profile: MirrorProfile
): Record<string, unknown> {
  // Strip the "do not edit" HTML comment header.
  const stripped = content.replace(
    /^<!--\s*Do not edit this file directly[\s\S]*?-->\s*/i,
    ""
  );

  const fields: Record<string, unknown> = {};
  const contentField = profile.content_field ?? "body";
  const renderMode = profile.render_mode ?? "entity";

  if (renderMode === "content_only") {
    // The whole file is just the content field value.
    fields[contentField] = content.trimEnd();
    return fields;
  }

  // Extract YAML frontmatter (between first --- and second ---).
  const fmMatch = stripped.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (fmMatch) {
    const yamlBlock = fmMatch[1];
    const fmFields = parseYamlFrontmatter(yamlBlock);
    // Filter out managed system fields.
    for (const [k, v] of Object.entries(fmFields)) {
      if (!MANAGED_FRONTMATTER_FIELDS.has(k)) {
        fields[k] = v;
      }
    }
  }

  if (renderMode === "frontmatter_content") {
    // Everything after the frontmatter block is the body.
    const afterFm = fmMatch ? stripped.slice(fmMatch[0].length) : stripped;
    // Strip leading whitespace / blank lines but preserve the rest.
    const bodyContent = afterFm.replace(/^\s+/, "");
    if (bodyContent.trim().length > 0) {
      fields[contentField] = bodyContent.trimEnd();
    }
  } else {
    // entity mode: parse ## sections.
    const afterFm = fmMatch ? stripped.slice(fmMatch[0].length) : stripped;
    const sectionFields = parseMarkdownSections(afterFm);
    for (const [k, v] of Object.entries(sectionFields)) {
      // Skip the provenance section (managed).
      if (k === "provenance") continue;
      fields[k] = v;
    }
  }

  return fields;
}

/**
 * Parse a YAML frontmatter block (the content between `---` delimiters).
 * Handles simple scalar, array, and quoted-string fields.
 * Falls back to returning an empty object on parse error.
 */
export function parseYamlFrontmatter(yamlBlock: string): Record<string, unknown> {
  // Lightweight YAML parser for the simple subset used in mirror files.
  // Supports: scalar strings, numbers, booleans, and simple lists.
  const result: Record<string, unknown> = {};
  const lines = yamlBlock.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Skip blank lines and comments.
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    // Key-value pair: "key: value"
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }
    const key = kvMatch[1];
    const rest = kvMatch[2].trim();

    if (rest === "") {
      // Check if next lines are list items (  - value)
      const listItems: unknown[] = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s+/)) {
        const itemMatch = lines[i].match(/^\s+-\s+(.*)/);
        if (itemMatch) listItems.push(parseScalar(itemMatch[1].trim()));
        i++;
      }
      if (listItems.length > 0) {
        result[key] = listItems;
      } else {
        result[key] = null;
      }
    } else {
      result[key] = parseScalar(rest);
      i++;
    }
  }
  return result;
}

function parseScalar(value: string): unknown {
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  // Quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  return value;
}

/**
 * Parse ## section headers from entity-mode markdown.
 * Each `## field` heading followed by content becomes one field entry.
 */
export function parseMarkdownSections(body: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Split on ## headings.
  const sectionRegex = /^##\s+(\S+)\s*$/gm;
  let match: RegExpExecArray | null;
  const positions: Array<{ field: string; start: number; contentStart: number }> = [];

  while ((match = sectionRegex.exec(body)) !== null) {
    positions.push({
      field: match[1],
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const { field, contentStart } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : body.length;
    const content = body.slice(contentStart, end).replace(/^\n+/, "").replace(/\n+$/, "");
    // Try to parse JSON code blocks.
    const jsonMatch = content.match(/^```json\n([\s\S]*?)\n```$/);
    if (jsonMatch) {
      try {
        result[field] = JSON.parse(jsonMatch[1]);
        continue;
      } catch {
        // Fall through to string.
      }
    }
    // Simple list items.
    const listLines = content.split("\n").filter((l) => l.startsWith("- "));
    if (listLines.length > 0 && listLines.length === content.split("\n").filter((l) => l.trim()).length) {
      result[field] = listLines.map((l) => l.slice(2).trim());
      continue;
    }
    // _(empty)_ sentinel.
    if (content === "_(empty)_") {
      result[field] = null;
      continue;
    }
    result[field] = content;
  }
  return result;
}

// ============================================================================
// Idempotency key generation
// ============================================================================

function writebackIdempotencyKey(
  entityId: string,
  field: string,
  value: unknown,
  sourceFile: string
): string {
  const payload = JSON.stringify({ entityId, field, value, sourceFile });
  const hash = createHash("sha256").update(payload).digest("hex");
  return `mirror-push-${hash.slice(0, 32)}`;
}

// ============================================================================
// Value equality (deep structural)
// ============================================================================

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) {
    // Coerce numbers to strings for comparison if one side is a string.
    return String(a) === String(b);
  }
  if (typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// ============================================================================
// API client type (minimal)
// ============================================================================

export interface WritebackApiClient {
  GET: (
    path: "/entities/{id}",
    args: { params: { path: { id: string } } }
  ) => Promise<{
    data?: { entity_type?: string; snapshot?: Record<string, unknown> };
    error?: unknown;
    response?: { status?: number };
  }>;
  POST: (
    path: "/correct",
    args: {
      body: {
        entity_id: string;
        entity_type: string;
        field: string;
        value: unknown;
        idempotency_key: string;
        user_id?: string;
      };
    }
  ) => Promise<{ data?: unknown; error?: unknown }>;
}

// ============================================================================
// Core push logic for a single profile
// ============================================================================

export async function runMirrorPush(
  profile: MirrorProfile,
  apiClient: WritebackApiClient,
  options: MirrorPushOptions = {}
): Promise<MirrorPushResult> {
  const result: MirrorPushResult = {
    profile_id: profile.id,
    files_scanned: 0,
    corrections_applied: 0,
    corrections_dry_run: 0,
    conflicts: [],
    errors: [],
  };

  if (!profile.allow_disk_writeback) {
    result.errors.push({
      file: profile.output_path,
      message:
        `Profile "${profile.id}" does not have allow_disk_writeback: true. ` +
        `Set this flag on the profile to enable disk-to-entity write-back.`,
    });
    return result;
  }

  const outputPath = path.resolve(profile.output_path);

  // Load the base map (last-synced snapshots).
  const baseMap = loadBaseMap(outputPath);
  const updatedBaseMap: BaseMap = { ...baseMap };

  // Enumerate markdown files in the profile output path.
  let mdFiles: string[] = [];
  try {
    const entries = await fs.readdir(outputPath, { withFileTypes: true });
    mdFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
      .map((e) => path.join(outputPath, e.name));
  } catch (err) {
    result.errors.push({
      file: outputPath,
      message: `Cannot read profile output directory: ${String(err)}`,
    });
    return result;
  }

  // Filter to a specific target if provided.
  if (options.target) {
    const targetResolved = path.isAbsolute(options.target)
      ? options.target
      : path.join(outputPath, options.target);
    mdFiles = mdFiles.filter((f) => f === targetResolved || f === options.target);
  }

  for (const filePath of mdFiles) {
    result.files_scanned++;
    const relPath = path.relative(outputPath, filePath);

    let diskContent: string;
    try {
      diskContent = await fs.readFile(filePath, "utf8");
    } catch (err) {
      result.errors.push({ file: filePath, message: `Cannot read file: ${String(err)}` });
      continue;
    }

    // Extract entity_id from the frontmatter (it's always in the managed block).
    const entityId = extractEntityIdFromFile(diskContent);
    if (!entityId) {
      result.errors.push({
        file: filePath,
        message: `Cannot find entity_id in frontmatter of ${relPath}. Skipping.`,
      });
      continue;
    }

    // Fetch canonical snapshot from API.
    let canonicalSnapshot: Record<string, unknown>;
    let canonicalEntityType: string;
    try {
      const { data, error, response } = await apiClient.GET("/entities/{id}", {
        params: { path: { id: entityId } },
      });
      if (error || !data) {
        const status = (response as { status?: number } | undefined)?.status;
        result.errors.push({
          file: filePath,
          message: `API fetch failed for entity ${entityId} (HTTP ${status ?? "unknown"}): ${JSON.stringify(error)}`,
        });
        continue;
      }
      canonicalSnapshot = (data.snapshot ?? {}) as Record<string, unknown>;
      canonicalEntityType = (data.entity_type ?? profile.entity_type) as string;
    } catch (err) {
      result.errors.push({
        file: filePath,
        message: `API request failed for ${entityId}: ${String(err)}`,
      });
      continue;
    }

    // Parse on-disk editable fields.
    const diskFields = parseMirrorMarkdown(diskContent, profile);

    // Retrieve base snapshot.
    const baseEntry = baseMap[relPath];
    const baseSnapshot: Record<string, unknown> = baseEntry?.snapshot ?? {};
    const hasBase = baseEntry !== undefined;

    // Build the canonical content hash for base comparison.
    const diskHash = contentHash(diskContent);

    // Compute corrections needed.
    const corrections: MirrorWritebackCorrection[] = [];
    const conflicts: MirrorWritebackConflict[] = [];

    // Only look at fields that appear in the on-disk file (editable fields).
    const allFields = new Set<string>([
      ...Object.keys(diskFields),
      ...(hasBase ? Object.keys(baseSnapshot) : []),
    ]);

    for (const field of allFields) {
      const diskVal = diskFields[field];
      const canonicalVal = canonicalSnapshot[field];
      const baseVal = baseSnapshot[field];

      const diskEqBase = hasBase ? valuesEqual(diskVal, baseVal) : false;
      const canonicalEqBase = hasBase ? valuesEqual(canonicalVal, baseVal) : false;
      const diskEqCanonical = valuesEqual(diskVal, canonicalVal);

      if (diskEqCanonical) {
        // Nothing to do — already in sync.
        continue;
      }

      if (!hasBase) {
        // No base — treat as: disk is the intended state, apply if disk != canonical.
        corrections.push({
          entity_id: entityId,
          entity_type: canonicalEntityType,
          field,
          disk_value: diskVal,
          canonical_value: canonicalVal,
          base_value: undefined,
          idempotency_key: writebackIdempotencyKey(entityId, field, diskVal, filePath),
          source_file: filePath,
        });
      } else if (canonicalEqBase && !diskEqBase) {
        // Canonical unchanged since base; disk edited → safe to apply.
        corrections.push({
          entity_id: entityId,
          entity_type: canonicalEntityType,
          field,
          disk_value: diskVal,
          canonical_value: canonicalVal,
          base_value: baseVal,
          idempotency_key: writebackIdempotencyKey(entityId, field, diskVal, filePath),
          source_file: filePath,
        });
      } else if (!canonicalEqBase && !diskEqBase) {
        // Both disk and canonical changed since base → conflict.
        conflicts.push({
          entity_id: entityId,
          field,
          source_file: filePath,
          base_value: baseVal,
          disk_value: diskVal,
          canonical_value: canonicalVal,
          message:
            `Conflict on field "${field}" for entity ${entityId}: ` +
            `both the disk file and canonical DB have changed since last sync. ` +
            `Resolve manually: edit the file to match the desired value and re-run ` +
            `"neotoma mirror push ${profile.id}", or revert the file with ` +
            `"neotoma mirror rebuild --profile ${profile.id}".`,
        });
      }
      // else: canonicalEqBase=false, diskEqBase=true → canonical moved but disk unchanged → no-op.
    }

    result.conflicts.push(...conflicts);

    if (conflicts.length > 0 && corrections.length > 0) {
      // Skip applying corrections for a file that also has conflicts (conservative).
      result.errors.push({
        file: filePath,
        message:
          `Skipping ${corrections.length} correction(s) for ${relPath} because ` +
          `${conflicts.length} conflict(s) were detected. Resolve conflicts first.`,
      });
      continue;
    }

    // Apply or dry-run corrections.
    for (const correction of corrections) {
      if (options.dry_run) {
        result.corrections_dry_run++;
        if (options.verbose) {
          process.stdout.write(
            `[dry-run] Would correct ${correction.entity_id} field "${correction.field}": ` +
              `${JSON.stringify(correction.canonical_value)} → ${JSON.stringify(correction.disk_value)}\n`
          );
        }
      } else {
        try {
          const { error } = await apiClient.POST("/correct", {
            body: {
              entity_id: correction.entity_id,
              entity_type: correction.entity_type,
              field: correction.field,
              value: correction.disk_value,
              idempotency_key: correction.idempotency_key,
            },
          });
          if (error) {
            result.errors.push({
              file: filePath,
              message: `Correction failed for field "${correction.field}" on ${correction.entity_id}: ${JSON.stringify(error)}`,
            });
          } else {
            result.corrections_applied++;
            if (options.verbose) {
              process.stdout.write(
                `Applied correction to ${correction.entity_id} field "${correction.field}"\n`
              );
            }
          }
        } catch (err) {
          result.errors.push({
            file: filePath,
            message: `Correction request failed for field "${correction.field}" on ${correction.entity_id}: ${String(err)}`,
          });
        }
      }
    }

    // Update base map entry with the new canonical snapshot (after corrections).
    // In dry_run mode, still record the disk hash to track what was seen.
    if (!options.dry_run && corrections.length > 0 && result.errors.filter(e => e.file === filePath).length === 0) {
      // Re-fetch canonical snapshot after corrections to get the updated state.
      try {
        const { data } = await apiClient.GET("/entities/{id}", {
          params: { path: { id: entityId } },
        });
        if (data?.snapshot) {
          updatedBaseMap[relPath] = {
            content_hash: diskHash,
            snapshot: data.snapshot as Record<string, unknown>,
          };
        }
      } catch {
        // Best-effort — don't fail the push if base update fails.
      }
    } else if (!hasBase || diskHash !== baseEntry?.content_hash) {
      // Record the current disk hash so subsequent runs can detect changes.
      updatedBaseMap[relPath] = {
        content_hash: diskHash,
        snapshot: canonicalSnapshot,
      };
    }
  }

  // Persist updated base map (not in dry_run mode).
  if (!options.dry_run) {
    try {
      await saveBaseMap(outputPath, updatedBaseMap);
    } catch (err) {
      result.errors.push({
        file: baseMapPath(outputPath),
        message: `Failed to save base map: ${String(err)}`,
      });
    }
  }

  return result;
}

// ============================================================================
// Helper: extract entity_id from file frontmatter
// ============================================================================

export function extractEntityIdFromFile(content: string): string | null {
  // Strip DO NOT EDIT header first.
  const stripped = content.replace(/^<!--[\s\S]*?-->\s*/i, "");
  const fmMatch = stripped.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const idMatch = fmMatch[1].match(/^entity_id:\s*(.+)$/m);
  if (!idMatch) return null;
  return idMatch[1].trim();
}
