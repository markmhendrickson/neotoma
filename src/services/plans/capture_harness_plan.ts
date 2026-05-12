/**
 * Capture a harness-authored markdown plan file into Neotoma.
 *
 * Most modern AI coding harnesses write plans as `.plan.md` files with YAML
 * frontmatter (Cursor under `.cursor/plans/`, Claude Code under
 * `.claude/plans/`, Codex under `.codex/plans/`, OpenClaw under
 * `.openclaw/plans/`). This module:
 *
 *   1. Reads the file.
 *   2. Parses the YAML frontmatter and splits the markdown body.
 *   3. Detects the harness from the path heuristic.
 *   4. Derives `slug` and `harness_plan_id` from the filename stem.
 *   5. Builds a single combined `store` payload containing:
 *        - the raw markdown source (file_path/file_content + mime_type),
 *        - a structured `plan` row populated from frontmatter + body,
 *        - relationships linking the plan to the source file (EMBEDS) and,
 *          when supplied, to the prompting `conversation_message` (REFERS_TO).
 *
 * Returning the payload (rather than executing the store) keeps the helper
 * usable by both the CLI and the in-process server seeding paths and lets
 * tests assert on shape without an Operations stub.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

export type Harness = "cursor" | "claude_code" | "codex" | "openclaw" | "cli" | "agent" | "human" | "other";

const HARNESS_DIR_HINTS: Array<{ marker: string; harness: Harness }> = [
  { marker: `${path.sep}.cursor${path.sep}plans${path.sep}`, harness: "cursor" },
  { marker: `${path.sep}.claude${path.sep}plans${path.sep}`, harness: "claude_code" },
  { marker: `${path.sep}.codex${path.sep}plans${path.sep}`, harness: "codex" },
  { marker: `${path.sep}.openclaw${path.sep}plans${path.sep}`, harness: "openclaw" },
];

const FILENAME_STEM_RE = /^(?<slug>.+?)(?:_(?<hex>[0-9a-f]{6,12}))?\.plan\.md$/i;

export interface HarnessPlanFrontmatter {
  /** Plan title (often "name" in harness frontmatter). */
  name?: string;
  title?: string;
  overview?: string;
  /** Harness todo array; expected shape `[{ id, content, status }]`. */
  todos?: Array<{ id?: string; content?: string; status?: string }>;
  /** Cursor's `isProject` flag (boolean). */
  isProject?: boolean;
  /** Free-form additional fields are preserved on the entity payload. */
  [key: string]: unknown;
}

export interface ParsedPlan {
  frontmatter: HarnessPlanFrontmatter;
  body: string;
  raw: string;
}

export interface DerivedPlanIdentity {
  slug: string;
  harness: Harness;
  /** Filename hex suffix (e.g. Cursor `2d3bdfdc`); null when the filename has no suffix. */
  harness_plan_id: string | null;
  filename: string;
}

export interface CaptureHarnessPlanInput {
  /** Absolute or workspace-relative path to the `.plan.md` file. */
  file_path: string;
  /** Optional override of detected harness; defaults to path-based detection. */
  harness?: Harness;
  /** When this plan was created or referenced inside an active chat, supply the conversation entity_id. */
  conversation_entity_id?: string;
  /** When a specific message prompted the capture, supply its entity_id; emits REFERS_TO from message → plan. */
  source_message_entity_id?: string;
  /** Optional source-entity linkage (e.g. an `issue` entity_id this plan resolves). */
  source_entity_id?: string;
  source_entity_type?: string;
  /** Optional repository context. */
  repository_name?: string;
  repository_root?: string;
  /** Optional agent identifier (AAuth thumbprint, clientInfo.name). */
  agent_id?: string;
  /** ISO timestamp; defaults to file mtime, then `new Date().toISOString()`. */
  created_at?: string;
  /** Override the data_source provenance string. */
  data_source?: string;
}

export interface CapturedPlanPayload {
  /** A single combined `store` request body suitable for the canonical `store` operation. */
  storePayload: {
    entities: Array<Record<string, unknown>>;
    relationships?: Array<
      | { relationship_type: string; source_index: number; target_index: number }
      | { relationship_type: string; source_entity_id: string; target_entity_id: string }
      | { relationship_type: string; source_entity_id: string; target_index: number }
      | { relationship_type: string; source_index: number; target_entity_id: string }
    >;
    file_path: string;
    file_idempotency_key: string;
    idempotency_key: string;
  };
  identity: DerivedPlanIdentity;
  parsed: ParsedPlan;
}

/**
 * Detect the authoring harness from the file path. Falls back to "other".
 */
export function detectHarnessFromPath(filePath: string): Harness {
  const normalized = path.resolve(filePath);
  for (const { marker, harness } of HARNESS_DIR_HINTS) {
    if (normalized.includes(marker)) return harness;
  }
  return "other";
}

/**
 * Derive `slug` and `harness_plan_id` from a `.plan.md` filename.
 *
 * Examples:
 *   process-issues_skill_2d3bdfdc.plan.md → slug="process-issues_skill_2d3bdfdc", harness_plan_id="2d3bdfdc"
 *   site-react-tailwind-parity.plan.md   → slug="site-react-tailwind-parity",   harness_plan_id=null
 */
export function deriveIdentityFromFilename(filePath: string, harness: Harness): DerivedPlanIdentity {
  const filename = path.basename(filePath);
  const match = FILENAME_STEM_RE.exec(filename);
  if (!match || !match.groups) {
    const fallbackSlug = filename.replace(/\.plan\.md$/i, "").replace(/\.md$/i, "");
    return { slug: fallbackSlug, harness_plan_id: null, harness, filename };
  }
  const slugBase = match.groups.slug ?? "";
  const hex = match.groups.hex ?? null;
  const slug = hex ? `${slugBase}_${hex}` : slugBase;
  return { slug, harness_plan_id: hex, harness, filename };
}

