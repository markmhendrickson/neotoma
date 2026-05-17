/**
 * Render a single doc page from `docs/<slug>.md`.
 *
 * Slugs are URL-safe paths under `docs/`, with no `.md` suffix. E.g.
 *   - `/docs/foundation/core_identity` → `docs/foundation/core_identity.md`
 *   - `/docs/NEOTOMA_MANIFEST` → `docs/NEOTOMA_MANIFEST.md`
 *
 * Slug sanitization rejects `..`, absolute paths, non-`.md` resolved targets,
 * and any character outside `[A-Za-z0-9_\-./]`. The resolved absolute path
 * must stay strictly under `docsRoot` (defense-in-depth against traversal).
 */

import fs from "node:fs";
import path from "node:path";
import { resolveFrontmatter, splitFrontmatter, type DocFrontmatter } from "./doc_frontmatter.js";
import { renderMarkdown } from "./markdown_render.js";
import { isVisible, type VisibilityEnv } from "./visibility.js";

const SLUG_RE = /^[A-Za-z0-9_./-]+$/;

export interface ResolvedDoc {
  slug: string;
  repo_path: string;
  frontmatter: DocFrontmatter;
  html: string;
  body: string;
}

export type DocLookupError =
  | { kind: "invalid_slug"; reason: string }
  | { kind: "not_found" }
  | { kind: "hidden" };

export interface DocLookupResult {
  ok: true;
  doc: ResolvedDoc;
}

export interface DocLookupFailure {
  ok: false;
  error: DocLookupError;
}

export function lookupDoc(
  slug: string,
  opts: { docsRoot: string; env: VisibilityEnv; manifestEntries?: Map<string, { status?: string }> },
): DocLookupResult | DocLookupFailure {
  const { docsRoot, env, manifestEntries } = opts;
  // Strip leading / trailing slashes; reject empty.
  const trimmed = slug.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return { ok: false, error: { kind: "invalid_slug", reason: "empty" } };
  // Reject traversal and disallowed characters.
  if (trimmed.includes("..")) {
    return { ok: false, error: { kind: "invalid_slug", reason: "traversal" } };
  }
  if (!SLUG_RE.test(trimmed)) {
    return { ok: false, error: { kind: "invalid_slug", reason: "charset" } };
  }
  // Reject if slug already includes `.md` extension or any other extension.
  if (/\.[A-Za-z0-9]+$/.test(trimmed)) {
    return { ok: false, error: { kind: "invalid_slug", reason: "extension" } };
  }

  const rel = `${trimmed}.md`;
  const abs = path.resolve(docsRoot, rel);
  const docsRootResolved = path.resolve(docsRoot);
  // Defense-in-depth: ensure resolved path is strictly within docsRoot.
  if (abs !== docsRootResolved && !abs.startsWith(docsRootResolved + path.sep)) {
    return { ok: false, error: { kind: "invalid_slug", reason: "outside_root" } };
  }
  // Reject any file under `docs/private/` regardless of visibility flag.
  const relFromRoot = path.relative(docsRootResolved, abs).split(path.sep).join("/");
  if (relFromRoot.startsWith("private/")) {
    return { ok: false, error: { kind: "not_found" } };
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return { ok: false, error: { kind: "not_found" } };
  }

  const source = fs.readFileSync(abs, "utf-8");
  const manifestEntry = manifestEntries?.get(`docs/${relFromRoot}`);
  const frontmatter = resolveFrontmatter(relFromRoot, source, manifestEntry);
  if (!isVisible(frontmatter, env)) {
    return { ok: false, error: { kind: "hidden" } };
  }

  const { body } = splitFrontmatter(source);
  const html = renderMarkdown(body);
  return {
    ok: true,
    doc: {
      slug: trimmed,
      repo_path: `docs/${relFromRoot}`,
      frontmatter,
      html,
      body,
    },
  };
}
