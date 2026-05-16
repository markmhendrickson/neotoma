#!/usr/bin/env tsx
/**
 * Backfill YAML frontmatter into `docs/**.md`.
 *
 * For each markdown file that lacks frontmatter (or is missing required
 * inferred fields), this script writes a minimal frontmatter block to the
 * top of the file. The inferred values come from the same canonical source
 * the `/docs` runtime uses: `resolveFrontmatter()` in
 * `src/services/docs/doc_frontmatter.ts`.
 *
 * Idempotency: running twice on the same tree produces zero diffs on the
 * second run. Files that already have a frontmatter block are skipped
 * entirely (we do not merge or overwrite). Files in `docs/private/` are
 * skipped — they are never served by the route anyway.
 *
 * Modes:
 *   --dry-run    Print planned writes; do not modify any file.
 *   --write      Write frontmatter to disk.
 *   --paths a,b  Restrict to a comma-separated list of docs-relative paths.
 *
 * Run:
 *   tsx scripts/docs_frontmatter_backfill.ts --dry-run
 *   tsx scripts/docs_frontmatter_backfill.ts --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveFrontmatter,
  splitFrontmatter,
  resolveFolderDefaults,
  type DocFrontmatter,
} from "../src/services/docs/doc_frontmatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "docs");

const SKIP_DIR_NAMES = new Set(["private", "node_modules", ".git", "archived", "generated"]);

interface Args {
  mode: "dry-run" | "write";
  paths: string[] | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { mode: "dry-run", paths: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.mode = "dry-run";
    else if (a === "--write") out.mode = "write";
    else if (a === "--paths") {
      const v = argv[++i] ?? "";
      out.paths = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx scripts/docs_frontmatter_backfill.ts [--dry-run | --write] [--paths a,b]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return out;
}

function collectMarkdownFiles(): string[] {
  const out: string[] = [];
  const walk = (absDir: string, relDir: string) => {
    if (!fs.existsSync(absDir)) return;
    for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(ent.name)) continue;
        walk(path.join(absDir, ent.name), relDir ? `${relDir}/${ent.name}` : ent.name);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        out.push(relDir ? `${relDir}/${ent.name}` : ent.name);
      }
    }
  };
  walk(docsRoot, "");
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * Serialize a `DocFrontmatter` value to a minimal YAML block.
 *
 * Includes only the fields whose resolved value differs from "the default the
 * route would infer anyway" — that keeps the on-disk diff small and signals
 * authoring intent (a field present in frontmatter is one the author chose).
 *
 * Always includes `title` and `summary` because those are the most useful
 * for at-a-glance index browsing and they save the route from re-parsing
 * the body on every request.
 */
function frontmatterToYaml(fm: DocFrontmatter, relPath: string): string {
  const defaults = resolveFolderDefaults(relPath);
  const lines: string[] = ["---"];
  lines.push(`title: ${quoteYamlScalar(fm.title)}`);
  if (fm.summary) lines.push(`summary: ${quoteYamlScalar(fm.summary)}`);
  if (fm.category !== defaults.category) lines.push(`category: ${fm.category}`);
  if (fm.subcategory !== defaults.subcategory && fm.subcategory) {
    lines.push(`subcategory: ${fm.subcategory}`);
  }
  if (fm.visibility !== defaults.visibility) lines.push(`visibility: ${fm.visibility}`);
  if (fm.audience !== defaults.audience) lines.push(`audience: ${fm.audience}`);
  if (fm.order !== 100 && fm.order !== 0) lines.push(`order: ${fm.order}`);
  if (fm.featured) lines.push(`featured: true`);
  if (fm.tags.length > 0) {
    lines.push(`tags: [${fm.tags.map(quoteYamlScalar).join(", ")}]`);
  }
  if (fm.last_reviewed) lines.push(`last_reviewed: ${fm.last_reviewed}`);
  lines.push("---");
  return lines.join("\n");
}

function quoteYamlScalar(v: string): string {
  // Quote when value contains characters that would break flat YAML parsing.
  if (/^[A-Za-z0-9 \-_.,/()]+$/.test(v) && !v.includes(": ")) return v;
  return `"${v.replace(/"/g, '\\"')}"`;
}

interface BackfillResult {
  relPath: string;
  action: "skipped_has_frontmatter" | "skipped_no_change" | "would_write" | "wrote";
}

function backfillFile(relPath: string, mode: Args["mode"]): BackfillResult {
  const abs = path.join(docsRoot, relPath);
  const source = fs.readFileSync(abs, "utf-8");
  const { yaml } = splitFrontmatter(source);
  if (yaml !== null) {
    return { relPath, action: "skipped_has_frontmatter" };
  }
  const fm = resolveFrontmatter(relPath, source);
  const yamlBlock = frontmatterToYaml(fm, relPath);
  const next = `${yamlBlock}\n${source.startsWith("\n") ? source : "\n" + source}`;
  if (next === source) {
    return { relPath, action: "skipped_no_change" };
  }
  if (mode === "write") {
    fs.writeFileSync(abs, next);
    return { relPath, action: "wrote" };
  }
  return { relPath, action: "would_write" };
}

function main() {
  const args = parseArgs(process.argv);
  const files = args.paths ?? collectMarkdownFiles();
  let wrote = 0;
  let wouldWrite = 0;
  let skipped = 0;
  for (const rel of files) {
    const r = backfillFile(rel, args.mode);
    if (r.action === "wrote") {
      wrote += 1;
      process.stdout.write(`wrote  ${rel}\n`);
    } else if (r.action === "would_write") {
      wouldWrite += 1;
      process.stdout.write(`would  ${rel}\n`);
    } else {
      skipped += 1;
    }
  }
  process.stdout.write(
    `\nDone. wrote=${wrote} would_write=${wouldWrite} skipped=${skipped} (of ${files.length} files).\n`,
  );
  if (args.mode === "dry-run") {
    process.stdout.write(`(dry-run — re-run with --write to apply.)\n`);
  }
}

main();
