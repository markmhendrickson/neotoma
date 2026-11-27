/**
 * Issue #2939, follow-up: one output folder reached by two spellings (a
 * symbolic link in a parent folder, or letter case on a case-insensitive
 * filesystem) is one root with one manifest. Temporary directories only.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MIRROR_MANIFEST_FILENAME,
  MirrorManifestSession,
} from "../../src/services/mirror_manifest.ts";
import { rebuildMirror } from "../../src/services/canonical_mirror.ts";

const MANIFEST = MIRROR_MANIFEST_FILENAME;

const dirs: string[] = [];
function tmp(prefix = "mirror-spell-"): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

const savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  process.env[key] = value;
}

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    delete savedEnv[k];
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Row = { entity_id: string; entity_type: string; snapshot: Record<string, unknown> };
let store: Row[] = [];
const apiClient = {
  POST: async (_p: string, args: { body: { entity_type?: string } }) => {
    const rows = store.filter((r) => r.entity_type === args.body.entity_type);
    return { data: { entities: rows, total: rows.length } };
  },
} as unknown as NonNullable<Parameters<typeof rebuildMirror>[0]>["apiClient"];

function profile(id: string, entityType: string, outputPath: string) {
  return {
    id,
    entity_type: entityType,
    filter: {},
    output_path: outputPath,
    filename_template: "{title}.md",
    index_enabled: false,
    render_mode: "frontmatter_content",
    content_field: "body",
  };
}

function configure(mirrorPath: string, profiles: unknown[]) {
  const home = tmp("mirror-spell-home-");
  setEnv("HOME", home);
  setEnv("USERPROFILE", home);
  setEnv("NEOTOMA_MIRROR_PATH", mirrorPath);
  const configDir = path.join(home, ".config", "neotoma");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({ mirror: { profiles, kinds: ["entities"] } })
  );
}

function row(id: string, type: string, title: string): Row {
  return { entity_id: id, entity_type: type, snapshot: { title, body: `Body of ${title}.` } };
}

/** A base folder plus a second spelling of it through a symlinked parent. */
function twoSpellings() {
  const realParent = tmp();
  const linkParent = path.join(tmp(), "via-link");
  symlinkSync(realParent, linkParent);
  return { direct: path.join(realParent, "out"), viaLink: path.join(linkParent, "out") };
}

function manifestFiles(dir: string): string[] {
  return Object.keys(JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8")).files).sort();
}

function isCaseInsensitive(): boolean {
  const d = tmp("mirror-spell-case-");
  writeFileSync(path.join(d, "probe"), "");
  return existsSync(path.join(d, "PROBE"));
}

describe("one folder spelled two ways is one root", () => {
  beforeEach(() => {
    store = [];
  });

  it("two profiles over one folder: repeated --clean removes nothing written in the run", async () => {
    const { direct, viaLink } = twoSpellings();
    const mirror = path.join(tmp(), "mirror");
    configure(mirror, [profile("pa", "plan", direct), profile("pb", "task", viaLink)]);
    store = [row("ent_1", "plan", "alpha"), row("ent_2", "task", "beta")];
    await rebuildMirror({ apiClient, kind: "entities" });
    let manifest = "";
    for (let i = 0; i < 3; i++) {
      await rebuildMirror({ apiClient, kind: "entities", clean: true });
      expect(existsSync(path.join(direct, "alpha.md")), `run ${i}`).toBe(true);
      expect(existsSync(path.join(direct, "beta.md")), `run ${i}`).toBe(true);
      const now = readFileSync(path.join(direct, MANIFEST), "utf8");
      if (i > 0) expect(now).toBe(manifest);
      manifest = now;
    }
    expect(manifestFiles(direct)).toEqual(["alpha.md", "beta.md"]);
    expect(readdirSync(direct).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("routes a nested root named under the other spelling to its own manifest", async () => {
    const { direct, viaLink } = twoSpellings();
    const inner = path.join(viaLink, "inner");
    const s = new MirrorManifestSession();
    const outer = await s.addRoot(direct);
    const nested = await s.addRoot(inner);
    const file = path.join(direct, "inner", "a.md");
    expect(s.rootFor(file)).toBe(nested);
    await s.rootFor(file)!.write(file, "A\n");
    await outer.clean(direct, new Set(), new Set(), s.report);
    await s.saveAll();
    expect(existsSync(file)).toBe(true);
    expect(manifestFiles(path.join(direct, "inner"))).toEqual(["a.md"]);
    expect(manifestFiles(direct)).toEqual([]);
  });

  it("records an incremental write through the other spelling in the same manifest", async () => {
    const { direct, viaLink } = twoSpellings();
    mkdirSync(direct, { recursive: true });
    const s = new MirrorManifestSession();
    const m = await s.addRoot(direct);
    const file = path.join(viaLink, "a.md");
    expect(s.rootFor(file)).toBe(m);
    await s.rootFor(file)!.write(file, "A\n");
    await s.saveAll();
    expect(manifestFiles(direct)).toEqual(["a.md"]);
  });

  it("still refuses --clean for a symlinked root, also beside a direct spelling", async () => {
    const target = tmp();
    const link = path.join(tmp(), "linked-root");
    symlinkSync(target, link);
    store = [row("ent_1", "plan", "alpha")];
    configure(path.join(tmp(), "mirror"), [
      profile("pa", "plan", target),
      profile("pb", "task", link),
    ]);
    await rebuildMirror({ apiClient, kind: "entities" });
    store = [];
    const report = await rebuildMirror({ apiClient, kind: "entities", clean: true });
    expect(existsSync(path.join(target, "alpha.md"))).toBe(true);
    expect(report.safety.refused_paths).toContain(link);
    expect(report.safety.notices.join("\n")).toMatch(/is a symlink/);
  });

  it.runIf(isCaseInsensitive())(
    "treats a letter-case spelling as the same folder (case-insensitive filesystems only)",
    async () => {
      const base = tmp();
      const direct = path.join(base, "out");
      const upper = path.join(base, "OUT");
      const mirror = path.join(tmp(), "mirror");
      configure(mirror, [profile("pa", "plan", direct), profile("pb", "task", upper)]);
      store = [row("ent_1", "plan", "alpha"), row("ent_2", "task", "beta")];
      await rebuildMirror({ apiClient, kind: "entities" });
      for (let i = 0; i < 2; i++) {
        await rebuildMirror({ apiClient, kind: "entities", clean: true });
        expect(existsSync(path.join(direct, "alpha.md"))).toBe(true);
        expect(existsSync(path.join(direct, "beta.md"))).toBe(true);
      }
      expect(manifestFiles(direct)).toEqual(["alpha.md", "beta.md"]);
    }
  );
});
