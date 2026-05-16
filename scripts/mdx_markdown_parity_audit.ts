#!/usr/bin/env tsx
/**
 * MDX ↔ markdown parity audit.
 *
 * For every `docs/site/pages/en/*.mdx` page, determine whether a canonical
 * markdown counterpart exists under `docs/<topic>/*.md` (per
 * `docs/site/site_doc_manifest.yaml` entries with
 * `status: supporting_source`). Surface the gap so canonical markdown can be
 * authored — the MDX site then becomes a progressive enhancement layered on
 * top of accessible-without-JS markdown.
 *
 * Outputs:
 *   - `docs/site/generated/mdx_markdown_parity.md` — human-readable audit.
 *   - `docs/site/generated/mdx_markdown_parity.json` — machine-readable.
 *
 * Run:
 *   tsx scripts/mdx_markdown_parity_audit.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mdxDir = path.join(repoRoot, "docs/site/pages/en");
const manifestPath = path.join(repoRoot, "docs/site/site_doc_manifest.yaml");
const outDir = path.join(repoRoot, "docs/site/generated");

interface MdxPage {
  /** Filename without extension, e.g. `cli`. */
  basename: string;
  /** `docs/site/pages/en/cli.mdx`. */
  source_path: string;
  /** From `cli.meta.json#path`, e.g. `/cli`. */
  site_path: string | null;
  /** Names of all components imported via `import {...} from ...`. */
  imported_components: string[];
  /** Whether the MDX uses any JSX tags after the imports. */
  has_jsx_usage: boolean;
}

interface ManifestEntry {
  repo_path: string;
  status: string;
  canonical_site_path: string | null;
}

function loadManifestEntries(): ManifestEntry[] {
  if (!fs.existsSync(manifestPath)) return [];
  const lines = fs.readFileSync(manifestPath, "utf-8").split("\n");
  const out: ManifestEntry[] = [];
  let cur: Partial<ManifestEntry> | null = null;
  let inEntries = false;
  for (const raw of lines) {
    if (/^entries:\s*$/.test(raw)) {
      inEntries = true;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*:\s*$/.test(raw) && !raw.startsWith(" ")) {
      inEntries = false;
      continue;
    }
    if (!inEntries) continue;
    if (/^\s*-\s+repo_path:\s*/.test(raw)) {
      if (cur && cur.repo_path) out.push(cur as ManifestEntry);
      cur = {
        repo_path: raw.replace(/^\s*-\s+repo_path:\s*/, "").trim().replace(/^["']|["']$/g, ""),
      };
      continue;
    }
    if (!cur) continue;
    const m = /^\s+([a-z_]+):\s*(.*)$/.exec(raw);
    if (!m) continue;
    const k = m[1];
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (k === "status") cur.status = v;
    else if (k === "canonical_site_path") cur.canonical_site_path = v;
  }
  if (cur && cur.repo_path) out.push(cur as ManifestEntry);
  return out;
}

function collectMdxPages(): MdxPage[] {
  if (!fs.existsSync(mdxDir)) return [];
  const out: MdxPage[] = [];
  for (const ent of fs.readdirSync(mdxDir)) {
    if (!ent.endsWith(".mdx")) continue;
    const abs = path.join(mdxDir, ent);
    const basename = ent.replace(/\.mdx$/, "");
    const source = fs.readFileSync(abs, "utf-8");
    const components = extractImportedComponents(source);
    const hasJsxUsage = detectJsxUsage(source, components);
    let sitePath: string | null = null;
    const metaPath = path.join(mdxDir, `${basename}.meta.json`);
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as { path?: string };
        sitePath = meta.path ?? null;
      } catch {
        sitePath = null;
      }
    }
    out.push({
      basename,
      source_path: `docs/site/pages/en/${ent}`,
      site_path: sitePath,
      imported_components: components,
      has_jsx_usage: hasJsxUsage,
    });
  }
  out.sort((a, b) => a.basename.localeCompare(b.basename));
  return out;
}

function extractImportedComponents(source: string): string[] {
  const out = new Set<string>();
  const re = /import\s*\{([^}]+)\}\s*from\s+["'][^"']+["']/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/\s+as\s+\w+$/, "").trim();
      if (name && /^[A-Z]/.test(name)) out.add(name);
    }
  }
  return [...out].sort();
}

function detectJsxUsage(source: string, components: string[]): boolean {
  if (components.length === 0) return false;
  // Strip imports first.
  const body = source.replace(/import\s+[^;]+;/g, "").replace(/import\s+\{[^}]+\}\s*from\s+["'][^"']+["']/g, "");
  for (const c of components) {
    const re = new RegExp(`<${c}\\b`);
    if (re.test(body)) return true;
  }
  return false;
}

interface PageWithCounterpart extends MdxPage {
  supporting_md: ManifestEntry | null;
  status: "covered" | "needs_canonical_md" | "no_jsx_no_md_needed";
}

