/**
 * Issue #2939: end-to-end `rebuildMirror` runs, with and without `clean`,
 * against a populated store. The store is an in-memory entity list served
 * through the rebuild's API-client path, so every pass reads the same rows a
 * server would return. All output goes to temporary directories.
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatRebuildReport } from "../../src/cli/commands/mirror.ts";
import { rebuildMirror } from "../../src/services/canonical_mirror.ts";

type Row = { entity_id: string; entity_type: string; snapshot: Record<string, unknown> };

const dirs: string[] = [];
function tmp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

let store: Row[] = [];
const apiClient = {
  POST: async () => ({ data: { entities: store, total: store.length } }),
} as unknown as NonNullable<Parameters<typeof rebuildMirror>[0]>["apiClient"];

function plan(id: string, title: string): Row {
  return { entity_id: id, entity_type: "plan", snapshot: { title, body: `Body of ${title}.` } };
}

const savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  process.env[key] = value;
}

/** Point the mirror config (user config under a temporary HOME) at `outputPath`. */
function configure(outputPath: string) {
  const home = tmp("mirror-e2e-home-");
  setEnv("HOME", home);
  setEnv("USERPROFILE", home);
  setEnv("NEOTOMA_MIRROR_PATH", tmp("mirror-e2e-main-"));
  const configDir = path.join(home, ".config", "neotoma");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({
      mirror: {
        profiles: [
          {
            id: "e2e-plans",
            entity_type: "plan",
            filter: {},
            output_path: outputPath,
            filename_template: "{title}.md",
            index_enabled: true,
            render_mode: "frontmatter_content",
            content_field: "body",
          },
        ],
      },
    })
  );
}

function rebuild(clean: boolean) {
  return rebuildMirror({ profileId: "e2e-plans", apiClient, kind: "entities", clean });
}

