/**
 * Docs hygiene rules for markdown that must read correctly on GitHub and in the
 * neotoma.io docs viewer. See docs/conventions/documentation_standards.md.
 *
 * Pure functions over a file's text plus a resolver for relative links, so the
 * same rule list can back a unit test today and a docs-viewer lint later. No
 * network access.
 *
 * Rules (each finding names its rule id):
 * - fence-language: every opening code fence names a language
 * - mermaid: no Mermaid fences (the viewer does not render them)
 * - heading-depth: headings are h1 to h3, and there is exactly one h1
 * - task-list: no `- [ ]` / `- [x]` items
 * - status-emoji: no pictographic emoji outside verbatim `text` fences
 * - dash: no em or en dashes outside verbatim `text` fences
 * - link: every relative link target exists
 * - anchor: every `#anchor` (same page or in a linked .md file) matches a heading slug
 * - retired-phrase: retired category nouns appear only on allowlisted lines
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type HygieneRule =
  | "fence-language"
  | "mermaid"
  | "heading-depth"
  | "task-list"
  | "status-emoji"
  | "dash"
  | "link"
  | "anchor"
  | "retired-phrase";

export interface HygieneFinding {
  rule: HygieneRule;
  line: number;
  text: string;
}

/** Retired category nouns (docs/vocabulary/canonical_terms.md). Matched case-insensitively. */
export const RETIRED_PHRASES: readonly string[] = [
  "state layer",
  "memory layer",
  "truth layer",
  "deterministic state",
];

/** Fence info strings whose content is verbatim output and may keep dashes and symbols. */
export const VERBATIM_OUTPUT_FENCE_LANGS: readonly string[] = ["text"];

export interface HygieneOptions {
  /**
   * Lines (exact trimmed text) on which a retired phrase is allowed, because the
   * line names it as forbidden. Every entry must match a line, so the list
   * cannot go stale silently.
   */
  retiredPhraseAllowedLines?: readonly string[];
  /**
   * Repository root. A relative link that resolves outside it is reported as a
   * dead link instead of being read. Defaults to the current working directory.
   */
  repoRoot?: string;
}

const STATUS_EMOJI = /\p{Extended_Pictographic}/u;
const DASH = /[–—]/;

interface ParsedLine {
  n: number;
  text: string;
  inFence: boolean;
  fenceLang: string | null;
}

interface Parsed {
  lines: ParsedLine[];
  fences: { line: number; lang: string }[];
  headings: { line: number; level: number; text: string }[];
}

export function parseMarkdown(source: string): Parsed {
  const raw = source.split("\n");
  const lines: ParsedLine[] = [];
  const fences: { line: number; lang: string }[] = [];
  const headings: { line: number; level: number; text: string }[] = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let fenceLang: string | null = null;
  let inFrontMatter = false;
  raw.forEach((text, i) => {
    const n = i + 1;
    if (n === 1 && text.trim() === "---") {
      inFrontMatter = true;
      return;
    }
    if (inFrontMatter) {
      if (text.trim() === "---") inFrontMatter = false;
      return;
    }
    const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(text);
    if (m) {
      const marker = m[1]!;
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0]!;
        fenceLen = marker.length;
        fenceLang = m[2]!.trim().split(/\s+/)[0] ?? "";
        fences.push({ line: n, lang: fenceLang });
        lines.push({ n, text, inFence: false, fenceLang: null });
        return;
      }
      if (marker[0] === fenceChar && marker.length >= fenceLen && m[2]!.trim() === "") {
        inFence = false;
        lines.push({ n, text, inFence: false, fenceLang: null });
        fenceLang = null;
        return;
      }
    }
    lines.push({ n, text, inFence, fenceLang: inFence ? fenceLang : null });
    if (!inFence) {
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(text);
      if (h) headings.push({ line: n, level: h[1]!.length, text: h[2]! });
    }
  });
  return { lines, fences, headings };
}

/** GitHub heading slug: lowercase, drop punctuation except `-` and `_`, spaces to `-`. */
export function githubSlug(heading: string): string {
  const plain = heading
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim()
    .toLowerCase();
  return Array.from(plain)
    .filter((ch) => ch === "-" || ch === "_" || ch === " " || /[\p{L}\p{N}]/u.test(ch))
    .join("")
    .replace(/ /g, "-");
}

