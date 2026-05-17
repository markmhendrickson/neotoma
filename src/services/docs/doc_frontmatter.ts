/**
 * Doc frontmatter schema, inference rules, and parser for the `/docs` index.
 *
 * Each markdown file under `docs/**` may declare a leading YAML frontmatter
 * block. All fields are optional; missing fields are inferred from the path,
 * the first `# H1`, and the `docs/site/site_doc_manifest.yaml` entries.
 *
 * Determinism: inference is a pure function of (relative path, raw markdown
 * source, manifest entries). No `Date.now()` / `Math.random()`.
 */

export type DocVisibility = "public" | "internal";
export type DocAudience = "developer" | "operator" | "agent" | "user";

export interface DocFrontmatter {
  /** Display title. Defaults to first H1, else humanized filename. */
  title: string;
  /** One-line summary. Defaults to first non-empty paragraph (truncated). */
  summary: string;
  /** Top-level category slug from `site_doc_manifest.yaml#categories`. */
  category: string;
  /** Optional subcategory slug. */
  subcategory: string | null;
  /** Sort order within (sub)category. Lower = earlier. Default 100. */
  order: number;
  /** Whether this doc is in the curated featured list. Display-only. */
  featured: boolean;
  /** Visibility gate. `internal` docs 404 unless show-internal env is set. */
  visibility: DocVisibility;
  /** Intended reader. */
  audience: DocAudience;
  /** Free-form tags for search. */
  tags: string[];
  /** ISO date (YYYY-MM-DD) of last human review; null when unknown. */
  last_reviewed: string | null;
}

export interface RawDocFrontmatter {
  title?: unknown;
  summary?: unknown;
  category?: unknown;
  subcategory?: unknown;
  order?: unknown;
  featured?: unknown;
  visibility?: unknown;
  audience?: unknown;
  tags?: unknown;
  last_reviewed?: unknown;
}

const FRONTMATTER_FENCE = "---";

/** Strip a leading YAML frontmatter block. Returns the raw YAML and body. */
export function splitFrontmatter(source: string): {
  yaml: string | null;
  body: string;
} {
  if (!source.startsWith(FRONTMATTER_FENCE + "\n") && source !== FRONTMATTER_FENCE) {
    return { yaml: null, body: source };
  }
  const rest = source.slice(FRONTMATTER_FENCE.length + 1);
  const endIdx = rest.indexOf("\n" + FRONTMATTER_FENCE + "\n");
  const endIdxNoTrail = rest.endsWith("\n" + FRONTMATTER_FENCE)
    ? rest.length - (FRONTMATTER_FENCE.length + 1)
    : -1;
  const cut = endIdx >= 0 ? endIdx : endIdxNoTrail;
  if (cut < 0) return { yaml: null, body: source };
  const yaml = rest.slice(0, cut);
  const after = rest.slice(cut + ("\n" + FRONTMATTER_FENCE + "\n").length);
  return { yaml, body: after };
}

/**
 * Minimal YAML scalar/list parser for the frontmatter shape we support.
 *
 * We do NOT take a dep on `gray-matter` for the v0 of this route: frontmatter
 * is restricted to flat key-value pairs with primitives or bracketed string
 * lists (`tags: [a, b, c]`). Anything more exotic falls back to undefined and
 * is filled by inference.
 */
export function parseFlatYaml(yaml: string): RawDocFrontmatter {
  const out: Record<string, unknown> = {};
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.trimStart().startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const rawVal = m[2];
    out[key] = parseScalarOrList(rawVal);
  }
  return out as RawDocFrontmatter;
}

