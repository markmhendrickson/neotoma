/**
 * Unit tests for MirrorProfile helpers in canonical_mirror.ts.
 *
 * These are pure-function tests: no DB, no filesystem writes (except where
 * detectGitRoot / checkProfileGitSafety need a real .git presence).
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyProfileFieldFilter,
  checkProfileGitSafety,
  detectGitRoot,
  profileEntityFilePath,
  profileMatchesEntity,
} from "../../src/services/canonical_mirror.ts";
import type { MirrorProfile } from "../../src/services/canonical_mirror.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<MirrorProfile> = {}): MirrorProfile {
  return {
    id: "test-profile",
    entity_type: "plan",
    filter: { repository_name: "neotoma" },
    output_path: "/tmp/test-output",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// profileMatchesEntity
// ---------------------------------------------------------------------------

describe("profileMatchesEntity", () => {
  it("returns true for matching entity type and filter", () => {
    const profile = makeProfile();
    expect(
      profileMatchesEntity(profile, "plan", { repository_name: "neotoma" })
    ).toBe(true);
  });

  it("returns false when entity_type differs", () => {
    const profile = makeProfile();
    expect(
      profileMatchesEntity(profile, "issue", { repository_name: "neotoma" })
    ).toBe(false);
  });

  it("returns false when filter field does not match", () => {
    const profile = makeProfile();
    expect(
      profileMatchesEntity(profile, "plan", { repository_name: "ateles" })
    ).toBe(false);
  });

  it("returns false when filter field is absent from snapshot", () => {
    const profile = makeProfile();
    expect(profileMatchesEntity(profile, "plan", {})).toBe(false);
  });

  it("supports array filter values — matches when snapshot value is in list", () => {
    const profile = makeProfile({ filter: { status: ["active", "draft"] } });
    expect(profileMatchesEntity(profile, "plan", { status: "active" })).toBe(true);
    expect(profileMatchesEntity(profile, "plan", { status: "draft" })).toBe(true);
    expect(profileMatchesEntity(profile, "plan", { status: "archived" })).toBe(false);
  });

  it("supports multiple filter fields — all must match", () => {
    const profile = makeProfile({
      filter: { repository_name: "neotoma", status: "active" },
    });
    expect(
      profileMatchesEntity(profile, "plan", {
        repository_name: "neotoma",
        status: "active",
      })
    ).toBe(true);
    expect(
      profileMatchesEntity(profile, "plan", {
        repository_name: "neotoma",
        status: "draft",
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyProfileFieldFilter
// ---------------------------------------------------------------------------

describe("applyProfileFieldFilter", () => {
  const snapshot = { title: "My plan", status: "active", internal_id: "x1" };

  it("returns snapshot unchanged when no field constraints are set", () => {
    const profile = makeProfile();
    expect(applyProfileFieldFilter(profile, snapshot)).toEqual(snapshot);
  });

  it("respects include_fields — only listed fields survive", () => {
    const profile = makeProfile({ include_fields: ["title", "status"] });
    const result = applyProfileFieldFilter(profile, snapshot);
    expect(result).toEqual({ title: "My plan", status: "active" });
    expect(result).not.toHaveProperty("internal_id");
  });

  it("respects exclude_fields — listed fields are removed", () => {
    const profile = makeProfile({ exclude_fields: ["internal_id"] });
    const result = applyProfileFieldFilter(profile, snapshot);
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("status");
    expect(result).not.toHaveProperty("internal_id");
  });

  it("include_fields takes precedence over exclude_fields when both set", () => {
    const profile = makeProfile({
      include_fields: ["title"],
      exclude_fields: ["status"],
    });
    const result = applyProfileFieldFilter(profile, snapshot);
    // include_fields wins: only title survives
    expect(result).toEqual({ title: "My plan" });
  });

  it("include_fields with a field not in snapshot just omits it", () => {
    const profile = makeProfile({ include_fields: ["title", "nonexistent"] });
    const result = applyProfileFieldFilter(profile, snapshot);
    expect(result).toEqual({ title: "My plan" });
  });

  it("does not mutate the original snapshot", () => {
    const profile = makeProfile({ exclude_fields: ["internal_id"] });
    const copy = { ...snapshot };
    applyProfileFieldFilter(profile, snapshot);
    expect(snapshot).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// profileEntityFilePath
// ---------------------------------------------------------------------------

describe("profileEntityFilePath", () => {
  it("defaults to {slug}.md template", () => {
    const profile = makeProfile({ output_path: "/out" });
    const result = profileEntityFilePath(profile, "ent_abc123", "my plan");
    expect(result).toMatch(/^\/out\/my-plan-[a-f0-9]+\.md$/);
  });

  it("honours custom filename_template with {entity_id}", () => {
    const profile = makeProfile({
      output_path: "/out",
      filename_template: "{entity_id}.md",
    });
    const result = profileEntityFilePath(profile, "ent_abc123", "my plan");
    expect(result).toBe("/out/ent_abc123.md");
  });

  it("honours custom filename_template with {canonical_name}", () => {
    const profile = makeProfile({
      output_path: "/out",
      filename_template: "{canonical_name}.md",
    });
    const result = profileEntityFilePath(profile, "ent_abc123", "My Plan");
    expect(result).toBe("/out/my-plan.md");
  });
});

// ---------------------------------------------------------------------------
// detectGitRoot / checkProfileGitSafety
// ---------------------------------------------------------------------------

describe("detectGitRoot", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mirror-profile-test-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns null when no .git dir exists in ancestor chain", () => {
    const subDir = path.join(tmpRoot, "a", "b", "c");
    mkdirSync(subDir, { recursive: true });
    expect(detectGitRoot(subDir)).toBeNull();
  });

  it("returns the root containing .git when present", () => {
    const gitDir = path.join(tmpRoot, ".git");
    mkdirSync(gitDir, { recursive: true });
    const subDir = path.join(tmpRoot, "docs", "plans");
    mkdirSync(subDir, { recursive: true });
    const found = detectGitRoot(subDir);
    expect(found).toBe(tmpRoot);
  });
});

describe("checkProfileGitSafety", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mirror-profile-test-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns null when output_path is not inside a git repo", () => {
    const outDir = path.join(tmpRoot, "output");
    mkdirSync(outDir, { recursive: true });
    const profile = makeProfile({ output_path: outDir });
    expect(checkProfileGitSafety(profile)).toBeNull();
  });

  it("returns warning string when output_path is inside a git repo and allow_git_commit is absent", () => {
    mkdirSync(path.join(tmpRoot, ".git"), { recursive: true });
    const outDir = path.join(tmpRoot, "docs", "plans");
    mkdirSync(outDir, { recursive: true });
    const profile = makeProfile({ output_path: outDir });
    const result = checkProfileGitSafety(profile);
    expect(result).toContain("allow_git_commit");
    expect(result).toContain(tmpRoot);
  });

  it("returns null when allow_git_commit is true even inside a git repo", () => {
    mkdirSync(path.join(tmpRoot, ".git"), { recursive: true });
    const outDir = path.join(tmpRoot, "docs", "plans");
    mkdirSync(outDir, { recursive: true });
    const profile = makeProfile({ output_path: outDir, allow_git_commit: true });
    expect(checkProfileGitSafety(profile)).toBeNull();
  });
});
