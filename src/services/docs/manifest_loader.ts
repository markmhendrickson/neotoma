/**
 * Load category tree + featured list + per-doc status entries from
 * `docs/site/site_doc_manifest.yaml`.
 *
 * This is a narrow YAML reader: the manifest is hand-authored and shape-stable,
 * so we accept a small set of structural patterns and ignore anything we don't
 * recognize. We do NOT take a YAML library dep just for this file; the
 * mdx-site-* scripts already use a similarly narrow approach.
 */

import fs from "node:fs";
import type { DocsManifest, DocsManifestCategory, DocsManifestSubcategory } from "./index_builder.js";

export interface ManifestEntry {
  repo_path: string;
  status?: string;
  canonical_site_path?: string;
}

export interface LoadedManifest {
  docs: DocsManifest;
  entries: Map<string, ManifestEntry>;
}

const EMPTY_MANIFEST: DocsManifest = { categories: [], featured: [] };

/** Indentation of a YAML line, in spaces. */
function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n += 1;
  return n;
}

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parse the manifest. Supported shapes (only what we author here):
 *
 *   entries:
 *     - repo_path: docs/foo.md
 *       status: canonical_site_page
 *       canonical_site_path: /foo
 *   categories:
 *     - key: foundation
 *       display_name: "Foundation"
 *       description: "..."
 *       order: 20
 *       subcategories:
 *         - key: subsystems
 *           display_name: "Subsystems"
 *           order: 30
 *   featured:
 *     - docs/foundation/core_identity.md
 *     - docs/architecture/architecture.md
 */
export function loadManifest(manifestPath: string): LoadedManifest {
  if (!fs.existsSync(manifestPath)) {
    return { docs: EMPTY_MANIFEST, entries: new Map() };
  }
  const lines = fs.readFileSync(manifestPath, "utf-8").replace(/\r\n/g, "\n").split("\n");

  // First pass: split into top-level sections by header name.
  // Top-level keys appear at indent 0 and end with `:`.
  const sectionLines: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of lines) {
    if (raw.startsWith("#")) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*:\s*$/.test(raw) && indentOf(raw) === 0) {
      current = raw.replace(/\s*:\s*$/, "").trim();
      sectionLines[current] = [];
      continue;
    }
    if (raw.match(/^[A-Za-z_][A-Za-z0-9_]*\s*:\s*\d+\s*$/) && indentOf(raw) === 0) {
      // top-level scalar like `version: 1` — ignore
      current = null;
      continue;
    }
    if (current) sectionLines[current].push(raw);
  }

  const entries = parseEntries(sectionLines.entries ?? []);
  const categories = parseCategories(sectionLines.categories ?? []);
  const featured = parseFeatured(sectionLines.featured ?? []);

  return {
    docs: { categories, featured },
    entries: new Map(entries.map((e) => [e.repo_path, e])),
  };
}

function parseEntries(lines: string[]): ManifestEntry[] {
  const out: ManifestEntry[] = [];
  let cur: Partial<ManifestEntry> | null = null;
  for (const raw of lines) {
    if (/^\s*-\s+repo_path:\s*/.test(raw)) {
      if (cur && cur.repo_path) out.push(cur as ManifestEntry);
      const v = raw.replace(/^\s*-\s+repo_path:\s*/, "").trim();
      cur = { repo_path: stripQuotes(v) };
      continue;
    }
    if (!cur) continue;
    const km = /^\s+([a-z_][a-z0-9_]*)\s*:\s*(.*)$/.exec(raw);
    if (km) {
      const key = km[1];
      const value = stripQuotes(km[2].trim());
      if (key === "status") cur.status = value;
      else if (key === "canonical_site_path") cur.canonical_site_path = value;
    }
  }
  if (cur && cur.repo_path) out.push(cur as ManifestEntry);
  return out;
}

function parseCategories(lines: string[]): DocsManifestCategory[] {
  const cats: DocsManifestCategory[] = [];
  let cur: Partial<DocsManifestCategory> | null = null;
  let curSubs: DocsManifestSubcategory[] | null = null;
  let inSubs = false;
  let curSub: Partial<DocsManifestSubcategory> | null = null;

  const flushSub = () => {
    if (curSub && curSub.key && curSubs) {
      curSubs.push({
        key: curSub.key,
        display_name: curSub.display_name ?? curSub.key,
        description: curSub.description,
        order: curSub.order ?? 100,
      });
    }
    curSub = null;
  };

  const flushCat = () => {
    flushSub();
    if (cur && cur.key) {
      cats.push({
        key: cur.key,
        display_name: cur.display_name ?? cur.key,
        description: cur.description,
        order: cur.order ?? 100,
        subcategories: curSubs ?? [],
      });
    }
    cur = null;
    curSubs = null;
    inSubs = false;
  };

  for (const raw of lines) {
    const ind = indentOf(raw);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // New top-level category: `  - key: foundation`
    if (ind === 2 && /^- key:\s*/.test(trimmed)) {
      flushCat();
      cur = { key: stripQuotes(trimmed.replace(/^- key:\s*/, "")) };
      curSubs = [];
      inSubs = false;
      continue;
    }
    // Property of category (indent 4): `    display_name: "..."`
    if (cur && ind === 4 && !inSubs) {
      const m = /^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (m) {
        const key = m[1];
        const value = m[2].trim();
        if (key === "subcategories") {
          inSubs = true;
          continue;
        }
        applyScalar(cur, key, value);
      }
      continue;
    }
    if (cur && inSubs) {
      // Subcategory item: `      - key: ...`
      if (ind === 6 && /^- key:\s*/.test(trimmed)) {
        flushSub();
        curSub = { key: stripQuotes(trimmed.replace(/^- key:\s*/, "")) };
        continue;
      }
      // Subcategory property: `        display_name: ...`
      if (curSub && ind === 8) {
        const m = /^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/.exec(trimmed);
        if (m) applyScalar(curSub, m[1], m[2].trim());
        continue;
      }
      // Dedented out of subcategories.
      if (ind <= 4) {
        flushSub();
        inSubs = false;
        // Re-process this line as a category property.
        const m = /^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/.exec(trimmed);
        if (m && cur) applyScalar(cur, m[1], m[2].trim());
        continue;
      }
    }
  }
  flushCat();
  return cats;
}

function applyScalar(
  target: Partial<DocsManifestCategory | DocsManifestSubcategory>,
  key: string,
  value: string,
) {
  const v = stripQuotes(value);
  if (key === "display_name") (target as { display_name?: string }).display_name = v;
  else if (key === "description") (target as { description?: string }).description = v;
  else if (key === "order") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) (target as { order?: number }).order = n;
  } else if (key === "key") {
    (target as { key?: string }).key = v;
  }
}

function parseFeatured(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const m = /^\s*-\s+(.+?)\s*$/.exec(raw);
    if (m) out.push(stripQuotes(m[1]));
  }
  return out;
}
