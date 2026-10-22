/**
 * Enforces foundation/conventions/writing_style_guide.md on site-facing copy.
 * Run: npm run lint:site-copy
 *
 * Scopes: marketing subpages, SitePage, SeoHead, SEO route metadata.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

interface Violation {
  file: string;
  line: number;
  message: string;
}

const FILES_RELATIVE = [
  join("frontend", "src", "components", "SitePage.tsx"),
  join("frontend", "src", "components", "SeoHead.tsx"),
  join("frontend", "src", "site", "seo_metadata.ts"),
] as const;

const SUBPAGES_DIR = join(REPO_ROOT, "frontend", "src", "components", "subpages");

function collectTsxRecursive(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...collectTsxRecursive(p));
    } else if (e.isFile() && e.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

function allTargetFiles(): string[] {
  const files = [
    ...FILES_RELATIVE.map((p) => join(REPO_ROOT, p)),
    ...collectTsxRecursive(SUBPAGES_DIR),
  ];
  return [...new Set(files)].filter((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

/** Strip table cells that use &mdash; only as an empty placeholder (not prose). */
function lineForDashScan(line: string): string {
  let s = line.replace(/<td[^>]*>\s*&mdash;\s*<\/td>/g, "");
  if (/s\.trim\(\)\s*!==\s*["']—["']/.test(line)) return "";
  if (/parameters:.*["']—["']/.test(line)) return "";
  return s;
}

const PHRASE_RULES: { re: RegExp; message: string }[] = [
  { re: /\bFurthermore\b/i, message: 'Avoid "Furthermore" (use a direct continuation)' },
  { re: /\bMoreover\b/i, message: 'Avoid "Moreover" (use a direct continuation)' },
  { re: /\bIn addition,?\b/i, message: 'Avoid "In addition" (start with the subject)' },
  { re: /\bleverages?\b/i, message: 'Avoid "leverage"; use "use" or "draw on"' },
  { re: /\bempower(s|ed|ing)?\b/i, message: 'Avoid "empower"; use "enable" or "let"' },
  { re: /cutting-edge/i, message: 'Avoid "cutting-edge"; name the technology' },
  { re: /\brevolutionary\b/i, message: 'Avoid hype word "revolutionary"' },
  { re: /\bgame-changing\b/i, message: 'Avoid hype phrase "game-changing"' },
  { re: /\bseamless(ly)?\b/i, message: 'Avoid "seamless"; describe behavior plainly' },
  { re: /\butilize(s|d|zing)?\b/i, message: 'Use "use" instead of "utilize"' },
  { re: /\bfacilitate(s|d|ing)?\b/i, message: 'Use "enable" or "help" instead of "facilitate"' },
  { re: /\bremembrances\b/i, message: 'Use "memories" instead of "remembrances"' },
  { re: /Now, let's\b/i, message: 'Avoid "Now, let\'s..."' },
  { re: /So, you might\b/i, message: 'Avoid "So, you might..."' },
  { re: /\bInterestingly\b/i, message: 'Avoid "Interestingly"' },
  { re: /As you can see\b/i, message: 'Avoid "As you can see"' },
  { re: /Keep in mind that\b/i, message: 'Avoid "Keep in mind that"' },
  { re: /Would you like to\b/i, message: 'Avoid "Would you like to"; use a direct instruction' },
  { re: /Have you considered\b/i, message: 'Avoid "Have you considered"' },
  { re: /\bWant to try\b/i, message: 'Avoid "Want to try"' },
  { re: /Need help with\b/i, message: 'Avoid "Need help with"' },
  { re: /Get started!/i, message: 'Avoid motivational "Get started!"' },
  { re: /Try it now!/i, message: 'Avoid motivational "Try it now!"' },
  { re: /You're all set!/i, message: 'Avoid "You\'re all set!"' },
  { re: /Ready to go!/i, message: 'Avoid "Ready to go!"' },
  { re: /Let's dive in!/i, message: 'Avoid "Let\'s dive in!"' },
];

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function lintFile(absPath: string): Violation[] {
  const rel = relative(REPO_ROOT, absPath);
  const content = readFileSync(absPath, "utf8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const scan = lineForDashScan(line);
    const m = scan.match(/[—–\u2014\u2013]|&mdash;|&ndash;/u);
    if (m) {
      violations.push({
        file: rel,
        line: i + 1,
        message: `Disallowed dash (${m[0]}). Use comma, period, colon, or hyphen per foundation/conventions/writing_style_guide.md`,
      });
    }
  }

  for (const { re, message } of PHRASE_RULES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const testRe = new RegExp(re.source, re.flags);
    while ((m = testRe.exec(content)) !== null) {
      if (m[0].length === 0) break;
      violations.push({
        file: rel,
        line: lineNumberAt(content, m.index),
        message,
      });
      if (!testRe.global) break;
    }
  }

  return violations;
}

function main(): void {
  const files = allTargetFiles();
  const all: Violation[] = [];
  for (const f of files) {
    all.push(...lintFile(f));
  }

  if (all.length === 0) {
    console.log(
      `lint_site_copy_style: OK (${files.length} files, foundation/conventions/writing_style_guide.md)`,
    );
    return;
  }

  console.error("lint_site_copy_style: violations (writing style guide)\n");
  for (const v of all) {
    console.error(`${v.file}:${v.line}: ${v.message}`);
  }
  console.error(`\n${all.length} violation(s). See foundation/conventions/writing_style_guide.md`);
  process.exit(1);
}

main();
