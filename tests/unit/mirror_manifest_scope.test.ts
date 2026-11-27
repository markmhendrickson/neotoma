/**
 * Issue #2939, follow-up: the ownership manifest must never change what a
 * write or removal does. `--clean` removes only the mirror's own output files,
 * bookkeeping never creates folders or files the run does not otherwise touch,
 * files generated earlier in the same run are never removed, and a manifest
 * that cannot be read or saved never fails a write. Temporary directories only.
 */
import {
  existsSync,
  promises as fsp,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MIRROR_MANIFEST_FILENAME,
  MirrorManifestSession,
  sha256,
} from "../../src/services/mirror_manifest.ts";
import {
  rebuildMirror,
  mirrorSource,
  removeMirrorSource,
} from "../../src/services/canonical_mirror.ts";

const MANIFEST = MIRROR_MANIFEST_FILENAME;

const dirs: string[] = [];
function tmp(prefix = "mirror-scope-"): string {
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
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    delete savedEnv[k];
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function writeManifest(root: string, files: Record<string, string>, dirList: string[] = []) {
  writeFileSync(
    path.join(root, MANIFEST),
    JSON.stringify({ version: 1, files, dirs: dirList }, null, 2)
  );
}

describe("clean removes only the mirror's own output files", () => {
  it("rejects a manifest with entries that are not Markdown output, and removes nothing", async () => {
    const root = tmp();
    const entries: Record<string, string> = {
      "data.json": "{}\n",
      ".neotoma-mirror-base": "base\n",
      ".hidden/a.md": "hidden\n",
      "sub/.cache/b.md": "cached\n",
      "stale.md": "stale\n",
    };
    const recorded: Record<string, string> = {};
    for (const [rel, content] of Object.entries(entries)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), content);
      recorded[rel] = sha256(content);
    }
    mkdirSync(path.join(root, ".config"));
    writeManifest(root, recorded, [".config"]);

    const session = new MirrorManifestSession();
    const m = await session.addRoot(root);
    expect(m.loadState).toBe("invalid");
    const removed = await m.clean(root, new Set(), new Set(), session.report);
    expect(removed).toBe(0);
    for (const rel of Object.keys(entries))
      expect(existsSync(path.join(root, rel)), rel).toBe(true);
    expect(existsSync(path.join(root, ".config"))).toBe(true);
    expect(session.report.notices.join("\n")).toMatch(/rejected/);
  });

  it("rejects a manifest whose only extra entry is a dot-prefixed folder", async () => {
    const root = tmp();
    mkdirSync(path.join(root, ".config"));
    writeManifest(root, {}, [".config"]);
    const session = new MirrorManifestSession();
    const m = await session.addRoot(root);
    expect(m.loadState).toBe("invalid");
    await m.clean(root, new Set(), new Set(), session.report);
    expect(existsSync(path.join(root, ".config"))).toBe(true);
  });

  it("at removal time skips any recorded entry that is not Markdown output", async () => {
    const root = tmp();
    writeFileSync(path.join(root, "data.json"), "{}\n");
    mkdirSync(path.join(root, ".config"));
    const session = new MirrorManifestSession();
    const m = await session.addRoot(root);
    await m.write(path.join(root, "a.md"), "gen\n");
    await session.saveAll();
    // Next run: entries that should never be recorded, added in memory after load.
    const next = new MirrorManifestSession();
    const n = await next.addRoot(root);
    n.files.set("data.json", sha256("{}\n"));
    n.dirs.add(".config");
    await n.clean(root, new Set(), new Set(), next.report);
    expect(existsSync(path.join(root, "data.json"))).toBe(true);
    expect(existsSync(path.join(root, ".config"))).toBe(true);
    expect(existsSync(path.join(root, "a.md"))).toBe(false);
  });
});

