/**
 * Docs viewer build: lint every manifest entry, render the included ones to static pages.
 *
 * Called by `scripts/build_github_pages_site.tsx` (write mode, into site_pages/), by
 * `scripts/lint_docs_viewer.ts` and the copy lint (check mode), and by
 * `scripts/docs_viewer_preview.ts` (renders pending entries too, into a scratch directory).
 *
 * An `included` entry that is missing, excluded or fails the lint is a failure: the caller fails the
 * build. A `pending` entry is reported with its findings and never published.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DOCS_VIEWER_GROUPS,
  DOCS_VIEWER_MANIFEST,
  type DocsViewerEntry,
  type DocsViewerIndex,
  buildDocsViewerIndex,
  excludedReason,
  isPlainRepoPath,
  viewerHref,
  viewerRoute,
} from "../../frontend/src/site/docs_viewer_manifest";
import { type LintFinding, IMAGE_MAX_BYTES, IMAGE_TYPES, errorsOf, lintDoc } from "./lint";
import { canonicalUrl, renderPage } from "./page";
import {
  type ParsedDoc,
  type PathKind,
  type RenderContext,
  type RenderedDoc,
  parseDoc,
  renderDoc,
} from "./render";

export interface EntryReport {
  entry: DocsViewerEntry;
  exists: boolean;
  findings: LintFinding[];
  errors: LintFinding[];
  /** Written page (write mode only). */
  outFile?: string;
  bytes?: number;
}

export interface DocsViewerResult {
  commit: string;
  reports: EntryReport[];
  /** Problems that must fail the build. Empty when the manifest is publishable. */
  failures: string[];
  /** Entries published (or previewed) in this run. */
  published: DocsViewerEntry[];
}

export interface DocsViewerOptions {
  repoRoot: string;
  /** Site output directory (site_pages/). Required when `write` is true. */
  outDir?: string;
  write?: boolean;
  manifest?: readonly DocsViewerEntry[];
  commit?: string;
  /** Preview mode: also render pending entries, each marked as not published. Never use for site_pages/. */
  includePending?: boolean;
  /** Override the repository path lookup (tests). */
  pathKind?: (repoPath: string) => PathKind;
  /** Override reading a source file (tests). Returns null when absent. */
  readSource?: (repoPath: string) => string | null;
}

export function resolveCommit(repoRoot: string, explicit?: string): string {
  if (explicit) return explicit;
  // The checkout itself first: a manual dispatch can build a ref other than the workflow's GITHUB_SHA.
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
  } catch {
    /* not a git checkout */
  }
  if (process.env.GITHUB_SHA && /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA))
    return process.env.GITHUB_SHA;
  return "main";
}

/** Tracked files and their directories, so a link to an untracked local file counts as dead. */
export function trackedPathKind(repoRoot: string): (repoPath: string) => PathKind {
  let files: Set<string> | null = null;
  const dirs = new Set<string>();
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    files = new Set(out.split("\0").filter(Boolean));
    for (const f of files) {
      const parts = f.split("/");
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
  } catch {
    files = null;
  }
  return (repoPath: string): PathKind => {
    const p = repoPath.replace(/\/$/, "");
    if (files) return files.has(p) ? "file" : dirs.has(p) ? "dir" : null;
    const abs = path.join(repoRoot, p);
    if (!fs.existsSync(abs)) return null;
    return fs.statSync(abs).isDirectory() ? "dir" : "file";
  };
}

/** Structural problems with the manifest itself. */
export function manifestProblems(manifest: readonly DocsViewerEntry[]): string[] {
  const problems: string[] = [];
  const slugs = new Set<string>();
  const sources = new Set<string>();
  for (const e of manifest) {
    if (!/^[a-z0-9-]*$/.test(e.slug))
      problems.push(
        `docs viewer manifest: slug "${e.slug}" must be lower-case letters, digits and hyphens`
      );
    if (slugs.has(e.slug)) problems.push(`docs viewer manifest: duplicate slug "${e.slug}"`);
    slugs.add(e.slug);
    if (sources.has(e.source)) problems.push(`docs viewer manifest: duplicate source ${e.source}`);
    sources.add(e.source);
    if (!e.source.endsWith(".md"))
      problems.push(`docs viewer manifest: ${e.source} is not a markdown file`);
    for (const p of [e.source, ...(e.aliases ?? [])]) {
      const ex = excludedReason(p);
      if (ex) problems.push(`docs viewer manifest: ${p} may never be rendered (${ex})`);
    }
    if (!DOCS_VIEWER_GROUPS.includes(e.group))
      problems.push(`docs viewer manifest: unknown group "${e.group}" for ${e.source}`);
    if (!e.title.trim()) problems.push(`docs viewer manifest: ${e.source} has no title`);
  }
  return problems;
}

