/**
 * Issue #2939: `neotoma mirror rebuild --clean` deletes only files the mirror
 * generated. Exercises the ownership manifest that rebuildMirror records every
 * write in and routes every --clean through, against temporary directories only.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MIRROR_MANIFEST_FILENAME,
  MirrorManifestSession,
  sha256,
} from "../../src/services/mirror_manifest.ts";

const dirs: string[] = [];
function tmp(prefix = "mirror-manifest-"): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** One rebuild pass: write `files` (abs path -> content), optionally clean, save. */
async function rebuild(root: string, files: Record<string, string>, clean: boolean) {
  const session = new MirrorManifestSession();
  const m = await session.addRoot(root);
  for (const [p, c] of Object.entries(files)) await m.write(p, c);
  let removed = 0;
  if (clean)
    removed = await m.clean(
      root,
      new Set(Object.keys(files)),
      new Set(["index.md"]),
      session.report
    );
  await session.saveAll();
  return { report: session.report, removed };
}

describe("mirror owned-paths manifest (#2939)", () => {
  it("keeps a foreign file in a subfolder, and the folder, on --clean", async () => {
    const root = tmp();
    await rebuild(root, { [path.join(root, "a.md")]: "gen" }, false);
    mkdirSync(path.join(root, "notes"));
    writeFileSync(path.join(root, "notes", "mine.md"), "user");
    const { removed } = await rebuild(root, { [path.join(root, "a.md")]: "gen" }, true);
    expect(removed).toBe(0);
    expect(readFileSync(path.join(root, "notes", "mine.md"), "utf8")).toBe("user");
  });

  it("overwrites a same-name file exactly as before and records it", async () => {
    const root = tmp();
    writeFileSync(path.join(root, "a.md"), "user");
    await rebuild(root, { [path.join(root, "a.md")]: "gen" }, false);
    expect(readFileSync(path.join(root, "a.md"), "utf8")).toBe("gen");
    const manifest = JSON.parse(readFileSync(path.join(root, MIRROR_MANIFEST_FILENAME), "utf8"));
    expect(manifest.files).toEqual({ "a.md": sha256("gen") });
  });

  it("lists Markdown files the manifest does not record, without following links", async () => {
    const root = tmp();
    const outside = tmp("mirror-outside-");
    writeFileSync(path.join(outside, "far.md"), "x");
    symlinkSync(outside, path.join(root, "linked"));
    mkdirSync(path.join(root, "notes"));
    writeFileSync(path.join(root, "notes", "mine.md"), "user");
    const { report } = await rebuild(root, { [path.join(root, "a.md")]: "gen" }, true);
    expect(report.unrecorded_paths).toEqual([path.join(root, "notes", "mine.md")]);
  });

  it("leaves no temporary manifest files behind", async () => {
    const root = tmp();
    await rebuild(root, { [path.join(root, "a.md")]: "gen" }, false);
    await rebuild(root, { [path.join(root, "b.md")]: "gen" }, false);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(root).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses --clean through a symlinked root and does not delete its target", async () => {
    const real = tmp("mirror-real-");
    const base = tmp();
    const link = path.join(base, "link");
    symlinkSync(real, link);
    // Prior run through the link recorded x.md as owned.
    await rebuild(link, { [path.join(link, "x.md")]: "gen" }, false);
    const { report, removed } = await rebuild(link, {}, true);
    expect(removed).toBe(0);
    expect(report.refused).toBeGreaterThan(0);
    expect(existsSync(path.join(real, "x.md"))).toBe(true);
  });

  it("does not delete through a symlinked subfolder", async () => {
    const root = tmp();
    const outside = tmp("mirror-outside-");
    await rebuild(root, { [path.join(root, "sub", "x.md")]: "gen" }, false);
    rmSync(path.join(root, "sub"), { recursive: true });
    writeFileSync(path.join(outside, "x.md"), "gen");
    symlinkSync(outside, path.join(root, "sub"));
    const { report } = await rebuild(root, {}, true);
    expect(existsSync(path.join(outside, "x.md"))).toBe(true);
    expect(report.refused).toBe(1);
  });

  it("removes a previously generated file no longer produced, and the folder it created", async () => {
    const root = tmp();
    await rebuild(root, { [path.join(root, "t", "old.md")]: "gen" }, false);
    const { removed } = await rebuild(root, {}, true);
    expect(removed).toBe(1);
    expect(existsSync(path.join(root, "t", "old.md"))).toBe(false);
    expect(existsSync(path.join(root, "t"))).toBe(false);
  });

  it("keeps a generated file the user edited and reports it", async () => {
    const root = tmp();
    await rebuild(root, { [path.join(root, "old.md")]: "gen" }, false);
    writeFileSync(path.join(root, "old.md"), "edited");
    const { report, removed } = await rebuild(root, {}, true);
    expect(removed).toBe(0);
    expect(report.kept_edited).toBe(1);
    expect(readFileSync(path.join(root, "old.md"), "utf8")).toBe("edited");
  });

  it("with no manifest removes nothing, then writes a manifest so the next --clean works", async () => {
    const root = tmp();
    writeFileSync(path.join(root, "legacy.md"), "old mirror output");
    const first = await rebuild(root, { [path.join(root, "a.md")]: "gen" }, true);
    expect(first.removed).toBe(0);
    expect(existsSync(path.join(root, "legacy.md"))).toBe(true);
    expect(first.report.notices.join("\n")).toMatch(/no ownership manifest was found/);
    const manifest = JSON.parse(readFileSync(path.join(root, MIRROR_MANIFEST_FILENAME), "utf8"));
    expect(manifest.files).toEqual({ "a.md": sha256("gen") });
    const second = await rebuild(root, {}, true);
    expect(second.removed).toBe(1);
    expect(existsSync(path.join(root, "a.md"))).toBe(false);
    expect(existsSync(path.join(root, "legacy.md"))).toBe(true);
  });

  it.each([["../escape.md"], ["/abs/escape.md"], ["sub/../../escape.md"]])(
    "rejects a tampered manifest entry %s and removes nothing",
    async (entry) => {
      const parent = tmp();
      const root = path.join(parent, "root");
      mkdirSync(root);
      writeFileSync(path.join(parent, "escape.md"), "outside content");
      writeFileSync(path.join(root, "owned.md"), "gen");
      writeFileSync(
        path.join(root, MIRROR_MANIFEST_FILENAME),
        JSON.stringify({
          version: 1,
          files: { [entry]: sha256("outside content"), "owned.md": sha256("gen") },
        })
      );
      const { report, removed } = await rebuild(root, {}, true);
      expect(removed).toBe(0);
      expect(report.refused).toBe(1);
      expect(existsSync(path.join(parent, "escape.md"))).toBe(true);
      expect(existsSync(path.join(root, "owned.md"))).toBe(true);
    }
  );
});