function classify(pages: MdxPage[], entries: ManifestEntry[]): PageWithCounterpart[] {
  const supportBySitePath = new Map<string, ManifestEntry>();
  for (const e of entries) {
    if (e.status === "supporting_source" && e.canonical_site_path) {
      supportBySitePath.set(e.canonical_site_path, e);
    }
  }
  return pages.map((p) => {
    const supportingMd = p.site_path ? (supportBySitePath.get(p.site_path) ?? null) : null;
    if (supportingMd) {
      return { ...p, supporting_md: supportingMd, status: "covered" as const };
    }
    if (!p.has_jsx_usage) {
      return { ...p, supporting_md: null, status: "no_jsx_no_md_needed" as const };
    }
    return { ...p, supporting_md: null, status: "needs_canonical_md" as const };
  });
}

function renderMarkdown(rows: PageWithCounterpart[]): string {
  const covered = rows.filter((r) => r.status === "covered");
  const needs = rows.filter((r) => r.status === "needs_canonical_md");
  const noJsx = rows.filter((r) => r.status === "no_jsx_no_md_needed");

  const lines: string[] = [];
  lines.push("# MDX ↔ markdown parity audit (generated)");
  lines.push("");
  lines.push(
    "Generated by `scripts/mdx_markdown_parity_audit.ts`. Do not hand-edit.",
  );
  lines.push("");
  lines.push(
    "Pairs every `docs/site/pages/en/*.mdx` against its canonical markdown counterpart (an entry in `docs/site/site_doc_manifest.yaml` with `status: supporting_source`).",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total MDX pages: **${rows.length}**`);
  lines.push(`- Covered by a \`supporting_source\` markdown: **${covered.length}**`);
  lines.push(`- Need canonical markdown authored: **${needs.length}**`);
  lines.push(`- Plain-markdown MDX (no JSX, no markdown gap): **${noJsx.length}**`);
  lines.push("");

  if (needs.length > 0) {
    lines.push("## Need canonical markdown");
    lines.push("");
    lines.push("Each row uses one or more JSX components and has no `supporting_source` entry in the manifest. Author a markdown counterpart with static equivalents of the JSX (tables, code blocks, prose).");
    lines.push("");
    lines.push("| Site path | MDX | JSX components |");
    lines.push("|---|---|---|");
    for (const r of needs) {
      const sitePath = r.site_path ?? "—";
      lines.push(
        `| \`${sitePath}\` | [\`${r.source_path}\`](../../../${r.source_path}) | ${r.imported_components.map((c) => `\`${c}\``).join(", ")} |`,
      );
    }
    lines.push("");
  }

  if (covered.length > 0) {
    lines.push("## Covered");
    lines.push("");
    lines.push("| Site path | MDX | Supporting markdown |");
    lines.push("|---|---|---|");
    for (const r of covered) {
      const sitePath = r.site_path ?? "—";
      lines.push(
        `| \`${sitePath}\` | [\`${r.source_path}\`](../../../${r.source_path}) | [\`${r.supporting_md!.repo_path}\`](../../../${r.supporting_md!.repo_path}) |`,
      );
    }
    lines.push("");
  }

  if (noJsx.length > 0) {
    lines.push("## Plain-markdown MDX (no parity gap)");
    lines.push("");
    lines.push("These MDX pages don't use JSX components, so the MDX itself is accessible-without-JS-equivalent. They can be wrapped or moved into `docs/<topic>/` directly when convenient, but they aren't gating.");
    lines.push("");
    lines.push("| Site path | MDX |");
    lines.push("|---|---|");
    for (const r of noJsx) {
      const sitePath = r.site_path ?? "—";
      lines.push(`| \`${sitePath}\` | [\`${r.source_path}\`](../../../${r.source_path}) |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const pages = collectMdxPages();
  const entries = loadManifestEntries();
  const classified = classify(pages, entries);

  const json = {
    total: classified.length,
    covered: classified.filter((r) => r.status === "covered").length,
    needs_canonical_md: classified.filter((r) => r.status === "needs_canonical_md").length,
    no_jsx_no_md_needed: classified.filter((r) => r.status === "no_jsx_no_md_needed").length,
    pages: classified,
  };

  fs.writeFileSync(path.join(outDir, "mdx_markdown_parity.json"), JSON.stringify(json, null, 2));
  fs.writeFileSync(path.join(outDir, "mdx_markdown_parity.md"), renderMarkdown(classified));

  process.stdout.write(
    `MDX↔markdown parity: total=${json.total} covered=${json.covered} need_md=${json.needs_canonical_md} no_jsx=${json.no_jsx_no_md_needed}\n`,
  );
  process.stdout.write(`Wrote ${path.relative(repoRoot, outDir)}/mdx_markdown_parity.{md,json}\n`);
}

main();