/**
 * Real-path containment for a repository file the build reads or copies. The path must be plain,
 * the file must be a regular file (a symlink is refused, tracked or not), its real path must stay
 * inside the repository, and that real path must not be excluded. Returns the real absolute path,
 * `{ absent: true }` when nothing is there, or `{ problem }`.
 */
export function containedRepoFile(
  repoRoot: string,
  repoPath: string
): { real: string } | { absent: true } | { problem: string } {
  if (!isPlainRepoPath(repoPath) || repoPath.endsWith("/")) {
    return { problem: `${repoPath} is not a plain repository file path` };
  }
  const abs = path.join(repoRoot, repoPath);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(abs);
  } catch {
    return { absent: true };
  }
  if (st.isSymbolicLink())
    return { problem: `${repoPath} is a symlink; only regular files are read` };
  if (!st.isFile()) return { problem: `${repoPath} is not a regular file` };
  const realRoot = fs.realpathSync(repoRoot);
  const real = fs.realpathSync(abs);
  const rel = path.relative(realRoot, real);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { problem: `${repoPath} resolves outside the repository` };
  }
  const relPosix = rel.split(path.sep).join("/");
  const ex = excludedReason(relPosix);
  if (ex)
    return { problem: `${repoPath} resolves to ${relPosix}, which may never be rendered (${ex})` };
  return { real };
}

function mediaPublicPath(repoRoot: string, repoPath: string): string | null {
  if (!IMAGE_TYPES.test(repoPath)) return null;
  const file = containedRepoFile(repoRoot, repoPath);
  if (!("real" in file)) return null;
  const abs = file.real;
  if (fs.statSync(abs).size > IMAGE_MAX_BYTES) return null;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex").slice(0, 16);
  const ext = path.extname(repoPath).toLowerCase();
  return `/docs/_media/${hash}${ext}`;
}

/** Warn on links into a published viewer document whose anchor does not exist there. */
function deadAnchorFindings(
  rendered: Map<string, RenderedDoc>,
  index: DocsViewerIndex,
  entry: DocsViewerEntry
): LintFinding[] {
  const doc = rendered.get(entry.source);
  if (!doc) return [];
  const out: LintFinding[] = [];
  const ids = (d: RenderedDoc) =>
    new Set(d.headings.map((h) => h.id).concat(["user-content-fn", "footnote-label"]));
  for (const l of doc.links) {
    if (!l.hash) continue;
    let target: RenderedDoc | undefined;
    if (l.kind === "anchor") target = doc;
    else if ((l.kind === "viewer" || l.kind === "github") && l.repoPath !== undefined) {
      // Any manifest document, published or pending: a pending target becomes published later.
      const e = index.bySource.get(l.repoPath) ?? index.bySource.get(`${l.repoPath}/`);
      target = rendered.get(e ? e.source : l.repoPath);
    }
    if (!target) continue;
    let hash = l.hash;
    try {
      hash = decodeURIComponent(hash);
    } catch {
      /* keep raw */
    }
    if (hash.startsWith("user-content-")) continue;
    if (!ids(target).has(hash)) {
      out.push({
        rule: "dead-anchor",
        severity: "warning",
        line: l.line ?? 0,
        message: `anchor #${l.hash} not found (${l.original})`,
      });
    }
  }
  return out;
}

