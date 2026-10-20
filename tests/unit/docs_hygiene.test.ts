/**
 * Docs hygiene for the docs that follow docs/conventions/documentation_standards.md.
 *
 * The rules live in scripts/docs_hygiene.ts. Each doc listed here must pass all of
 * them; retired category nouns may appear only on the explicitly allowlisted lines
 * that name them as forbidden, and every allowlist entry must still match a line.
 * When another doc is brought up to the standards, add it to DOCS.
 *
 * No network access and no build step: this reads files from the working tree.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkMarkdownFile, type HygieneRule } from "../../scripts/docs_hygiene.ts";

const REPO_ROOT = path.resolve(__dirname, "../..");

interface DocEntry {
  path: string;
  /** Lines that may contain a retired phrase, with the reason they are allowed. */
  retiredPhraseAllowedLines?: { line: string; reason: string }[];
}

const DOCS: DocEntry[] = [
  {
    path: "docs/architecture/architecture.md",
    retiredPhraseAllowedLines: [
      {
        line: "- Describing Neotoma as a memory layer or a state layer (see the canonical vocabulary)",
        reason: "Forbidden Patterns entry naming the retired nouns",
      },
    ],
  },
  {
    path: "docs/vocabulary/canonical_terms.md",
    retiredPhraseAllowedLines: [
      { line: '- "state layer" (retired category noun)', reason: "forbidden synonym" },
      { line: '- "memory layer" (retired category noun)', reason: "forbidden synonym" },
      { line: '- "truth layer" (retired category noun)', reason: "forbidden synonym" },
      {
        line: '- "deterministic state" (retired category noun; the reducer is deterministic, the category is not named after it)',
        reason: "forbidden synonym",
      },
      {
        line: '- "memory layer", "state layer", "truth layer", and "deterministic state" as names for what Neotoma is: say "system of record"',
        reason: "Forbidden terms list",
      },
      {
        line: '- "Neotoma is the memory layer for your agents."',
        reason: '"Avoid" usage example',
      },
    ],
  },
  {
    path: "docs/conventions/documentation_standards.md",
    retiredPhraseAllowedLines: [
      {
        line: '- The category noun is "system of record". The retired category nouns are "memory layer", "state layer", "truth layer", and "deterministic state", and "your agents forget" is a retired framing. Do not use them to describe Neotoma.',
        reason: "Claim rules entry naming the retired nouns",
      },
    ],
  },
];

describe("docs hygiene", () => {
  for (const doc of DOCS) {
    it(`${doc.path} follows the documentation standards`, () => {
      const abs = path.join(REPO_ROOT, doc.path);
      const source = readFileSync(abs, "utf8");
      const { findings, unusedAllowlist } = checkMarkdownFile(abs, source, {
        retiredPhraseAllowedLines: (doc.retiredPhraseAllowedLines ?? []).map((a) => a.line),
      });
      const report = findings.map((f) => `${doc.path}:${f.line} [${f.rule}] ${f.text}`);
      expect(report, report.join("\n")).toEqual([]);
      expect(unusedAllowlist, "allowlist entries that no longer match a line").toEqual([]);
    });
  }
});

describe("docs hygiene rules", () => {
  const fakePath = path.join(REPO_ROOT, "docs/conventions/__hygiene_fixture__.md");
  const base =
    "# Title\n\nOne summary sentence.\n\nApplies to v0.25.0 and main.\n\n## Section\n\nText.\n";
  const rulesFor = (source: string): HygieneRule[] =>
    checkMarkdownFile(fakePath, source).findings.map((f) => f.rule);

  it("passes a clean document", () => {
    expect(rulesFor(base)).toEqual([]);
  });

  const cases: [string, string, HygieneRule][] = [
    ["State Layer", "Neotoma is the State Layer.\n", "retired-phrase"],
    ["memory layer", "A memory layer for agents.\n", "retired-phrase"],
    ["em dash", "One clause — another.\n", "dash"],
    ["en dash", "Pages 1–2.\n", "dash"],
    ["untagged fence", "```\nneotoma status\n```\n", "fence-language"],
    ["mermaid fence", "```mermaid\nflowchart TD\n```\n", "mermaid"],
    ["task list", "- [ ] do the thing\n", "task-list"],
    ["status emoji", "✅ done\n", "status-emoji"],
    ["dead relative link", "See [missing](./does_not_exist.md).\n", "link"],
    ["dead same-page anchor", "See [section](#no-such-section).\n", "anchor"],
    [
      "dead cross-file anchor",
      "See [terms](../vocabulary/canonical_terms.md#no-such-term).\n",
      "anchor",
    ],
    ["h5 heading", "##### Too deep\n", "heading-depth"],
  ];
  for (const [name, snippet, rule] of cases) {
    it(`flags ${name}`, () => {
      expect(rulesFor(base + "\n" + snippet)).toContain(rule);
    });
  }

  it("allows dashes and symbols inside verbatim text fences", () => {
    expect(rulesFor(base + "\n```text\nscan: codex — 3 files ⚠\n```\n")).toEqual([]);
  });

  it("still flags dashes inside shell fences", () => {
    expect(rulesFor(base + "\n```bash\n# step — one\n```\n")).toContain("dash");
  });

  it("resolves a real cross-file anchor", () => {
    expect(rulesFor(base + "\nSee [source](../vocabulary/canonical_terms.md#source).\n")).toEqual(
      []
    );
  });
});