describe("files generated earlier in the same run are never removed", () => {
  it("keeps a file written in this run when the same root is cleaned for another scope", async () => {
    const root = tmp();
    const a = path.join(root, "a.md");
    const b = path.join(root, "b.md");
    // Previous run wrote both.
    {
      const s = new MirrorManifestSession();
      const m = await s.addRoot(root);
      await m.write(a, "A\n");
      await m.write(b, "B\n");
      await s.saveAll();
    }
    const s = new MirrorManifestSession();
    const m = await s.addRoot(root);
    await m.write(a, "A\n"); // first scope
    await m.write(b, "B\n"); // second scope, same output root
    await m.clean(root, new Set([b]), new Set(), s.report); // second scope's clean
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(true);
  });

  it("keeps a file written in this run under a nested root when the outer root is cleaned", async () => {
    const outer = tmp();
    const inner = path.join(outer, "sub");
    const file = path.join(inner, "a.md");
    // Before the nested root existed, the outer root recorded the file.
    {
      const s = new MirrorManifestSession();
      const m = await s.addRoot(outer);
      await m.write(file, "A\n");
      await s.saveAll();
    }
    const s = new MirrorManifestSession();
    const o = await s.addRoot(outer);
    await s.addRoot(inner);
    await s.rootFor(file)!.write(file, "A\n");
    await o.clean(outer, new Set(), new Set(), s.report);
    expect(existsSync(file)).toBe(true);
  });
});

describe("bookkeeping never fails a write", () => {
  it("a session never creates or saves a root it did not write to", async () => {
    const parent = tmp();
    const untouched = path.join(parent, "untouched");
    const s = new MirrorManifestSession();
    await s.addRoot(untouched);
    await s.saveAll();
    expect(existsSync(untouched)).toBe(false);
  });

  it("a manifest save failure is reported, not thrown", async () => {
    const parent = tmp();
    writeFileSync(path.join(parent, "blocker"), "a file, not a folder\n");
    const root = path.join(parent, "blocker", "root");
    const s = new MirrorManifestSession();
    const m = await s.addRoot(root);
    m.files.set("a.md", sha256("x"));
    m.dirty = true;
    m.touched = true;
    await expect(s.saveAll()).resolves.toBeUndefined();
    expect(s.report.notices.join("\n")).toMatch(/could not be saved/);
  });

  it("an unreadable manifest means --clean removes nothing and says so", async () => {
    const root = tmp();
    writeFileSync(path.join(root, "a.md"), "A\n");
    writeManifest(root, { "a.md": sha256("A\n") });
    const realRead = fsp.readFile;
    vi.spyOn(fsp, "readFile").mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (String(p).endsWith(MANIFEST)) {
        return Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" }));
      }
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fsp.readFile);
    const s = new MirrorManifestSession();
    const m = await s.addRoot(root);
    const removed = await m.clean(root, new Set(), new Set(), s.report);
    expect(removed).toBe(0);
    expect(existsSync(path.join(root, "a.md"))).toBe(true);
    expect(s.report.notices.join("\n")).toMatch(/could not be read/);
  });
});

// ---------------------------------------------------------------------------
// rebuildMirror and incremental writes through the configured mirror
// ---------------------------------------------------------------------------

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

function configure(mirrorPath: string, profiles: unknown[], kinds?: string[]) {
  const home = tmp("mirror-scope-home-");
  setEnv("HOME", home);
  setEnv("USERPROFILE", home);
  setEnv("NEOTOMA_MIRROR_PATH", mirrorPath);
  const configDir = path.join(home, ".config", "neotoma");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({ mirror: { profiles, ...(kinds ? { kinds } : {}) } })
  );
}

function row(id: string, type: string, title: string): Row {
  return { entity_id: id, entity_type: type, snapshot: { title, body: `Body of ${title}.` } };
}

