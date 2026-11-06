/**
 * Tests for issue #205: MCP initialize response exposes available skills
 * and the instructions block contains an [INITIALIZATION] section directing
 * agents to orient themselves at session start.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { listInstallableSkillNames } from "../../src/cli/skills_mirror.js";

import {
  extractFirstFencedCodeBlock,
  readMcpInstructionsMarkdown,
  resolveNeotomaPackageRoot,
} from "../../src/mcp_instruction_doc.js";

describe("MCP initialize — skills discovery", () => {
  it("skills directory is present in the package root", () => {
    const root = resolveNeotomaPackageRoot();
    const skillsDir = join(root, "skills");
    expect(existsSync(skillsDir)).toBe(true);
  });

  it("skills directory contains at least one subdirectory", () => {
    const root = resolveNeotomaPackageRoot();
    const skillsDir = join(root, "skills");
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const dirs = entries.filter((d) => d.isDirectory());
    expect(dirs.length).toBeGreaterThan(0);
  });

  it("each skill subdirectory has a SKILL.md file", () => {
    const root = resolveNeotomaPackageRoot();
    const skillsDir = join(root, "skills");
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const dirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);
    for (const name of dirs) {
      const skillMd = join(skillsDir, name, "SKILL.md");
      expect(existsSync(skillMd), `Missing SKILL.md in skills/${name}`).toBe(true);
    }
  });

  it("known shipped skills are present", () => {
    const root = resolveNeotomaPackageRoot();
    const skillsDir = join(root, "skills");
    const names = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const required = [
      "ensure-neotoma",
      "recover-sqlite-database",
      "remember-codebase",
      "continue-session",
      "status",
    ];
    for (const skill of required) {
      expect(names, `Expected skill "${skill}" to be present`).toContain(skill);
    }
  });

  it("retired primitive-wrapper skills stay on disk but are marked deprecated", () => {
    const root = resolveNeotomaPackageRoot();
    const skillsDir = join(root, "skills");
    for (const skill of ["store-data", "query-memory"]) {
      const skillMdPath = join(skillsDir, skill, "SKILL.md");
      expect(existsSync(skillMdPath), `Expected retired skill "${skill}" to still be on disk`).toBe(
        true
      );
      const raw = readFileSync(skillMdPath, "utf-8");
      expect(raw, `Expected "${skill}" SKILL.md to declare deprecated: true`).toMatch(
        /^deprecated:\s*true\s*$/m
      );
    }
  });
});

describe("MCP instructions — [INITIALIZATION] section", () => {
  it("instructions.md contains an [INITIALIZATION] section", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    expect(raw).toBeTruthy();
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toBeTruthy();
    expect(body).toContain("[INITIALIZATION]");
  });

  it("[INITIALIZATION] directs agents to call get_session_identity at session start", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toMatch(/get_session_identity/);
    expect(body).toMatch(/session start|start of every session/i);
  });

  it("[INITIALIZATION] directs agents to call list_entity_types at session start", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toMatch(/list_entity_types/);
  });

  it("[INITIALIZATION] documents serverInfo._neotoma.available_skills", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toContain("serverInfo._neotoma.available_skills");
    expect(body).toMatch(/available.?skills/i);
  });

  it("keeps direct MCP storage and retrieval guidance after retiring the wrapper skills", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toContain("[STORE RECIPES]");
    expect(body).toContain("[RETRIEVAL]");
    expect(body).toMatch(/Ordinary storage and retrieval need no skill/i);
    expect(body).toContain("retrieve_entities");
    expect(body).toContain("store");
    expect(body).toContain("remember-codebase");
    expect(body).toMatch(/query-memory[\s\S]*store-data[\s\S]*excluded from this list by design/);
  });

  it("[INITIALIZATION] appears after [ERRORS & RECOVERY] and before [ONBOARDING]", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toBeTruthy();
    const errIdx = body!.indexOf("[ERRORS & RECOVERY]");
    const initIdx = body!.indexOf("[INITIALIZATION]");
    const onbIdx = body!.indexOf("[ONBOARDING]");
    expect(errIdx).toBeGreaterThan(-1);
    expect(initIdx).toBeGreaterThan(-1);
    expect(onbIdx).toBeGreaterThan(-1);
    expect(initIdx).toBeGreaterThan(errIdx);
    expect(onbIdx).toBeGreaterThan(initIdx);
  });
});

describe("continuation and digest package entrypoints", () => {
  const expected = [
    { directory: "continue-session", name: "continue-session", trigger: "/continue-session" },
    { directory: "status", name: "digest", trigger: "/digest" },
  ];

  it.each(expected)(
    "loads $directory with its actual invocation and restrictive effect metadata",
    ({ directory, name, trigger }) => {
      const raw = readFileSync(
        join(resolveNeotomaPackageRoot(), "skills", directory, "SKILL.md"),
        "utf8"
      );
      // The package's own deprecation reader and the harness format both anchor
      // frontmatter at the start: a leading generated banner must not hide it.
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      expect(match, "YAML must be the first document block").not.toBeNull();
      const metadata = load(match![1]) as Record<string, unknown>;
      expect(metadata.name).toBe(name);
      expect(metadata.description).toEqual(expect.any(String));
      expect((metadata.description as string).length).toBeGreaterThan(10);
      expect(metadata.user_invocable).toBe(true);
      expect(metadata.triggers).toContain(trigger);
      expect(metadata.supported_harnesses).toEqual(
        expect.arrayContaining(["claude-code", "cursor"])
      );
      expect(metadata.side_effect_class).toBe("state_changing");
      expect(metadata.entity_id).toMatch(/^ent_[a-f0-9]{24}$/);
    }
  );
});

describe("packaged skill caller contracts", () => {
  const root = resolveNeotomaPackageRoot();
  const skill = (name: string) => readFileSync(join(root, "skills", name, "SKILL.md"), "utf8");

  it.each(["README.md", "docs/topics/install/system-changes.md"])(
    "keeps %s consistent with the actual installable package",
    (source) => {
      const count = listInstallableSkillNames(join(root, "skills")).length;
      const text = readFileSync(join(root, source), "utf8");
      if (source === "README.md") {
        expect(Number(/links (\d+) Neotoma skills/.exec(text)?.[1])).toBe(count);
        return;
      }
      const words = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
      ];
      const declared = /\b(\w+) Claude Code skills\b/i.exec(text)?.[1].toLowerCase();
      expect(
        words.indexOf(declared ?? ""),
        "install effects must disclose the installed count"
      ).toBe(count);
    }
  );

  it("routes every where readout escalation to the explicit zero-write digest mode", () => {
    const where = skill("where");
    expect(where).not.toContain("/status");
    const sections = where.split(/^## /m);
    for (const title of [
      "The trio",
      "The verification boundary",
      "The one query",
      "What to report",
      "What was deliberately dropped",
      "Constraints",
    ]) {
      const section = sections.find((s) => s.startsWith(title));
      expect(section, title).toBeDefined();
      expect(section, title).toContain("/digest --report-only");
    }
    const tableRow = where
      .split("\n")
      .find((line) => line.startsWith("| **`/digest --report-only`**"));
    expect(tableRow).toMatch(/\| \*\*none\*\* — no domain or bookkeeping writes \|/);
    expect(where).toContain("`/digest --report-only project`");
    expect(where).toContain("default `/digest` reports, acts, and writes");
    expect(where).toContain("MUST NOT act on a next step in the same turn");
    expect(where).toContain("no `session_digest`");
    expect(where).not.toMatch(/only exists once `\/digest --report-only` has run/);
    // Every proposed digest invocation in a readout-only caller must select the
    // read-only mode. Bare /digest is permitted only when explaining its default.
    for (const line of where.split("\n")) {
      for (const match of line.matchAll(/`(\/digest[^`]*)`/g)) {
        if (!match[1].startsWith("/digest --report-only")) {
          expect(match[1]).toBe("/digest");
          expect(line).toMatch(/default `\/digest`/);
        }
      }
    }
  });

  it("keeps the end comparison read-only without changing the acting digest default", () => {
    const end = skill("end");
    expect(end).not.toContain("/status");
    expect(end).toContain("for `/digest --report-only`");
    expect(end).toContain("zero writes, including bookkeeping, and takes no next action");
    expect(end).toContain("default `/digest` reports, acts, and writes");
    const digest = skill("status");
    expect(digest).toContain("--report-only");
    expect(digest).toContain("do not file, dispatch, act, or write/update a `session_digest`");
  });

  it("retains the whole-document fallback without a fixed harness capability claim", () => {
    const continuation = skill("continue-session");
    expect(continuation).not.toMatch(
      /ChatGPT, Codex, and most other assistants have no\s+equivalent/
    );
    expect(continuation).toContain(
      "Check the current harness's supported skill-discovery capability"
    );
    expect(continuation).toContain(
      "pasted whole into any assistant with a shell as an ordinary document"
    );
    expect(continuation).toContain("Nothing below depends on a skill runtime");
  });
});
