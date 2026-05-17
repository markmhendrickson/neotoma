#!/usr/bin/env tsx
/**
 * Validate the YAML frontmatter on every `docs/**.md` file.
 *
 * For each file:
 *   - If a frontmatter block exists, parse it. Reject:
 *       - Unknown fields (typos like `visiblity` instead of `visibility`).
 *       - Invalid enum values (`visibility: secret`, `audience: alien`).
 *       - Wrong types (`order: "ten"`, `tags: "a,b"`).
 *       - Malformed `last_reviewed` dates.
 *   - If no frontmatter exists, that's fine — inference handles it.
 *
 * Exit code 0 on clean, 1 on any error.
 *
 * Run:
 *   tsx scripts/validate_docs_frontmatter.ts
 *   tsx scripts/validate_docs_frontmatter.ts --paths a,b
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter, parseFlatYaml } from "../src/services/docs/doc_frontmatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "docs");

const SKIP_DIR_NAMES = new Set(["private", "node_modules", ".git", "archived"]);

const KNOWN_FIELDS = new Set([
  "title",
  "summary",
  "category",
  "subcategory",
  "order",
  "featured",
  "visibility",
  "audience",
  "tags",
  "last_reviewed",
]);

const VALID_VISIBILITY = new Set(["public", "internal"]);
const VALID_AUDIENCE = new Set(["developer", "operator", "agent", "user"]);

interface Args {
  paths: string[] | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { paths: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--paths") {
      const v = argv[++i] ?? "";
      out.paths = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--help" || a === "-h") {
      process.stdout.write("Usage: tsx scripts/validate_docs_frontmatter.ts [--paths a,b]\n");
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
  out.sort();
  return out;
}

interface FieldError {
  field: string;
  reason: string;
  severity: "error" | "warning";
}

function validateFrontmatter(raw: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  // Unknown fields are warnings, not errors: domains (proposals, releases,
  // foundation) have their own per-domain frontmatter conventions that
  // predate the /docs index and that the index should not stomp on.
  for (const key of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(key)) {
      errors.push({ field: key, reason: `unknown field`, severity: "warning" });
    }
  }
  if (raw.title !== undefined && typeof raw.title !== "string") {
    errors.push({ field: "title", reason: "must be a string", severity: "error" });
  }
  if (raw.summary !== undefined && typeof raw.summary !== "string") {
    errors.push({ field: "summary", reason: "must be a string", severity: "error" });
  }
  if (raw.category !== undefined && typeof raw.category !== "string") {
    errors.push({ field: "category", reason: "must be a string", severity: "error" });
  }
  if (
    raw.subcategory !== undefined &&
    raw.subcategory !== null &&
    typeof raw.subcategory !== "string"
  ) {
    errors.push({ field: "subcategory", reason: "must be a string or null", severity: "error" });
  }
  if (raw.order !== undefined && (typeof raw.order !== "number" || !Number.isFinite(raw.order))) {
    errors.push({ field: "order", reason: "must be a finite number", severity: "error" });
  }
  if (raw.featured !== undefined && typeof raw.featured !== "boolean") {
    errors.push({ field: "featured", reason: "must be a boolean", severity: "error" });
  }
  if (raw.visibility !== undefined) {
    if (typeof raw.visibility !== "string" || !VALID_VISIBILITY.has(raw.visibility)) {
      errors.push({ field: "visibility", reason: `must be one of: ${[...VALID_VISIBILITY].join(", ")}`, severity: "error" });
    }
  }
  if (raw.audience !== undefined) {
    if (typeof raw.audience !== "string" || !VALID_AUDIENCE.has(raw.audience)) {
      errors.push({ field: "audience", reason: `must be one of: ${[...VALID_AUDIENCE].join(", ")}`, severity: "error" });
    }
  }
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || !raw.tags.every((t) => typeof t === "string")) {
      errors.push({ field: "tags", reason: "must be a list of strings", severity: "error" });
    }
  }
  if (raw.last_reviewed !== undefined && raw.last_reviewed !== null) {
    if (typeof raw.last_reviewed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.last_reviewed)) {
      errors.push({ field: "last_reviewed", reason: "must be YYYY-MM-DD", severity: "error" });
    }
  }
  return errors;
}

function main() {
  const args = parseArgs(process.argv);
  const files = args.paths ?? collectMarkdownFiles();
  let totalErrors = 0;
  let totalWarnings = 0;
  let filesWithErrors = 0;
  let validated = 0;

  for (const rel of files) {
    const abs = path.join(docsRoot, rel);
    const source = fs.readFileSync(abs, "utf-8");
    const { yaml } = splitFrontmatter(source);
    if (yaml === null) continue;
    validated += 1;
    const raw = parseFlatYaml(yaml) as unknown as Record<string, unknown>;
    const issues = validateFrontmatter(raw);
    if (issues.length === 0) continue;
    const errs = issues.filter((i) => i.severity === "error");
    if (errs.length > 0) {
      filesWithErrors += 1;
      totalErrors += errs.length;
    }
    totalWarnings += issues.length - errs.length;
    process.stderr.write(`docs/${rel}\n`);
    for (const e of issues) {
      const label = e.severity === "error" ? "ERROR" : "warn ";
      process.stderr.write(`  ${label} ${e.field}: ${e.reason}\n`);
    }
  }

  if (totalErrors > 0) {
    process.stderr.write(
      `\n${totalErrors} error(s) across ${filesWithErrors} file(s) — and ${totalWarnings} warning(s). Validated ${validated} of ${files.length} files with frontmatter.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `OK — validated ${validated} frontmatter block(s); ${totalErrors} error(s), ${totalWarnings} warning(s) across ${files.length} markdown file(s).\n`,
  );
}

main();
