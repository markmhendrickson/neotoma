#!/usr/bin/env tsx
/**
 * Scans public markdown under `docs/` (excluding `docs/private`) and writes
 * `docs/site/generated/docs_markdown_audit.json` for reconciliation work.
 *
 * Run: tsx scripts/mdx_site_docs_audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "docs");
const outDir = path.join(repoRoot, "docs/site/generated");

const SKIP_DIR_NAMES = new Set([
  "private",
  "node_modules",
  ".git",
  "archived",
  "releases",
  "in_progress",
]);

function shouldSkipDir(relFromDocs: string): boolean {
  const parts = relFromDocs.split(path.sep).filter(Boolean);
  return parts.some((p) => SKIP_DIR_NAMES.has(p));
}

function collectMarkdownFiles(): { rel: string; top: string }[] {
  const out: { rel: string; top: string }[] = [];

  const walk = (absDir: string, relFromDocs: string) => {
    if (!fs.existsSync(absDir)) return;
    if (shouldSkipDir(relFromDocs)) return;
    for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, ent.name);
      const rel = path.join(relFromDocs, ent.name);
      if (ent.isDirectory()) {
        walk(abs, rel);
      } else if (ent.isFile() && (ent.name.endsWith(".md") || ent.name.endsWith(".mdc"))) {
        const top = rel.split(path.sep)[0] ?? "root";
        out.push({ rel: path.posix.join("docs", rel.split(path.sep).join("/")), top });
      }
    }
  };

  walk(docsRoot, "");
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

function main() {
  const files = collectMarkdownFiles();
  const byTop = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.top] = (acc[f.top] ?? 0) + 1;
    return acc;
  }, {});

  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    generated_at: new Date().toISOString(),
    total_files: files.length,
    by_top_level_folder: byTop,
    files,
  };
  fs.writeFileSync(path.join(outDir, "docs_markdown_audit.json"), JSON.stringify(payload, null, 2), "utf-8");

  const md = [
    "# Docs markdown audit (generated)",
    "",
    "Excludes `docs/private` and paths containing `archived`, `releases`, or `in_progress` directory names.",
    "",
    `Total files: **${files.length}**`,
    "",
    "## By top-level folder under docs/",
    "",
    ...Object.entries(byTop)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- **${k}**: ${v}`),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "DOCS_MARKDOWN_AUDIT.md"), md, "utf-8");
  console.log(`Wrote docs/site/generated/docs_markdown_audit.json (${files.length} files)`);
}

main();
