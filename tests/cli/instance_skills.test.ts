/**
 * Tests for instance-skill materialization and harness linking (#1950).
 *
 * Exercises the pure filesystem surface (`src/cli/instance_skills.ts`) against
 * temporary directories; no network involved (skill rows are passed in
 * directly, as `instance_skills_client.ts` would supply them).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getInstanceSkillsRoot,
  hasInstanceSkillProvenance,
  linkInstanceSkillsToHarnesses,
  materializeInstanceSkills,
  renderInstanceSkillMarkdown,
  resolveSkillDirName,
  INSTANCE_SKILL_PROVENANCE_MARKER,
} from "../../src/cli/instance_skills.ts";
import type { InstanceSkillRow } from "../../src/cli/instance_skills_client.ts";

let root: string;
let homeDir: string;
let packageSkillsDir: string;

function makeRow(overrides: Partial<InstanceSkillRow> = {}): InstanceSkillRow {
  return {
    entity_id: "ent_abc123",
    name: "score-leads",
    description: "Score leads against an ICP",
    triggers: ["score my leads"],
    content: "# Score leads\n\n1. Fetch contacts.\n2. Apply weights.\n",
    slug: "score-leads",
    user_invocable: true,
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "instskills-"));
  homeDir = path.join(root, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  packageSkillsDir = path.join(root, "pkg-skills");
  fs.mkdirSync(path.join(packageSkillsDir, "query-memory"), { recursive: true });
  fs.writeFileSync(
    path.join(packageSkillsDir, "query-memory", "SKILL.md"),
    "---\nname: query-memory\n---\n"
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("renderInstanceSkillMarkdown", () => {
  it("renders frontmatter, provenance header, and content body", () => {
    const row = makeRow();
    const md = renderInstanceSkillMarkdown(row, { instanceHost: "example.neotoma.app" });

    expect(md).toContain("name: score-leads");
    expect(md).toContain("description: Score leads against an ICP");
    expect(md).toContain("triggers:");
    expect(md).toContain("  - score my leads");
    expect(md).toContain("user_invocable: true");
    expect(md).toContain(INSTANCE_SKILL_PROVENANCE_MARKER);
    expect(md).toContain("source_entity_id: ent_abc123");
    expect(md).toContain("instance: example.neotoma.app");
    expect(md).toContain("# Score leads");
    expect(md).toContain("2. Apply weights.");
  });

  it("quotes description strings containing YAML-significant characters", () => {
    const row = makeRow({ description: 'Say "hello": use a colon' });
    const md = renderInstanceSkillMarkdown(row, { instanceHost: "h" });
    expect(md).toContain('description: "Say \\"hello\\": use a colon"');
  });

  it("omits triggers/user_invocable blocks when absent", () => {
    const row = makeRow({ triggers: undefined, user_invocable: undefined });
    const md = renderInstanceSkillMarkdown(row, { instanceHost: "h" });
    expect(md).not.toContain("triggers:");
    expect(md).not.toContain("user_invocable:");
  });
});

describe("resolveSkillDirName", () => {
  it("prefers slug over name and kebab-cases it", () => {
    expect(resolveSkillDirName({ name: "Score Leads", slug: "score-leads" })).toBe("score-leads");
  });

  it("falls back to a kebab-cased name when slug is absent", () => {
    expect(resolveSkillDirName({ name: "Score My Leads!" })).toBe("score-my-leads");
  });
});

describe("hasInstanceSkillProvenance", () => {
  it("returns true only for files carrying the provenance marker", () => {
    const withMarker = path.join(root, "with.md");
    const without = path.join(root, "without.md");
    fs.writeFileSync(withMarker, `<!-- ${INSTANCE_SKILL_PROVENANCE_MARKER} -->`);
    fs.writeFileSync(without, "just some user content");
    expect(hasInstanceSkillProvenance(withMarker)).toBe(true);
    expect(hasInstanceSkillProvenance(without)).toBe(false);
    expect(hasInstanceSkillProvenance(path.join(root, "missing.md"))).toBe(false);
  });
});

describe("materializeInstanceSkills", () => {
  it("writes a SKILL.md per enabled row under the instance-skills root", () => {
    const result = materializeInstanceSkills([makeRow()], {
      instanceHost: "example.neotoma.app",
      homeDir,
      packageSkillsSourceDir: packageSkillsDir,
    });

    expect(result.root).toBe(getInstanceSkillsRoot("example.neotoma.app", homeDir));
    expect(result.written).toEqual(["score-leads"]);
    expect(result.skippedCollisions).toEqual([]);
    expect(fs.existsSync(path.join(result.root, "score-leads", "SKILL.md"))).toBe(true);
  });

  it("skips a row whose slug collides with a package skill, and never writes it (package wins)", () => {
    const row = makeRow({ name: "query-memory", slug: "query-memory" });
    const result = materializeInstanceSkills([row], {
      instanceHost: "h",
      homeDir,
      packageSkillsSourceDir: packageSkillsDir,
    });

    expect(result.written).toEqual([]);
    expect(result.skippedCollisions).toHaveLength(1);
    expect(result.skippedCollisions[0].name).toBe("query-memory");
    expect(fs.existsSync(path.join(result.root, "query-memory"))).toBe(false);
  });

  it("is idempotent: re-running with unchanged rows reports nothing written", () => {
    const opts = { instanceHost: "h", homeDir, packageSkillsSourceDir: packageSkillsDir };
    materializeInstanceSkills([makeRow()], opts);
    const second = materializeInstanceSkills([makeRow()], opts);
    expect(second.written).toEqual([]);
  });

  it("updates the file when content changes", () => {
    const opts = { instanceHost: "h", homeDir, packageSkillsSourceDir: packageSkillsDir };
    materializeInstanceSkills([makeRow()], opts);
    const updated = materializeInstanceSkills(
      [makeRow({ content: "# Score leads\n\nNew instructions.\n" })],
      opts
    );
    expect(updated.written).toEqual(["score-leads"]);
  });

  it("prunes a materialized dir whose row disappeared, preserving the provenance guard", () => {
    const opts = { instanceHost: "h", homeDir, packageSkillsSourceDir: packageSkillsDir };
    materializeInstanceSkills([makeRow()], opts);
    const afterRemoval = materializeInstanceSkills([], opts);
    expect(afterRemoval.pruned).toEqual(["score-leads"]);
    expect(fs.existsSync(path.join(afterRemoval.root, "score-leads"))).toBe(false);
  });

  it("never prunes a directory lacking the provenance header (user-authored dir with a colliding slug)", () => {
    const opts = { instanceHost: "h", homeDir, packageSkillsSourceDir: packageSkillsDir };
    const first = materializeInstanceSkills([makeRow()], opts);
    // Simulate a user hand-editing the file to remove the provenance marker.
    const skillMd = path.join(first.root, "score-leads", "SKILL.md");
    fs.writeFileSync(skillMd, "---\nname: score-leads\n---\n\nHand-authored, no provenance.\n");

    const afterRemoval = materializeInstanceSkills([], opts);
    expect(afterRemoval.pruned).toEqual([]);
    expect(fs.existsSync(path.join(first.root, "score-leads"))).toBe(true);
  });

  it("excludes disabled rows from materialization (client-side filtering happens upstream, but a disabled row passed in directly is still written by this function — enabled filtering is the client's job)", () => {
    // materializeInstanceSkills itself does not re-check `enabled`; that's
    // fetchEnabledInstanceSkills' job (client module). Documented here as a
    // boundary check so a future refactor doesn't silently start relying on
    // this function to filter.
    const row = makeRow({ enabled: false });
    const result = materializeInstanceSkills([row], {
      instanceHost: "h",
      homeDir,
      packageSkillsSourceDir: packageSkillsDir,
    });
    expect(result.written).toEqual(["score-leads"]);
  });
});

describe("linkInstanceSkillsToHarnesses", () => {
  it("links materialized instance skills into an installed harness using per-skill symlinks", () => {
    const opts = { instanceHost: "h", homeDir, packageSkillsSourceDir: packageSkillsDir };
    const materialized = materializeInstanceSkills([makeRow()], opts);

    const cwd = path.join(root, "project");
    fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });

    const results = linkInstanceSkillsToHarnesses(materialized.root, { cwd, scope: "project" });
    const claude = results.find((r) => r.tool === "claude-code");
    expect(claude?.changed).toBe(true);
    expect(claude?.linked).toEqual(["score-leads"]);
    expect(fs.lstatSync(path.join(cwd, ".claude", "skills", "score-leads")).isSymbolicLink()).toBe(
      true
    );
  });

  it("skips a harness whose base directory is absent", () => {
    const opts = { instanceHost: "h", homeDir, packageSkillsSourceDir: packageSkillsDir };
    const materialized = materializeInstanceSkills([makeRow()], opts);
    const cwd = path.join(root, "project2");
    fs.mkdirSync(cwd, { recursive: true });

    const results = linkInstanceSkillsToHarnesses(materialized.root, { cwd, scope: "project" });
    const codex = results.find((r) => r.tool === "codex");
    expect(codex?.skipped).toBe(true);
  });

  it("reports skipped with no instance skills materialized", () => {
    const emptyRoot = path.join(root, "empty-instance-root");
    fs.mkdirSync(emptyRoot, { recursive: true });
    const cwd = path.join(root, "project3");
    fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });

    const results = linkInstanceSkillsToHarnesses(emptyRoot, { cwd, scope: "project" });
    const claude = results.find((r) => r.tool === "claude-code");
    expect(claude?.skipped).toBe(true);
    expect(claude?.reason).toMatch(/no instance skills/);
  });
});