function parseScalarOrList(raw: string): unknown {
  const v = raw.trim();
  if (v === "") return "";
  if (v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number.parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return Number.parseFloat(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((s) => stripQuotes(s.trim()));
  }
  return stripQuotes(v);
}

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Folder → default category & visibility table. Single source of truth. */
export const FOLDER_DEFAULTS: ReadonlyArray<{
  prefix: string;
  category: string;
  subcategory?: string;
  visibility: DocVisibility;
  audience: DocAudience;
}> = [
  { prefix: "foundation", category: "foundation", visibility: "public", audience: "developer" },
  { prefix: "architecture", category: "architecture", visibility: "public", audience: "developer" },
  { prefix: "subsystems", category: "architecture", subcategory: "subsystems", visibility: "public", audience: "developer" },
  { prefix: "developer/mcp", category: "api", subcategory: "mcp", visibility: "public", audience: "agent" },
  { prefix: "developer/cli_reference", category: "api", subcategory: "cli", visibility: "public", audience: "developer" },
  { prefix: "developer", category: "development", visibility: "public", audience: "developer" },
  { prefix: "conventions", category: "development", subcategory: "conventions", visibility: "public", audience: "developer" },
  { prefix: "testing", category: "development", subcategory: "testing", visibility: "public", audience: "developer" },
  { prefix: "migration", category: "development", subcategory: "migration", visibility: "public", audience: "developer" },
  { prefix: "observability", category: "operations", subcategory: "observability", visibility: "public", audience: "operator" },
  { prefix: "operations", category: "operations", visibility: "public", audience: "operator" },
  { prefix: "security", category: "operations", subcategory: "security", visibility: "public", audience: "operator" },
  { prefix: "infrastructure", category: "operations", subcategory: "infrastructure", visibility: "public", audience: "operator" },
  { prefix: "integrations", category: "integrations", visibility: "public", audience: "user" },
  { prefix: "use_cases", category: "use_cases", visibility: "public", audience: "user" },
  { prefix: "icp", category: "use_cases", subcategory: "icp", visibility: "public", audience: "user" },
  { prefix: "api", category: "api", visibility: "public", audience: "developer" },
  { prefix: "reference", category: "reference", visibility: "public", audience: "developer" },
  { prefix: "vocabulary", category: "reference", subcategory: "vocabulary", visibility: "public", audience: "developer" },
  { prefix: "legal", category: "reference", subcategory: "legal", visibility: "public", audience: "user" },
  { prefix: "specs", category: "architecture", subcategory: "specs", visibility: "public", audience: "developer" },
  { prefix: "feature_units", category: "releases", subcategory: "feature_units", visibility: "public", audience: "developer" },
  { prefix: "releases", category: "releases", visibility: "public", audience: "developer" },
  { prefix: "reports", category: "internal", subcategory: "reports", visibility: "internal", audience: "developer" },
  { prefix: "plans", category: "internal", subcategory: "plans", visibility: "internal", audience: "developer" },
  { prefix: "proposals", category: "internal", subcategory: "proposals", visibility: "internal", audience: "developer" },
  { prefix: "prototypes", category: "internal", subcategory: "prototypes", visibility: "internal", audience: "developer" },
  { prefix: "implementation", category: "internal", subcategory: "implementation", visibility: "internal", audience: "developer" },
  { prefix: "examples", category: "development", subcategory: "examples", visibility: "public", audience: "developer" },
  { prefix: "ui", category: "development", subcategory: "ui", visibility: "public", audience: "developer" },
  { prefix: "site", category: "development", subcategory: "site", visibility: "public", audience: "developer" },
  { prefix: "skills", category: "development", subcategory: "skills", visibility: "public", audience: "developer" },
  { prefix: "templates", category: "development", subcategory: "templates", visibility: "public", audience: "developer" },
  { prefix: "assets", category: "development", subcategory: "assets", visibility: "internal", audience: "developer" },
];

/** Match a `docs/`-relative path against `FOLDER_DEFAULTS`. */
export function resolveFolderDefaults(relPath: string): {
  category: string;
  subcategory: string | null;
  visibility: DocVisibility;
  audience: DocAudience;
} {
  for (const rule of FOLDER_DEFAULTS) {
    if (relPath === rule.prefix + ".md" || relPath.startsWith(rule.prefix + "/")) {
      return {
        category: rule.category,
        subcategory: rule.subcategory ?? null,
        visibility: rule.visibility,
        audience: rule.audience,
      };
    }
  }
  return { category: "reference", subcategory: null, visibility: "public", audience: "developer" };
}

/** Extract the first H1 from a markdown body. */
export function extractFirstH1(body: string): string | null {
  const m = /^#\s+(.+?)\s*$/m.exec(body);
  return m ? m[1].trim() : null;
}

/** Extract the first non-empty paragraph (after H1, capped at 240 chars). */
export function extractFirstParagraph(body: string): string | null {
  const afterH1 = body.replace(/^#\s+.+?\n+/, "");
  const para = afterH1
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#") && !s.startsWith("```"));
  if (!para) return null;
  const oneLine = para.replace(/\s+/g, " ");
  return oneLine.length > 240 ? oneLine.slice(0, 237) + "..." : oneLine;
}

/** Humanize a filename slug (`core_identity` → `Core Identity`). */
export function humanizeFilename(name: string): string {
  return name
    .replace(/\.mdc?$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Fully resolve frontmatter for a doc. Pure function of inputs; deterministic.
 *
 * @param relPath  Path relative to `docs/` (POSIX, e.g. `architecture/architecture.md`).
 * @param source   Raw markdown source (frontmatter + body).
 * @param manifestEntry  Optional entry from `site_doc_manifest.yaml#entries`.
 */
export function resolveFrontmatter(
  relPath: string,
  source: string,
  manifestEntry?: { status?: string },
): DocFrontmatter {
  const { yaml, body } = splitFrontmatter(source);
  const raw = yaml ? parseFlatYaml(yaml) : {};
  const defaults = resolveFolderDefaults(relPath);
  const h1 = extractFirstH1(body);
  const fileBase = relPath.split("/").pop() ?? relPath;

  const visibilityFromManifest =
    manifestEntry?.status === "internal_only" || manifestEntry?.status === "archive"
      ? "internal"
      : null;

  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : h1 ?? humanizeFilename(fileBase);

  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : (extractFirstParagraph(body) ?? "");

  const category =
    typeof raw.category === "string" && raw.category.trim()
      ? raw.category.trim()
      : defaults.category;

  const subcategory =
    typeof raw.subcategory === "string" && raw.subcategory.trim()
      ? raw.subcategory.trim()
      : defaults.subcategory;

  const order =
    typeof raw.order === "number" && Number.isFinite(raw.order)
      ? raw.order
      : fileBase.toLowerCase() === "readme.md" || fileBase.toLowerCase() === "index.md"
        ? 0
        : 100;

  const featured = raw.featured === true;

  const visibility: DocVisibility =
    raw.visibility === "public" || raw.visibility === "internal"
      ? (raw.visibility as DocVisibility)
      : (visibilityFromManifest ?? defaults.visibility);

  const audience: DocAudience =
    raw.audience === "developer" ||
    raw.audience === "operator" ||
    raw.audience === "agent" ||
    raw.audience === "user"
      ? (raw.audience as DocAudience)
      : defaults.audience;

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : [];

  const last_reviewed =
    typeof raw.last_reviewed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.last_reviewed)
      ? raw.last_reviewed
      : null;

  return {
    title,
    summary,
    category,
    subcategory,
    order,
    featured,
    visibility,
    audience,
    tags,
    last_reviewed,
  };
}
