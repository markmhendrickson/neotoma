#!/usr/bin/env tsx
/**
 * Convert simple MDX pages (those whose only JSX usage is decorative <ul>
 * lists and <MdxI18nLink> wrappers) into canonical markdown under
 * docs/guides/<slug>.md.
 *
 * Conversion rules:
 *   - Strip the leading `import { MdxI18nLink } from ...` line.
 *   - Replace `<ul className="..."><li>...</li>...</ul>` with plain `- item` lists.
 *   - Replace `<MdxI18nLink to="/foo" ...>label</MdxI18nLink>` with `[label](/foo)`.
 *   - Replace `<div ...>...</div>` content blocks with their inner content.
 *   - Replace `<span ...>...</span>` and `<strong>...</strong>` likewise.
 *   - Decode HTML entities (`&lt;`, `&gt;`, `&rarr;`).
 *   - Prepend YAML frontmatter inferred from path + filename.
 *
 * Outputs go to docs/guides/<slug>.md. Updates
 * docs/site/site_doc_manifest.yaml to register each new file as
 * `status: supporting_source` for the corresponding `canonical_site_path`.
 *
 * Run:
 *   tsx scripts/mdx_to_markdown_for_simple_pages.ts --dry-run
 *   tsx scripts/mdx_to_markdown_for_simple_pages.ts --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Pages identified by `mdx_markdown_parity_audit.ts` as
// `imported_components === ['MdxI18nLink']`. Hand-curated to capture exactly
// the conversion-eligible set.
const SIMPLE_PAGES = [
  { slug: "non-destructive-testing", out: "docs/guides/non_destructive_testing.md", category: "getting_started" },
  { slug: "integrations", out: "docs/integrations/README.md", category: "integrations" },
  { slug: "neotoma-with-continue", out: "docs/integrations/neotoma_with_continue.md", category: "integrations" },
  { slug: "neotoma-with-letta", out: "docs/integrations/neotoma_with_letta.md", category: "integrations" },
  { slug: "neotoma-with-vscode", out: "docs/integrations/neotoma_with_vscode.md", category: "integrations" },
  { slug: "neotoma-with-windsurf", out: "docs/integrations/neotoma_with_windsurf.md", category: "integrations" },
];

interface Args {
  mode: "dry-run" | "write";
}

function parseArgs(argv: string[]): Args {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--write") return { mode: "write" };
    if (argv[i] === "--dry-run") return { mode: "dry-run" };
  }
  return { mode: "dry-run" };
}

function readMdx(slug: string): string {
  const p = path.join(repoRoot, "docs/site/pages/en", `${slug}.mdx`);
  return fs.readFileSync(p, "utf-8");
}

function readMeta(slug: string): { page_title?: string; path?: string } {
  const p = path.join(repoRoot, "docs/site/pages/en", `${slug}.meta.json`);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, "→")
    .replace(/&larr;/g, "←")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/\{"\s*"\}/g, " "); // {" "} JSX whitespace literals
}

function stripImports(s: string): string {
  return s
    .replace(/^import\s+[^;]+;?\s*$/gm, "")
    .replace(/^import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*$/gm, "");
}

/**
 * Strip className=..., style=..., and aria-hidden=... attributes from JSX tags.
 *
 * These attribute values can contain `>` (e.g. Tailwind class expressions like
 * `[&>p]:m-0`) which breaks naive `<tag[^>]*>` matchers. We don't need any of
 * these attributes for the canonical markdown, so strip them up front.
 */
function stripJsxAttributes(s: string): string {
  // Double-quoted values across multiple lines.
  s = s.replace(/\s+className="[^"]*"/g, "");
  s = s.replace(/\s+style=\{[^}]*\}/g, "");
  s = s.replace(/\s+aria-hidden(?:="[^"]*"|=\{[^}]*\})?/g, "");
  // Strip generic JSX expression attrs like `to={...}` (we keep `to="..."`).
  return s;
}

/** Replace `<MdxI18nLink to="X" ...>label</MdxI18nLink>` with `[label](X)`. */
function convertI18nLinks(s: string): string {
  // Non-greedy across newlines for label, including nested whitespace and entities.
  return s.replace(
    /<MdxI18nLink\s+to="([^"]+)"[^>]*>([\s\S]*?)<\/MdxI18nLink>/g,
    (_m, href, label) => `[${(label as string).trim().replace(/\s+/g, " ")}](${href})`,
  );
}

/**
 * Replace JSX list blocks of the shape
 *   <ul ...>
 *     <li ...>...&rarr;... item ...</li>
 *     ...
 *   </ul>
 * with plain markdown unordered lists.
 *
 * The decorative arrow span and any wrapping <span>/<strong> tags inside <li>
 * are stripped before extracting the item text.
 */
function convertJsxLists(s: string): string {
  return s.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g, (_m, inner) => {
    const items: string[] = [];
    const itemRe = /<li\b[^>]*>([\s\S]*?)<\/li>/g;
    let im;
    while ((im = itemRe.exec(inner as string)) !== null) {
      items.push(extractListItemText(im[1]));
    }
    if (items.length === 0) return "";
    return items.map((it) => `- ${it}`).join("\n");
  });
}

