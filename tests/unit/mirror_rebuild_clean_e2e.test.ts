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

describe("rebuildMirror --clean end to end (#2939)", () => {
  it("removes only stale generated files and leaves every other file byte for byte", async () => {
    const root = path.join(tmp("mirror-e2e-"), "plans");
    const outside = tmp("mirror-e2e-outside-");
    mkdirSync(path.join(root, "notes"), { recursive: true });
    configure(root);

    // Files the mirror did not create, including ones in the folders it writes.
    const foreign: Record<string, Buffer> = {
      [path.join(root, "my-notes.md")]: Buffer.from("# My notes\n\nkept\n"),
      [path.join(root, "notes", "draft.md")]: Buffer.from("draft\r\nwith CRLF\r\n"),
      // Paths the mirror would write: an entity file and the index.
      [path.join(root, "beta.md")]: Buffer.from("hand written beta\n"),
      [path.join(root, "index.md")]: Buffer.from("hand written index\n"),
    };
    for (const [p, b] of Object.entries(foreign)) writeFileSync(p, b);
    // A symlink inside the mirror root that points outside it.
    writeFileSync(path.join(outside, "external.md"), "outside the mirror\n");
    symlinkSync(outside, path.join(root, "linked"));

    store = [plan("ent_a", "alpha"), plan("ent_b", "beta"), plan("ent_c", "gamma")];
    await rebuild(false);
    expect(readFileSync(path.join(root, "alpha.md"), "utf8")).toContain("Body of alpha.");
    expect(readFileSync(path.join(root, "gamma.md"), "utf8")).toContain("Body of gamma.");

    // gamma leaves the store. Without clean, its generated file stays.
    store = [plan("ent_a", "alpha"), plan("ent_b", "beta")];
    await rebuild(false);
    expect(existsSync(path.join(root, "gamma.md"))).toBe(true);

    // With clean, the stale generated file goes; everything else stays.
    const report = await rebuild(true);
    expect(report.profiles["e2e-plans"].removed).toBe(1);
    expect(existsSync(path.join(root, "gamma.md"))).toBe(false);
    expect(readFileSync(path.join(root, "alpha.md"), "utf8")).toContain("Body of alpha.");
    for (const [p, b] of Object.entries(foreign)) {
      expect(readFileSync(p).equals(b), p).toBe(true);
    }
    expect(readFileSync(path.join(outside, "external.md"), "utf8")).toBe("outside the mirror\n");

    // The report says skipped files are left as they are.
    expect(report.safety.skipped_foreign).toBeGreaterThan(0);
    const skippedLine = "Skipped files stay as they are, possibly out of date";
    const config = { enabled: true, path: root, kinds: ["entities" as const], git_enabled: false };
    expect(formatRebuildReport({ config, report })).toContain(skippedLine);
    const none = {
      ...report,
      safety: { ...report.safety, skipped_foreign: 0, skipped_foreign_paths: [] },
    };
    expect(formatRebuildReport({ config, report: none })).not.toContain(skippedLine);
  });

  it("does not follow a symlinked output root on --clean", async () => {
    const outside = tmp("mirror-e2e-target-");
    const userFile = path.join(outside, "unrelated.md");
    writeFileSync(userFile, "not a mirror file\n");
    const link = path.join(tmp("mirror-e2e-"), "plans");
    symlinkSync(outside, link);
    configure(link);

    store = [plan("ent_a", "alpha")];
    await rebuild(false);
    const report = await rebuild(true);

    expect(readFileSync(userFile, "utf8")).toBe("not a mirror file\n");
    expect(report.safety.refused_paths).toContain(link);
  });
});
