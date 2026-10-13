import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = process.env.WORKTREE_MODE_SCRIPT || join(ROOT, "scripts", "copy-env-to-worktree.js");
const roots: string[] = [];
const SENTINEL = "synthetic-live-sentinel-only";

function fixture({ committedTemplate = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "worktree-env-modes-"));
  roots.push(root);
  const main = join(root, "main");
  const worktree = join(root, "worktree");
  const home = join(root, "home");
  mkdirSync(main);
  mkdirSync(home);
  const git = (args: string[], cwd = main) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });
  git(["init", "-q", "-b", "main"]);
  const packageScript = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts[
    "copy:env"
  ];
  writeFileSync(
    join(main, "package.json"),
    JSON.stringify({ name: "neotoma", type: "module", scripts: { "copy:env": packageScript } })
  );
  mkdirSync(join(main, "scripts", "lib"), { recursive: true });
  copyFileSync(
    join(ROOT, "scripts", "copy-env-to-worktree.js"),
    join(main, "scripts", "copy-env-to-worktree.js")
  );
  copyFileSync(
    join(ROOT, "scripts", "lib", "worktree_dev_env.js"),
    join(main, "scripts", "lib", "worktree_dev_env.js")
  );
  if (committedTemplate) {
    writeFileSync(join(main, ".env.example"), "API_TOKEN=illustrative-only\nPORT=3000\n");
  }
  git(["add", "-A"]);
  git([
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-q",
    "-m",
    "fixture",
  ]);
  git(["worktree", "add", "-q", "-b", "feature", worktree]);
  writeFileSync(join(main, ".env.dev"), `API_TOKEN=${SENTINEL}\n`);
  const destination = join(worktree, ".env.development");
  const run = (args: string[] = []) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: worktree,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home },
    });
  const runNpm = (args: string[]) =>
    spawnSync("npm", ["run", "copy:env", "--", ...args], {
      cwd: worktree,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home },
    });
  return { main, worktree, destination, run, runNpm };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("worktree env mode effects", () => {
  it("defaults to none despite a live source in the main checkout", () => {
    const fx = fixture();
    const result = fx.run();
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(fx.destination)).toBe(false);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  it("keeps the automatic entrypoints on the same no-write helper", () => {
    const cursor = JSON.parse(readFileSync(join(ROOT, ".cursor", "worktrees.json"), "utf8"));
    for (const commands of Object.values(cursor)) {
      if (!Array.isArray(commands)) continue;
      expect(commands).toEqual(["node scripts/copy-env-to-worktree.js"]);
    }
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["copy:env"]).toBe("node scripts/copy-env-to-worktree.js");
  });

  it("writes only blank keys from the tracked template when explicitly requested", () => {
    const fx = fixture();
    const result = fx.run(["--template"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fx.destination, "utf8")).toContain("API_TOKEN=\nPORT=\n");
    expect(readFileSync(fx.destination, "utf8")).not.toContain("illustrative-only");
    expect(readFileSync(fx.destination, "utf8")).not.toContain(SENTINEL);
  });

  it("never falls back to live source when the committed template is missing", () => {
    const fx = fixture({ committedTemplate: false });
    const result = fx.run(["--mode=template"]);
    expect(result.status).not.toBe(0);
    expect(existsSync(fx.destination)).toBe(false);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  it("uses only committed template keys when the tracked working file is dirty", () => {
    const fx = fixture();
    writeFileSync(
      join(fx.worktree, ".env.example"),
      "API_TOKEN=changed\nDIRTY_MARKER_KEY=synthetic-only\n"
    );
    const result = fx.run(["--template"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fx.destination, "utf8")).toContain("API_TOKEN=\nPORT=\n");
    expect(readFileSync(fx.destination, "utf8")).not.toContain("DIRTY_MARKER_KEY");
    expect(`${result.stdout}${result.stderr}`).not.toContain("DIRTY_MARKER_KEY");
  });

  it("uses the committed template when the working file is absent", () => {
    const fx = fixture();
    unlinkSync(join(fx.worktree, ".env.example"));
    const result = fx.run(["--template"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fx.destination, "utf8")).toContain("API_TOKEN=\nPORT=\n");
  });

  it("copies a synthetic live source only on explicit --live and writes mode 0600", () => {
    const fx = fixture();
    const result = fx.run(["--live"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fx.destination, "utf8")).toContain(SENTINEL);
    expect(statSync(fx.destination).mode & 0o777).toBe(0o600);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  it("forwards the documented npm --live flag to a fresh destination", () => {
    const fx = fixture();
    const result = fx.runNpm(["--live"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fx.destination, "utf8")).toContain(SENTINEL);
    expect(statSync(fx.destination).mode & 0o777).toBe(0o600);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  it("refuses explicit live with no eligible source and no destination", () => {
    const fx = fixture();
    unlinkSync(join(fx.main, ".env.dev"));
    const result = fx.runNpm(["--live"]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/no local env source.*explicit live/i);
    expect(`${result.stdout}${result.stderr}`).toContain("--template");
    expect(existsSync(fx.destination)).toBe(false);
  });

  it("preserves an existing destination without reading the live source", () => {
    const fx = fixture();
    writeFileSync(fx.destination, "PORT=4000\n");
    unlinkSync(join(fx.main, ".env.dev"));
    const result = fx.run(["--live"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fx.destination, "utf8")).toBe("PORT=4000\n");
  });

  it("rejects ambiguous or unknown mode flags", () => {
    const fx = fixture();
    for (const args of [["--live", "--template"], ["--mode=unknown"], ["--force"]]) {
      expect(fx.run(args).status).not.toBe(0);
      expect(existsSync(fx.destination)).toBe(false);
    }
  });
});
