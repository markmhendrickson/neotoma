/**
 * Build the deterministic category tree consumed by `/docs`.
 *
 * Walks `docs/**` (excluding `docs/private/**` and `**\/archived/**`), resolves
 * frontmatter for each file, applies visibility filtering, and groups by
 * (category, subcategory). Sort order:
 *   category.order → subcategory.order → frontmatter.order → title.
 *
 * The category/subcategory display tree lives in
 * `docs/site/site_doc_manifest.yaml` under the top-level `categories:` key.
 * Per-doc `category` slugs reference that tree.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveFrontmatter, type DocFrontmatter } from "./doc_frontmatter.js";
import { isVisible, type VisibilityEnv } from "./visibility.js";

const SKIP_DIR_NAMES = new Set(["private", "node_modules", ".git", "archived", "generated"]);

export interface DocsManifestSubcategory {
  key: string;
  display_name: string;
  description?: string;
  order: number;
}

export interface DocsManifestCategory {
  key: string;
  display_name: string;
  description?: string;
  order: number;
  subcategories: DocsManifestSubcategory[];
}

export interface DocsManifest {
  categories: DocsManifestCategory[];
  featured: string[]; // repo-relative paths, e.g. "docs/foundation/core_identity.md"
}

export interface DocEntry {
  /** Slug used in URLs: `architecture/architecture` (no `docs/` prefix, no `.md`). */
  slug: string;
  /** Repo-relative path: `docs/architecture/architecture.md`. */
  repo_path: string;
  /** Resolved frontmatter (after inference). */
  frontmatter: DocFrontmatter;
}

export interface SubcategoryGroup {
  key: string;
  display_name: string;
  description: string | null;
  order: number;
  docs: DocEntry[];
}

export interface CategoryGroup {
  key: string;
  display_name: string;
  description: string | null;
  order: number;
  subcategories: SubcategoryGroup[];
  /** Docs in this category that declared no subcategory. */
  uncategorized: DocEntry[];
}

export interface DocsIndex {
  /** Deterministic, sorted category tree. */
  categories: CategoryGroup[];
  /** Curated featured entries, in manifest order. */
  featured: DocEntry[];
  /** Total doc count after visibility filtering. */
  total: number;
}

export interface BuildDocsIndexOptions {
  docsRoot: string;
  manifest: DocsManifest;
  env: VisibilityEnv;
  manifestEntries?: Map<string, { status?: string }>;
}

/** Recursive walker for markdown files under `docsRoot`. */
function collectMarkdownFiles(docsRoot: string): string[] {
  const out: string[] = [];
  const walk = (absDir: string, rel: string) => {
    if (!fs.existsSync(absDir)) return;
    for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(ent.name)) continue;
        walk(path.join(absDir, ent.name), rel ? `${rel}/${ent.name}` : ent.name);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        out.push(rel ? `${rel}/${ent.name}` : ent.name);
      }
    }
  };
  walk(docsRoot, "");
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function relToSlug(rel: string): string {
  return rel.replace(/\.md$/, "");
}

function compareDocs(a: DocEntry, b: DocEntry): number {
  if (a.frontmatter.order !== b.frontmatter.order) {
    return a.frontmatter.order - b.frontmatter.order;
  }
  return a.frontmatter.title.localeCompare(b.frontmatter.title);
}

export function buildDocsIndex(opts: BuildDocsIndexOptions): DocsIndex {
  const { docsRoot, manifest, env, manifestEntries } = opts;
  const files = collectMarkdownFiles(docsRoot);

  // Resolve all entries up front (single pass).
  const all: DocEntry[] = [];
  for (const rel of files) {
    const abs = path.join(docsRoot, rel);
    let source = "";
    try {
      source = fs.readFileSync(abs, "utf-8");
    } catch {
      continue;
    }
    const entry = manifestEntries?.get(`docs/${rel}`);
    const frontmatter = resolveFrontmatter(rel, source, entry);
    if (!isVisible(frontmatter, env)) continue;
    all.push({
      slug: relToSlug(rel),
      repo_path: `docs/${rel}`,
      frontmatter,
    });
  }

  // Index by (category, subcategory).
  const byCategory = new Map<string, Map<string | null, DocEntry[]>>();
  for (const doc of all) {
    const catKey = doc.frontmatter.category;
    const subKey = doc.frontmatter.subcategory;
    let bySub = byCategory.get(catKey);
    if (!bySub) {
      bySub = new Map();
      byCategory.set(catKey, bySub);
    }
    let list = bySub.get(subKey);
    if (!list) {
      list = [];
      bySub.set(subKey, list);
    }
    list.push(doc);
  }

  // Build groups using manifest-declared display ordering. Categories not
  // declared in the manifest are appended in alphabetical order so newly
  // added docs are still discoverable.
  const seenCatKeys = new Set<string>();
  const categories: CategoryGroup[] = [];

  for (const cat of manifest.categories) {
    seenCatKeys.add(cat.key);
    const bySub = byCategory.get(cat.key);
    if (!bySub) continue;
    const subSeen = new Set<string>();
    const subcategories: SubcategoryGroup[] = [];
    for (const sub of cat.subcategories) {
      subSeen.add(sub.key);
      const docs = bySub.get(sub.key);
      if (!docs || docs.length === 0) continue;
      docs.sort(compareDocs);
      subcategories.push({
        key: sub.key,
        display_name: sub.display_name,
        description: sub.description ?? null,
        order: sub.order,
        docs,
      });
    }
    // Append any undeclared subcategories alphabetically.
    const extraSubKeys: string[] = [];
    for (const k of bySub.keys()) {
      if (k && !subSeen.has(k)) extraSubKeys.push(k);
    }
    extraSubKeys.sort();
    for (const k of extraSubKeys) {
      const docs = bySub.get(k)!;
      docs.sort(compareDocs);
      subcategories.push({
        key: k,
        display_name: humanizeKey(k),
        description: null,
        order: 1000,
        docs,
      });
    }
    const uncategorized = (bySub.get(null) ?? []).slice().sort(compareDocs);
    categories.push({
      key: cat.key,
      display_name: cat.display_name,
      description: cat.description ?? null,
      order: cat.order,
      subcategories,
      uncategorized,
    });
  }
  // Append undeclared categories.
  const extraCatKeys: string[] = [];
  for (const k of byCategory.keys()) {
    if (!seenCatKeys.has(k)) extraCatKeys.push(k);
  }
  extraCatKeys.sort();
  for (const k of extraCatKeys) {
    const bySub = byCategory.get(k)!;
    const subKeys: string[] = [];
    for (const sk of bySub.keys()) if (sk) subKeys.push(sk);
    subKeys.sort();
    const subcategories: SubcategoryGroup[] = subKeys.map((sk) => {
      const docs = bySub.get(sk)!.slice().sort(compareDocs);
      return {
        key: sk,
        display_name: humanizeKey(sk),
        description: null,
        order: 1000,
        docs,
      };
    });
    const uncategorized = (bySub.get(null) ?? []).slice().sort(compareDocs);
    categories.push({
      key: k,
      display_name: humanizeKey(k),
      description: null,
      order: 1000,
      subcategories,
      uncategorized,
    });
  }

  // Featured: manifest order, filtered by visibility.
  const bySlug = new Map(all.map((d) => [d.repo_path, d]));
  const featured: DocEntry[] = [];
  for (const repoPath of manifest.featured) {
    const entry = bySlug.get(repoPath);
    if (entry) featured.push(entry);
  }

  return { categories, featured, total: all.length };
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}
