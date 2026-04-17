/**
 * Behavioral tests for `neotoma mirror` CLI helpers.
 *
 * These tests exercise the pure functional surface of the CLI command
 * module (option parsing, result shapes, formatter output). They do not
 * exec the bundled CLI because the mirror command lands before a release
 * and the underlying service functions are covered by
 * `src/services/canonical_mirror.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  formatMirrorConfig,
  formatMirrorStatus,
  formatRebuildReport,
  runMirrorDisable,
  runMirrorEnable,
  runMirrorStatus,
} from "../../src/cli/commands/mirror.ts";

describe("neotoma mirror CLI helpers", () => {
  let tmpRoot: string;
  let tmpHome: string;
  let originalEnabled: string | undefined;
  let originalPath: string | undefined;
  let originalKinds: string | undefined;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-cli-mirror-"));
    tmpHome = mkdtempSync(path.join(tmpdir(), "neotoma-cli-mirror-home-"));
    originalEnabled = process.env.NEOTOMA_MIRROR_ENABLED;
    originalPath = process.env.NEOTOMA_MIRROR_PATH;
    originalKinds = process.env.NEOTOMA_MIRROR_KINDS;
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    // Redirect HOME so setMirrorConfig cannot mutate the real user config.
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
    // The CLI enable/disable helpers call setMirrorConfig which writes to
    // ~/.config/neotoma/config.json. We use env vars so the effective cfg
    // is predictable and isolated from user config.
    process.env.NEOTOMA_MIRROR_ENABLED = "true";
    process.env.NEOTOMA_MIRROR_PATH = tmpRoot;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.NEOTOMA_MIRROR_ENABLED;
    else process.env.NEOTOMA_MIRROR_ENABLED = originalEnabled;
    if (originalPath === undefined) delete process.env.NEOTOMA_MIRROR_PATH;
    else process.env.NEOTOMA_MIRROR_PATH = originalPath;
    if (originalKinds === undefined) delete process.env.NEOTOMA_MIRROR_KINDS;
    else process.env.NEOTOMA_MIRROR_KINDS = originalKinds;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      rmSync(tmpHome, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("runMirrorStatus returns shape with counts and absolute path", async () => {
    const status = await runMirrorStatus();
    expect(status.path).toBe(tmpRoot);
    expect(status.absolute_path).toBe(path.resolve(tmpRoot));
    expect(status.kinds.length).toBeGreaterThan(0);
    expect(Object.keys(status.counts)).toEqual(
      expect.arrayContaining(["entities", "relationships", "sources", "timeline", "schemas"])
    );
  });

  it("runMirrorEnable parses --kinds and toggles git without throwing", async () => {
    const cfg = await runMirrorEnable({
      path: tmpRoot,
      kinds: "entities,schemas",
      noGit: true,
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.kinds).toEqual(["entities", "schemas"]);
    expect(cfg.git_enabled).toBe(false);
    expect(cfg.absolute_path).toBe(path.resolve(tmpRoot));
  });

  it("runMirrorEnable rejects invalid --kinds values", async () => {
    await expect(
      runMirrorEnable({ path: tmpRoot, kinds: "entities,bogus" })
    ).rejects.toThrow(/bogus/);
  });

  it("runMirrorDisable returns disabled config", async () => {
    const cfg = await runMirrorDisable();
    expect(cfg.enabled).toBe(false);
  });

  it("formatMirrorStatus produces a human-readable block with counts", () => {
    const formatted = formatMirrorStatus({
      enabled: true,
      path: tmpRoot,
      absolute_path: path.resolve(tmpRoot),
      kinds: ["entities", "schemas"],
      git_enabled: false,
      counts: {
        entities: 3,
        relationships: 0,
        sources: 1,
        timeline: 0,
        schemas: 2,
      },
    });
    expect(formatted).toContain("Mirror:     enabled");
    expect(formatted).toContain("Kinds:      entities, schemas");
    expect(formatted).toContain("entities");
    expect(formatted).toContain("(disabled)");
  });

  it("formatMirrorConfig includes the absolute path and git status", () => {
    const formatted = formatMirrorConfig({
      enabled: false,
      path: tmpRoot,
      absolute_path: path.resolve(tmpRoot),
      kinds: ["entities"],
      git_enabled: true,
    });
    expect(formatted).toContain("Mirror:   disabled");
    expect(formatted).toContain(path.resolve(tmpRoot));
    expect(formatted).toContain("Git:      enabled");
  });

  it("formatRebuildReport reports per-kind counts", () => {
    const out = formatRebuildReport({
      config: {
        enabled: true,
        path: tmpRoot,
        kinds: ["entities"],
        git_enabled: false,
      },
      report: {
        kinds: ["entities"],
        counts: {
          entities: { written: 5, unchanged: 1, removed: 2 },
          relationships: { written: 0, unchanged: 0, removed: 0 },
          sources: { written: 0, unchanged: 0, removed: 0 },
          timeline: { written: 0, unchanged: 0, removed: 0 },
          schemas: { written: 0, unchanged: 0, removed: 0 },
        },
      },
    });
    expect(out).toContain("entities");
    expect(out).toMatch(/5\s+1\s+2/);
  });
});