function extractListItemText(html: string): string {
  // Strip wrapping <span>...</span> (className/aria-hidden already removed
  // earlier) while keeping content.
  let s = html.replace(/<\/?span[^>]*>/g, "");
  // Convert <strong>X</strong> → **X**.
  s = s.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, "**$1**");
  // Convert <em>X</em> → *X*.
  s = s.replace(/<em[^>]*>([\s\S]*?)<\/em>/g, "*$1*");
  // Drop any remaining JSX tags.
  s = s.replace(/<[^>]+>/g, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  // Strip a leading decorative arrow (the spans were <span>→</span>; once
  // decoded that surfaces as `→ ` at the head of every item).
  s = s.replace(/^(?:&rarr;|→)\s+/, "");
  return s;
}

/** Replace `<div ...>inner</div>` with `inner` (preserve content only). */
function unwrapDivs(s: string): string {
  // Apply repeatedly until no <div> tags remain (handles nesting).
  let prev = "";
  let cur = s;
  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(/<div\b[^>]*>([\s\S]*?)<\/div>/g, "$1");
  }
  return cur;
}

/** Replace remaining `<p ...>X</p>` with `X` (we add paragraph breaks via blank lines). */
function unwrapParas(s: string): string {
  return s.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g, "$1");
}

function normalizeWhitespace(s: string): string {
  return s
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim() + "\n";
}

function summarizeFirstPara(body: string): string {
  const text = body.replace(/^#\s+.+?\n+/, "");
  const para = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#") && !s.startsWith("```") && !s.startsWith("-"));
  if (!para) return "";
  const one = para.replace(/\s+/g, " ");
  return one.length > 240 ? one.slice(0, 237) + "..." : one;
}

function convert(slug: string): string {
  const raw = readMdx(slug);
  const meta = readMeta(slug);
  let s = raw;
  s = stripImports(s);
  // Pre-strip className/style attributes so `>` inside Tailwind class
  // expressions like `[&>p]:m-0` doesn't terminate the JSX tag matcher
  // prematurely. We don't need those attributes in the canonical markdown.
  s = stripJsxAttributes(s);
  s = convertI18nLinks(s);
  s = convertJsxLists(s);
  s = unwrapDivs(s);
  s = unwrapParas(s);
  s = s.replace(/<[A-Za-z][^>]*\/>/g, "");
  s = decodeEntities(s);
  s = normalizeWhitespace(s);
  const title = meta.page_title ?? humanize(slug);
  const summary = summarizeFirstPara(s);
  const frontmatter = [
    "---",
    `title: ${title}`,
    summary ? `summary: ${JSON.stringify(summary).slice(1, -1)}` : null,
    "audience: user",
    "---",
    "",
    "",
  ]
    .filter((l) => l !== null)
    .join("\n");
  // If the MDX already starts with an H1 (matching title or close), don't add another.
  const startsWithH1 = /^#\s+/.test(s.trimStart());
  if (startsWithH1) {
    return `${frontmatter}${s}`;
  }
  return `${frontmatter}# ${title}\n\n${s}`;
}

function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

interface ManifestUpdate {
  repo_path: string;
  canonical_site_path: string;
}

function updateManifest(updates: ManifestUpdate[]): void {
  const manifestPath = path.join(repoRoot, "docs/site/site_doc_manifest.yaml");
  const src = fs.readFileSync(manifestPath, "utf-8");
  // Insert before the trailing `categories:` block (added in PR1).
  const marker = "\n# ============================================================================\n# /docs index";
  const idx = src.indexOf(marker);
  if (idx < 0) {
    process.stderr.write("manifest: could not find /docs index marker; aborting manifest update\n");
    process.exit(2);
  }
  const insertion = updates
    .map((u) => {
      return `  - repo_path: ${u.repo_path}\n    status: supporting_source\n    canonical_site_path: ${u.canonical_site_path}\n    notes: "Canonical markdown counterpart authored by scripts/mdx_to_markdown_for_simple_pages.ts; site MDX wraps the same content with i18n links."`;
    })
    .join("\n");
  const next = src.slice(0, idx) + "\n" + insertion + "\n" + src.slice(idx);
  fs.writeFileSync(manifestPath, next);
}

function main() {
  const args = parseArgs(process.argv);
  const updates: ManifestUpdate[] = [];
  let wrote = 0;
  for (const page of SIMPLE_PAGES) {
    const out = path.join(repoRoot, page.out);
    const content = convert(page.slug);
    if (args.mode === "write") {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, content);
      wrote += 1;
      process.stdout.write(`wrote  ${page.out}\n`);
    } else {
      process.stdout.write(`would  ${page.out}\n`);
    }
    const meta = readMeta(page.slug);
    if (meta.path) {
      updates.push({ repo_path: page.out, canonical_site_path: meta.path });
    }
  }
  if (args.mode === "write") {
    updateManifest(updates);
    process.stdout.write(
      `\nDone. wrote=${wrote} files; updated docs/site/site_doc_manifest.yaml with ${updates.length} supporting_source entries.\n`,
    );
  } else {
    process.stdout.write(`(dry-run — re-run with --write to apply.)\n`);
  }
}

main();