beforeEach(() => {
  store = [];
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    delete savedEnv[k];
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const MANIFEST = ".neotoma-mirror-manifest.json";

function setup() {
  const root = path.join(tmp("mirror-e2e-"), "plans");
  mkdirSync(root, { recursive: true });
  configure(root);
  return root;
}

describe("rebuildMirror --clean end to end (#2939)", () => {
  it("leaves files the mirror did not create byte for byte, in subfolders and behind a link", async () => {
    const root = setup();
    const outside = tmp("mirror-e2e-outside-");
    mkdirSync(path.join(root, "notes", "deep"), { recursive: true });
    mkdirSync(path.join(root, "empty-user-folder"));
    const foreign: Record<string, Buffer> = {
      [path.join(root, "my-notes.md")]: Buffer.from("# My notes\n\nkept\n"),
      [path.join(root, "notes", "draft.md")]: Buffer.from("draft\r\nwith CRLF\r\n"),
      [path.join(root, "notes", "deep", "more.md")]: Buffer.from("deeper\n"),
    };
    for (const [p, b] of Object.entries(foreign)) writeFileSync(p, b);
    writeFileSync(path.join(outside, "external.md"), "outside the mirror\n");
    symlinkSync(outside, path.join(root, "linked"));

    store = [plan("ent_a", "alpha")];
    await rebuild(false);
    const report = await rebuild(true);

    for (const [p, b] of Object.entries(foreign)) {
      expect(readFileSync(p).equals(b), p).toBe(true);
    }
    expect(readFileSync(path.join(outside, "external.md"), "utf8")).toBe("outside the mirror\n");
    expect(existsSync(path.join(root, "empty-user-folder"))).toBe(true);
    expect(report.profiles["e2e-plans"].removed).toBe(0);

    // The report lists what it left in place and says to delete outdated ones by hand.
    const config = { enabled: true, path: root, kinds: ["entities" as const], git_enabled: false };
    const text = formatRebuildReport({ config, report });
    expect(text).toContain(path.join(root, "notes", "draft.md"));
    expect(text).not.toContain("external.md");
    expect(text).toContain("Delete outdated ones by hand before running `mirror push`.");
  });

  it("removes stale generated files and only the empty folders the mirror created", async () => {
    const root = setup();
    mkdirSync(path.join(root, "kept-empty"));
    store = [plan("ent_a", "alpha"), plan("ent_c", "gamma")];
    await rebuild(false);
    // A file in a folder the mirror created, written by the mirror's own pass.
    expect(existsSync(path.join(root, "gamma.md"))).toBe(true);
    store = [plan("ent_a", "alpha")];
    await rebuild(false);
    expect(existsSync(path.join(root, "gamma.md"))).toBe(true);

    const report = await rebuild(true);
    expect(report.profiles["e2e-plans"].removed).toBe(1);
    expect(existsSync(path.join(root, "gamma.md"))).toBe(false);
    expect(readFileSync(path.join(root, "alpha.md"), "utf8")).toContain("Body of alpha.");
    expect(existsSync(path.join(root, "kept-empty"))).toBe(true);
    expect(existsSync(path.join(root, MANIFEST))).toBe(true);
  });

  it("removes a mirror-created subfolder once it is empty, and keeps a user folder", async () => {
    const parent = tmp("mirror-e2e-");
    const root = path.join(parent, "nested", "plans");
    configure(root);
    store = [plan("ent_a", "alpha")];
    await rebuild(false);
    store = [];
    await rebuild(true);
    expect(existsSync(path.join(root, "alpha.md"))).toBe(false);
    const manifest = JSON.parse(readFileSync(path.join(root, MANIFEST), "utf8"));
    expect(manifest.files["alpha.md"]).toBeUndefined();
    expect(existsSync(parent)).toBe(true);
  });

  it("keeps a generated file that was edited and reports it", async () => {
    const root = setup();
    store = [plan("ent_a", "alpha"), plan("ent_c", "gamma")];
    await rebuild(false);
    writeFileSync(path.join(root, "gamma.md"), "edited by hand\n");
    store = [plan("ent_a", "alpha")];
    const report = await rebuild(true);
    expect(readFileSync(path.join(root, "gamma.md"), "utf8")).toBe("edited by hand\n");
    expect(report.safety.kept_edited_paths).toContain(path.join(root, "gamma.md"));
  });

  it("with no manifest deletes nothing and says so, then writes one", async () => {
    const root = setup();
    // Output from before the manifest existed: looks generated, is not recorded.
    writeFileSync(path.join(root, "old-plan.md"), "---\ntitle: old\n---\nold\n");
    store = [plan("ent_a", "alpha")];
    const report = await rebuild(true);
    expect(existsSync(path.join(root, "old-plan.md"))).toBe(true);
    expect(report.safety.notices.join("\n")).toMatch(/no ownership manifest was found/);
    expect(existsSync(path.join(root, MANIFEST))).toBe(true);
    expect(report.safety.unrecorded_paths).toContain(path.join(root, "old-plan.md"));
  });

  it("with a tampered manifest deletes nothing", async () => {
    const root = setup();
    store = [plan("ent_a", "alpha"), plan("ent_c", "gamma")];
    await rebuild(false);
    const outsideFile = path.join(path.dirname(root), "outside.md");
    writeFileSync(outsideFile, "outside content\n");
    const mp = path.join(root, MANIFEST);
    const manifest = JSON.parse(readFileSync(mp, "utf8"));
    manifest.files["../outside.md"] = manifest.files["gamma.md"];
    writeFileSync(mp, JSON.stringify(manifest));
    store = [plan("ent_a", "alpha")];
    const report = await rebuild(true);
    expect(existsSync(outsideFile)).toBe(true);
    expect(existsSync(path.join(root, "gamma.md"))).toBe(true);
    expect(report.profiles["e2e-plans"].removed).toBe(0);
  });

  it("does not walk a symlinked output root on --clean and says why", async () => {
    const outside = tmp("mirror-e2e-target-");
    const userFile = path.join(outside, "unrelated.md");
    writeFileSync(userFile, "not a mirror file\n");
    const link = path.join(tmp("mirror-e2e-"), "plans");
    symlinkSync(outside, link);
    configure(link);

    store = [plan("ent_a", "alpha")];
    await rebuild(false);
    store = [];
    const report = await rebuild(true);

    expect(readFileSync(userFile, "utf8")).toBe("not a mirror file\n");
    expect(existsSync(path.join(outside, "alpha.md"))).toBe(true);
    expect(report.safety.refused_paths).toContain(link);
    expect(report.safety.notices.join("\n")).toMatch(/is a symlink/);
  });

  it("overwrites a same-name file exactly as before", async () => {
    const root = setup();
    writeFileSync(path.join(root, "alpha.md"), "hand written alpha\n");
    store = [plan("ent_a", "alpha")];
    await rebuild(false);
    expect(readFileSync(path.join(root, "alpha.md"), "utf8")).toContain("Body of alpha.");
  });
});
