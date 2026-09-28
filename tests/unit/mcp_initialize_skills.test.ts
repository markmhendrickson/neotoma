/**
 * Tests for issue #205: MCP initialize response exposes available skills
 * and the instructions block contains an [INITIALIZATION] section directing
 * agents to orient themselves at session start.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
    const required = ["ensure-neotoma", "recover-sqlite-database", "remember-codebase"];
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