describe("rebuildMirror writes nothing outside the run", () => {
  beforeEach(() => {
    store = [];
  });

  it("--profile A leaves profile B's folder absent", async () => {
    const base = tmp();
    const a = path.join(base, "a");
    const b = path.join(base, "b");
    configure(path.join(base, "mirror"), [profile("pa", "plan", a), profile("pb", "task", b)]);
    store = [row("ent_1", "plan", "alpha")];
    await rebuildMirror({ profileId: "pa", apiClient, kind: "entities", clean: true });
    expect(existsSync(path.join(a, "alpha.md"))).toBe(true);
    expect(existsSync(b)).toBe(false);
  });

  it("a kind-limited rebuild leaves profile folders absent", async () => {
    const base = tmp();
    const a = path.join(base, "a");
    configure(path.join(base, "mirror"), [profile("pa", "plan", a)], ["entities"]);
    await rebuildMirror({ apiClient, kind: "schemas" });
    expect(existsSync(a)).toBe(false);
  });

  it("an unwritable unrelated root does not fail the rebuild", async () => {
    const base = tmp();
    writeFileSync(path.join(base, "blocker"), "a file, not a folder\n");
    const a = path.join(base, "a");
    configure(path.join(base, "mirror"), [
      profile("pa", "plan", a),
      profile("pb", "task", path.join(base, "blocker", "b")),
    ]);
    store = [row("ent_1", "plan", "alpha")];
    await expect(
      rebuildMirror({ profileId: "pa", apiClient, kind: "entities" })
    ).resolves.toBeDefined();
    expect(existsSync(path.join(a, "alpha.md"))).toBe(true);
  });

  it("keeps files from an earlier profile when a later profile shares the mirror path", async () => {
    const base = tmp();
    const mirror = path.join(base, "mirror");
    configure(mirror, [profile("pa", "plan", mirror), profile("pb", "task", mirror)], ["entities"]);
    store = [row("ent_1", "plan", "alpha"), row("ent_2", "task", "beta")];
    await rebuildMirror({ apiClient, kind: "entities" });
    await rebuildMirror({ apiClient, kind: "entities", clean: true });
    expect(existsSync(path.join(mirror, "alpha.md"))).toBe(true);
    expect(existsSync(path.join(mirror, "beta.md"))).toBe(true);
  });

  it("a manifest save failure in the final save does not replace the rebuild's own error", async () => {
    const base = tmp();
    const a = path.join(base, "a");
    store = [row("ent_1", "plan", "alpha")];
    const realWrite = fsp.writeFile;
    vi.spyOn(fsp, "writeFile").mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (String(p).includes(MANIFEST)) {
        return Promise.reject(Object.assign(new Error("save failed"), { code: "EACCES" }));
      }
      return (realWrite as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fsp.writeFile);
    const failing = {
      POST: async (_p: string, args: { body: { entity_type?: string } }) => {
        if (args.body.entity_type === "task") {
          return { error: { status: 401, message: "unauthorized" } };
        }
        return apiClient!.POST("/entities/query" as never, args as never);
      },
    } as unknown as typeof apiClient;
    configure(
      path.join(base, "mirror"),
      [profile("pa", "plan", a), profile("pb", "task", path.join(base, "b"))],
      ["entities"]
    );
    await expect(rebuildMirror({ apiClient: failing, kind: "entities" })).rejects.toThrow(
      /AUTH_REQUIRED/
    );
    expect(existsSync(path.join(a, "alpha.md"))).toBe(true);
  });
});

describe("incremental writes keep the manifest without failing", () => {
  const src = {
    id: "src_1",
    content_hash: "h1",
    mime_type: "text/plain",
    source_type: "file",
  };

  function configureSources(mirror: string) {
    configure(mirror, [], ["sources"]);
    setEnv("NEOTOMA_MIRROR_ENABLED", "true");
  }

  function sourceRel(mirror: string): string | undefined {
    const m = JSON.parse(readFileSync(path.join(mirror, MANIFEST), "utf8"));
    return Object.keys(m.files).find((k) => k.startsWith("sources/") && k !== "sources/index.md");
  }

  it("records an entry on write and drops it on removal", async () => {
    const mirror = tmp();
    configureSources(mirror);
    await mirrorSource(src);
    const rel = sourceRel(mirror);
    expect(rel).toBeDefined();
    await removeMirrorSource(src.id);
    expect(existsSync(path.join(mirror, rel!))).toBe(false);
    expect(sourceRel(mirror)).toBeUndefined();
  });

  it("an unreadable manifest does not fail an incremental write or removal", async () => {
    const mirror = tmp();
    configureSources(mirror);
    writeFileSync(path.join(mirror, MANIFEST), "{}");
    const realRead = fsp.readFile;
    vi.spyOn(fsp, "readFile").mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (String(p).endsWith(MANIFEST)) {
        return Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" }));
      }
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fsp.readFile);
    await expect(mirrorSource(src)).resolves.toBeUndefined();
    await expect(removeMirrorSource(src.id)).resolves.toBeUndefined();
  });

  it("a manifest that cannot be saved does not fail an incremental write or removal", async () => {
    const mirror = tmp();
    configureSources(mirror);
    const realWrite = fsp.writeFile;
    vi.spyOn(fsp, "writeFile").mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (String(p).includes(MANIFEST)) {
        return Promise.reject(Object.assign(new Error("save failed"), { code: "EACCES" }));
      }
      return (realWrite as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fsp.writeFile);
    await expect(mirrorSource(src)).resolves.toBeUndefined();
    await expect(removeMirrorSource(src.id)).resolves.toBeUndefined();
  });
});