/**
 * Parse a markdown file with optional YAML frontmatter delimited by `---` on
 * the first and a subsequent line. Frontmatter is optional; when absent,
 * `frontmatter` is `{}` and `body` is the full file.
 */
export function parsePlanMarkdown(raw: string): ParsedPlan {
  const trimmed = raw.replace(/^\uFEFF/, "");
  const lines = trimmed.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: trimmed, raw: trimmed };
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return { frontmatter: {}, body: trimmed, raw: trimmed };
  }
  const frontmatterRaw = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").replace(/^\n+/, "");
  let frontmatter: HarnessPlanFrontmatter = {};
  try {
    const loaded = yaml.load(frontmatterRaw);
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      frontmatter = loaded as HarnessPlanFrontmatter;
    }
  } catch {
    /* malformed frontmatter — treat as no frontmatter and keep body */
  }
  return { frontmatter, body, raw: trimmed };
}

function normalizeTodos(value: unknown): Array<{ id: string; content: string; status: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const content = typeof row.content === "string" ? row.content : "";
      const statusRaw = typeof row.status === "string" ? row.status : "pending";
      const status = ["pending", "in_progress", "completed", "cancelled"].includes(statusRaw)
        ? statusRaw
        : "pending";
      if (!id && !content) return null;
      return { id: id || content.slice(0, 32), content, status };
    })
    .filter((row): row is { id: string; content: string; status: string } => row !== null);
  return out.length > 0 ? out : undefined;
}

/**
 * Build a combined-store payload from a harness `.plan.md` file.
 *
 * The caller is expected to invoke `ops.store(result.storePayload)` (or the
 * HTTP `POST /store` equivalent). Keeping construction separate from
 * execution keeps the helper transport-agnostic.
 */
export async function captureHarnessPlan(
  input: CaptureHarnessPlanInput,
): Promise<CapturedPlanPayload> {
  const filePath = path.resolve(input.file_path);
  const fileStat = await fs.stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`captureHarnessPlan: not a file: ${filePath}`);
  }
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = parsePlanMarkdown(raw);
  const harness = input.harness ?? detectHarnessFromPath(filePath);
  const identity = deriveIdentityFromFilename(filePath, harness);

  const fm = parsed.frontmatter;
  const title =
    (typeof fm.name === "string" && fm.name.trim()) ||
    (typeof fm.title === "string" && fm.title.trim()) ||
    identity.slug;
  const createdAt = input.created_at ?? fileStat.mtime.toISOString();
  const todos = normalizeTodos(fm.todos);
  const isProject = typeof fm.isProject === "boolean" ? fm.isProject : undefined;
  const overview = typeof fm.overview === "string" && fm.overview.trim() ? fm.overview.trim() : undefined;

  const planEntity: Record<string, unknown> = {
    entity_type: "plan",
    title,
    slug: identity.slug,
    harness: identity.harness,
    plan_kind: "harness_plan",
    plan_file_path: filePath,
    overview,
    body: parsed.body,
    is_project: isProject,
    todos,
    status: "draft",
    created_at: createdAt,
    data_source:
      input.data_source ??
      `${identity.harness} harness plan file ${createdAt.slice(0, 10)}`,
  };
  if (identity.harness_plan_id) planEntity.harness_plan_id = identity.harness_plan_id;
  if (input.conversation_entity_id) planEntity.conversation_id_entity = input.conversation_entity_id;
  if (input.source_entity_id) planEntity.source_entity_id = input.source_entity_id;
  if (input.source_entity_type) planEntity.source_entity_type = input.source_entity_type;
  if (input.source_message_entity_id) planEntity.source_message_entity_id = input.source_message_entity_id;
  if (input.repository_name) planEntity.repository_name = input.repository_name;
  if (input.repository_root) planEntity.repository_root = input.repository_root;
  if (input.agent_id) planEntity.agent_id = input.agent_id;

  const entities: Array<Record<string, unknown>> = [planEntity];

  type RelEntry =
    | { relationship_type: string; source_index: number; target_index: number }
    | { relationship_type: string; source_entity_id: string; target_entity_id: string }
    | { relationship_type: string; source_entity_id: string; target_index: number }
    | { relationship_type: string; source_index: number; target_entity_id: string };
  const relationships: RelEntry[] = [];

  // The plan row is the structured interpretation; the file is the raw source.
  // The combined-store path produces a `file_asset` row whose entity_id is
  // returned in `unstructured.asset_entity_id` — link plan EMBEDS file there.
  // We can't index into it from the entities[] array, so the caller (skill /
  // CLI) appends EMBEDS via create_relationship after the store completes.
  // For the prompting-message → plan REFERS_TO edge we can use known ids.
  if (input.source_message_entity_id) {
    relationships.push({
      relationship_type: "REFERS_TO",
      source_entity_id: input.source_message_entity_id,
      target_index: 0,
    });
  }

  const idempotencyKey = `plan-capture-${identity.harness}-${identity.harness_plan_id ?? identity.slug}`;
  const fileIdempotencyKey = `plan-file-${identity.harness}-${identity.harness_plan_id ?? identity.slug}`;

  return {
    storePayload: {
      entities,
      ...(relationships.length > 0 ? { relationships } : {}),
      file_path: filePath,
      file_idempotency_key: fileIdempotencyKey,
      idempotency_key: idempotencyKey,
    },
    identity,
    parsed,
  };
}
