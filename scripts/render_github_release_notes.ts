#!/usr/bin/env tsx
/**
 * Renders GitHub Release Markdown: .github/release_notes_wrap.md + supplement + git log.
 *
 * Usage:
 *   npm run -s release-notes:render -- --tag v0.3.11   # -s keeps npm from printing into piped files
 *   npx tsx scripts/render_github_release_notes.ts --tag v0.3.11 --supplement path/to/custom.md
 *   npx tsx scripts/render_github_release_notes.ts --tag v0.4.0 --compare-base v0.3.10
 *     # when the previous git tag was not published to npm; overrides compare + commit list base
 *   npx tsx scripts/render_github_release_notes.ts --tag v0.4.3 --head-ref HEAD
 *     # preview the final GitHub Release body before the tag exists; compare/install use v0.4.3,
 *     # commit list is generated from the chosen head ref
 *
 * Supplement resolution (first hit wins):
 *   1) --supplement path
 *   2) docs/releases/in_progress/<tag>/github_release_supplement.md
 *   3) docs/releases/completed/<tag>/github_release_supplement.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function getRepoSlug(): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
  ) as { repository?: { url?: string } };
  const url = pkg.repository?.url ?? "";
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : "markmhendrickson/neotoma";
}

function listVersionTagsDescending(): string[] {
  const out = execSync("git tag -l 'v*' --sort=-v:refname", {
    cwd: repoRoot,
    encoding: "utf-8",
  }).trim();
  return out ? out.split("\n").filter(Boolean) : [];
}

function parseVersionTag(tag: string): [number, number, number] | null {
  const m = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersionTags(a: string, b: string): number {
  const av = parseVersionTag(a);
  const bv = parseVersionTag(b);
  if (!av || !bv) return a.localeCompare(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

function previousTag(current: string): string {
  const all = listVersionTagsDescending();
  const i = all.indexOf(current);
  if (i >= 0 && i + 1 < all.length) return all[i + 1]!;
  for (const tag of all) {
    if (compareVersionTags(tag, current) < 0) return tag;
  }
  return "";
}

function readWrap(): string {
  const p = path.join(repoRoot, ".github", "release_notes_wrap.md");
  return fs.readFileSync(p, "utf-8");
}

function resolveSupplement(tag: string, explicit?: string): string {
  if (explicit && fs.existsSync(path.resolve(repoRoot, explicit))) {
    return fs.readFileSync(path.resolve(repoRoot, explicit), "utf-8").trim();
  }
  const candidates = [
    path.join(repoRoot, "docs", "releases", "in_progress", tag, "github_release_supplement.md"),
    path.join(repoRoot, "docs", "releases", "completed", tag, "github_release_supplement.md"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").trim();
  }
  return `_Add narrative before publishing: create \`docs/releases/in_progress/${tag}/github_release_supplement.md\` (see \`docs/developer/github_release_supplement.example.md\`)._`;
}

function gitLogMarkdown(prev: string, rangeEnd: string): string {
  if (!prev) {
    return `_No previous tag found; use [compare on GitHub](https://github.com/${getRepoSlug()}/compare/${rangeEnd}^...${rangeEnd}) for history._`;
  }
  const out = execSync(`git log ${prev}..${rangeEnd} --oneline`, {
    cwd: repoRoot,
    encoding: "utf-8",
  }).trim();
  if (!out) return "_No commits in range._";
  return out
    .split("\n")
    .map((line) => {
      const match = line.match(/^([0-9a-f]+)\s+(.*)$/i);
      if (!match) return `- ${line}`;
      const hash = match[1]!.slice(0, 7);
      const rest = match[2]!.trim();
      return `- \`${hash}\` ${rest}`;
    })
    .join("\n");
}

function parseArgs(argv: string[]): {
  tag: string;
  supplement?: string;
  compareBase?: string;
  headRef?: string;
} {
  let tag = "";
  let supplement: string | undefined;
  let compareBase: string | undefined;
  let headRef: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tag" && argv[i + 1]) {
      tag = argv[++i]!;
    } else if (argv[i] === "--supplement" && argv[i + 1]) {
      supplement = argv[++i]!;
    } else if (argv[i] === "--compare-base" && argv[i + 1]) {
      compareBase = argv[++i]!;
    } else if (argv[i] === "--head-ref" && argv[i + 1]) {
      headRef = argv[++i]!;
    }
  }
  if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    console.error(
      "Usage: render_github_release_notes.ts --tag vX.Y.Z [--supplement path.md] [--compare-base vA.B.C] [--head-ref ref]",
    );
    process.exit(1);
  }
  if (compareBase && !/^v\d+\.\d+\.\d+$/.test(compareBase)) {
    console.error("Invalid --compare-base: expected vX.Y.Z");
    process.exit(1);
  }
  if (compareBase && compareBase === tag) {
    console.error("--compare-base must differ from --tag");
    process.exit(1);
  }
  return { tag, supplement, compareBase, headRef };
}

function main(): void {
  const { tag, supplement, compareBase, headRef } = parseArgs(process.argv.slice(2));
  const prev = (compareBase ?? "").trim() || previousTag(tag);
  const npmVersion = tag.replace(/^v/, "");
  const slug = getRepoSlug();
  const rangeEnd = (headRef ?? "").trim() || tag;
  const compareUrl = prev
    ? `https://github.com/${slug}/compare/${prev}...${tag}`
    : `https://github.com/${slug}/releases/tag/${tag}`;

  const manualBody = resolveSupplement(tag, supplement);
  const gitLog = gitLogMarkdown(prev, rangeEnd);

  let out = readWrap();
  out = out
    .replaceAll("{{TAG}}", tag)
    .replaceAll("{{NPM_VERSION}}", npmVersion)
    .replaceAll("{{PREV_TAG}}", prev || "(initial)")
    .replaceAll("{{COMPARE_URL}}", compareUrl)
    .replaceAll("{{MANUAL_BODY}}", manualBody)
    .replaceAll("{{GIT_LOG}}", gitLog);

  process.stdout.write(out + "\n");
}

main();
