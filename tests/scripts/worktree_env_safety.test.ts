import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DENY = join(SOURCE_ROOT, "scripts", "deny-staged-env-files.js");
const DISCOVER = join(SOURCE_ROOT, "scripts", "list-worktree-env-copies.js");
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "worktree-env-safety-"));
  roots.push(root);
  const repo = join(root, "repo");
  mkdirSync(repo);
  const git = (args: string[], cwd = repo) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });
  git(["init", "-q", "-b", "main"]);
  writeFileSync(join(repo, ".gitignore"), ".env*\n");
  writeFileSync(join(repo, "safe.txt"), "safe\n");
  git(["add", ".gitignore", "safe.txt"]);
  return { root, repo, git };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("worktree env safety", () => {
  it.each([".env", ".env.dev", ".env.development", "nested/.env.dev"])(
    "rejects staged %s even when ignore was bypassed",
    (name) => {
      const { repo, git } = fixture();
      mkdirSync(dirname(join(repo, name)), { recursive: true });
      writeFileSync(join(repo, name), "SYNTHETIC_TEST_SECRET=sentinel-only\n");
      git(["add", "-f", name]);
      const result = spawnSync(process.execPath, [DENY], { cwd: repo, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("staged env filename denied");
      expect(result.stderr).not.toContain("sentinel-only");
    }
  );

  it("accepts unrelated staged files", () => {
    const { repo } = fixture();
    const result = spawnSync(process.execPath, [DENY], { cwd: repo, encoding: "utf8" });
    expect(result.status).toBe(0);
  });

  it("lists existing worktree env paths without reading or printing values", () => {
    const { root, repo, git } = fixture();
    const wt = join(root, "other");
    git([
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-q",
      "-m",
      "init",
    ]);
    git(["worktree", "add", "-q", "-b", "other", wt]);
    const target = join(wt, ".env.development");
    writeFileSync(target, "SYNTHETIC_TEST_SECRET=sentinel-only\n");
    const result = spawnSync(process.execPath, [DISCOVER], { cwd: repo, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(target);
    expect(result.stdout).not.toContain("sentinel-only");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toContain("sentinel-only");
  });
});