export function runDocsViewer(opts: DocsViewerOptions): DocsViewerResult {
  const manifest = [...(opts.manifest ?? DOCS_VIEWER_MANIFEST)].sort((a, b) => a.order - b.order);
  const commit = resolveCommit(opts.repoRoot, opts.commit);
  const pathKind = opts.pathKind ?? trackedPathKind(opts.repoRoot);
  const failures = manifestProblems(manifest);
  const readSource =
    opts.readSource ??
    ((p: string) => {
      const file = containedRepoFile(opts.repoRoot, p);
      if ("absent" in file) return null;
      if ("problem" in file) {
        failures.push(`docs viewer manifest: ${file.problem}`);
        return null;
      }
      return fs.readFileSync(file.real, "utf-8");
    });
  const included = manifest.filter((e) => e.status === "included");
  const published = opts.includePending
    ? manifest.filter((e) => !excludedReason(e.source))
    : included;
  // Links resolve against what this run publishes, so a preview links pending documents to each other.
  const index = buildDocsViewerIndex(published);
  // The lint always judges against what is actually published, never against a preview.
  const lintIndex = buildDocsViewerIndex(included);
  const fileSize = (p: string) => {
    const abs = path.join(opts.repoRoot, p);
    return fs.existsSync(abs) ? fs.statSync(abs).size : null;
  };

  const parsed = new Map<string, ParsedDoc>();
  const rendered = new Map<string, RenderedDoc>();
  const reports: EntryReport[] = [];
  for (const entry of manifest) {
    const source = readSource(entry.source);
    if (source === null) {
      const missing: LintFinding = {
        rule: "missing-source",
        severity: "error",
        line: 0,
        message: `${entry.source} is not in this checkout`,
      };
      reports.push({ entry, exists: false, findings: [missing], errors: [missing] });
      continue;
    }
    const doc = parseDoc(entry.source, source);
    parsed.set(entry.source, doc);
    const ctx: RenderContext = { sourcePath: entry.source, commit, index, pathKind };
    rendered.set(
      entry.source,
      renderDoc(doc, ctx, { imagePublicPath: (p) => mediaPublicPath(opts.repoRoot, p) })
    );
    const findings = lintDoc(doc, { ...ctx, index: lintIndex }, { fileSize });
    reports.push({ entry, exists: true, findings, errors: errorsOf(findings) });
  }
  for (const r of reports) {
    if (!r.exists) continue;
    r.findings.push(...deadAnchorFindings(rendered, index, r.entry));
    r.findings.sort((a, b) => a.line - b.line);
  }
  for (const r of reports) {
    if (r.entry.status !== "included") continue;
    for (const f of r.errors) {
      failures.push(
        `docs viewer: included ${r.entry.source}${f.line ? `:${f.line}` : ""} fails ${f.rule}: ${f.message}`
      );
    }
  }

  if (opts.write) {
    if (!opts.outDir) throw new Error("runDocsViewer: outDir is required in write mode");
    if (failures.length && !opts.includePending) {
      return { commit, reports, failures, published: [] };
    }
    const nav = published.filter((e) => rendered.has(e.source));
    for (const r of reports) {
      if (!nav.includes(r.entry)) continue;
      const doc = rendered.get(r.entry.source)!;
      for (const img of doc.images) {
        const dest = path.join(opts.outDir, img.publicPath.replace(/^\//, ""));
        const file = containedRepoFile(opts.repoRoot, img.repoPath);
        if (!("real" in file))
          throw new Error(`docs viewer: refusing to copy image ${img.repoPath}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(file.real, dest);
      }
      const notice =
        r.entry.status === "pending"
          ? `Preview only. This document is pending: it is not published on neotoma.io (${r.errors.length} lint error${r.errors.length === 1 ? "" : "s"}).`
          : undefined;
      const html = renderPage({ entry: r.entry, doc, nav, commit, previewNotice: notice });
      const outFile = path.join(
        opts.outDir,
        viewerHref(r.entry.slug).replace(/^\//, ""),
        "index.html"
      );
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, html, "utf-8");
      r.outFile = outFile;
      r.bytes = Buffer.byteLength(html);
    }
    return { commit, reports, failures, published: nav };
  }
  return { commit, reports, failures, published: included.filter((e) => parsed.has(e.source)) };
}

/** Sitemap `<url>` entries for published viewer pages (with the trailing slash GitHub Pages serves). */
export function docsViewerSitemapUrls(entries: readonly DocsViewerEntry[]): string[] {
  return entries.map((e) => canonicalUrl(e));
}

/** Insert extra `<loc>` URLs into a sitemap built by `buildSitemapXml`. */
export function appendSitemapUrls(xml: string, urls: readonly string[]): string {
  if (!urls.length) return xml;
  const extra = urls.map((u) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc></url>`).join("\n");
  return xml.replace("</urlset>", `${extra}\n</urlset>`);
}

/** Human-readable status table for the console. */
export function formatReport(result: DocsViewerResult): string {
  const lines: string[] = [`docs viewer: build commit ${result.commit.slice(0, 7)}`];
  for (const r of result.reports) {
    const errs = r.errors.length;
    const warns = r.findings.length - errs;
    const state = !r.exists
      ? "missing"
      : errs
        ? `${errs} error${errs === 1 ? "" : "s"}`
        : "passes the lint";
    lines.push(
      `  [${r.entry.status}] ${viewerRoute(r.entry.slug)}/ <- ${r.entry.source}: ${state}${warns ? `, ${warns} warning${warns === 1 ? "" : "s"}` : ""}${
        r.entry.status === "pending" && r.exists && errs === 0
          ? " (ready to promote to included)"
          : ""
      }`
    );
    const byRule = new Map<string, LintFinding[]>();
    for (const f of r.findings) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
    for (const [rule, fs_] of byRule) {
      const sev = fs_[0].severity === "error" ? "error" : "warn";
      const sample = fs_
        .slice(0, 3)
        .map((f) => (f.line ? `L${f.line} ${f.message}` : f.message))
        .join("; ");
      lines.push(`      ${sev} ${rule} x${fs_.length}: ${sample}${fs_.length > 3 ? "; ..." : ""}`);
    }
  }
  return lines.join("\n");
}