/** All anchors a file's headings produce, with GitHub's `-1`, `-2` suffixes for repeats. */
export function headingAnchors(source: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const h of parseMarkdown(source).headings) {
    const slug = githubSlug(h.text);
    const count = seen.get(slug);
    if (count === undefined) {
      seen.set(slug, 0);
      out.add(slug);
    } else {
      seen.set(slug, count + 1);
      out.add(`${slug}-${count + 1}`);
    }
  }
  return out;
}

function stripInlineCode(text: string): string {
  return text.replace(/`[^`]*`/g, "");
}

/**
 * Check one markdown file. `filePath` is used to resolve relative links; pass
 * the absolute path of the file on disk.
 */
export function checkMarkdownFile(
  filePath: string,
  source: string,
  options: HygieneOptions = {}
): { findings: HygieneFinding[]; unusedAllowlist: string[] } {
  const findings: HygieneFinding[] = [];
  const parsed = parseMarkdown(source);
  const add = (rule: HygieneRule, line: number, text: string) =>
    findings.push({ rule, line, text: text.trim().slice(0, 160) });

  for (const f of parsed.fences) {
    if (!f.lang) add("fence-language", f.line, "fence without a language");
    else if (f.lang.toLowerCase() === "mermaid") add("mermaid", f.line, "mermaid fence");
  }

  const h1 = parsed.headings.filter((h) => h.level === 1);
  if (h1.length !== 1)
    add("heading-depth", h1[1]?.line ?? 1, `expected one h1, found ${h1.length}`);
  for (const h of parsed.headings) {
    if (h.level > 3) add("heading-depth", h.line, `h${h.level}: ${h.text}`);
  }

  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const allowed = new Set((options.retiredPhraseAllowedLines ?? []).map((s) => s.trim()));
  const usedAllow = new Set<string>();
  const ownAnchors = headingAnchors(source);
  const anchorCache = new Map<string, Set<string>>();

  for (const l of parsed.lines) {
    const verbatim =
      l.inFence && l.fenceLang !== null && VERBATIM_OUTPUT_FENCE_LANGS.includes(l.fenceLang);

    if (!verbatim && DASH.test(l.text)) add("dash", l.n, l.text);
    if (!verbatim && STATUS_EMOJI.test(l.text)) add("status-emoji", l.n, l.text);

    const lower = l.text.toLowerCase();
    if (RETIRED_PHRASES.some((p) => lower.includes(p))) {
      const key = l.text.trim();
      if (allowed.has(key)) usedAllow.add(key);
      else add("retired-phrase", l.n, l.text);
    }

    if (l.inFence) continue;
    if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(l.text)) add("task-list", l.n, l.text);

    const prose = stripInlineCode(l.text);
    for (const m of prose.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1]!;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
      if (target.startsWith("#")) {
        if (!ownAnchors.has(target.slice(1))) add("anchor", l.n, `dead same-page anchor ${target}`);
        continue;
      }
      const [filePart, anchor] = target.split("#", 2) as [string, string | undefined];
      if (filePart.startsWith("/")) {
        add("link", l.n, `root-relative link ${target}; use a path relative to the file`);
        continue;
      }
      let decoded: string;
      try {
        decoded = decodeURIComponent(filePart);
      } catch {
        add("link", l.n, `malformed percent-encoding in link ${target}`);
        continue;
      }
      const resolved = path.resolve(path.dirname(filePath), decoded);
      const fromRoot = path.relative(repoRoot, resolved);
      if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
        add("link", l.n, `link ${target} resolves outside the repository`);
        continue;
      }
      if (!existsSync(resolved)) {
        add("link", l.n, `dead link ${target}`);
        continue;
      }
      if (anchor && resolved.endsWith(".md")) {
        let anchors = anchorCache.get(resolved);
        if (!anchors) {
          anchors = headingAnchors(readFileSync(resolved, "utf8"));
          anchorCache.set(resolved, anchors);
        }
        if (!anchors.has(anchor)) add("anchor", l.n, `dead anchor ${target}`);
      }
    }
  }

  const unusedAllowlist = [...allowed].filter((a) => !usedAllow.has(a));
  return { findings, unusedAllowlist };
}
