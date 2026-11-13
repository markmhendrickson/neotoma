/**
 * Tests that run git must act on the directory they name, never on the
 * repository the test run was started from.
 *
 * A git hook exports GIT_DIR / GIT_INDEX_FILE (and, in other setups, the rest
 * of GIT_REPOSITORY_ENV_VARS). The pre-commit hook runs this suite, so without
 * isolation a test's `git init <tmp>` re-initialised the enclosing shared clone
 * (core.bare=true) and a test's `git fetch --depth 1` in a temp clone wrote
 * grafts into the shared clone's .git/shallow. See tests/helpers/git_env.ts for
 * the three layers; this file holds each of them in place.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GIT_REPOSITORY_ENV_VARS,
  gitChildEnv,
  gitSync,
  stripGitRepositoryEnv,
} from "../helpers/git_env.js";

const REPO_ROOT = join(__dirname, "../..");
const HELPER = join("tests", "helpers", "git_env.ts");
const SELF = join("tests", "contract", "git_env_isolation.test.ts");

/**
 * A direct child-process call whose program is git: `execFileSync("git", ...)`,
 * `execSync("git log")`, `spawn(\n  "git", ...)`, `execa("git", ...)`, and so
 * on. Whitespace (including newlines) between the call and the string is
 * allowed, since several call sites are formatted across lines.
 */
const DIRECT_GIT_SPAWN =
  /\b(?:execFileSync|execSync|spawnSync|spawn|execFile|exec|execaSync|execa|execaCommandSync|execaCommand)\s*\(\s*(["'`])git(?:\1|\s)/g;
/** simple-git builds its own child env from process.env. */
const SIMPLE_GIT_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']simple-git["']/g;

function findGitSpawns(source: string): number[] {
  const lines: number[] = [];
  for (const pattern of [DIRECT_GIT_SPAWN, SIMPLE_GIT_IMPORT]) {
    pattern.lastIndex = 0;
    for (let m = pattern.exec(source); m; m = pattern.exec(source)) {
      lines.push(source.slice(0, m.index).split("\n").length);
    }
  }
  return lines.sort((a, b) => a - b);
}

const SOURCE_EXT = /\.(?:ts|tsx|js|mjs|cjs)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/;

function walk(dir: string, keep: (rel: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (entry.isFile() && keep(relative(REPO_ROOT, full))) out.push(full);
  }
  return out;
}

/** Every file vitest or playwright can load as a test or a test helper. */
function testSources(): string[] {
  return [
    // Everything under tests/ and playwright/: test files, helpers, fixtures
    // they execute, playwright's global setup. The pre-commit hook runs both.
    ...["tests", "playwright"].flatMap((dir) =>
      walk(join(REPO_ROOT, dir), (rel) => SOURCE_EXT.test(rel))
    ),
    // Co-located test files (vitest.config.ts `include`).
    ...["src", join("frontend", "src"), join("inspector", "src")].flatMap((dir) =>
      walk(join(REPO_ROOT, dir), (rel) => TEST_FILE.test(rel))
    ),
    ...["vitest.setup.ts", "vitest.global_setup.ts"].map((f) => join(REPO_ROOT, f)),
  ].filter((file) => {
    const rel = relative(REPO_ROOT, file);
    return rel !== HELPER && rel !== SELF;
  });
}

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** git with a clean environment, for building fixtures. */
function fixtureGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitChildEnv() }).trim();
}

/**
 * A scratch repository with one commit and a linked worktree, plus the exact
 * variables git exports to a pre-commit hook run in that worktree.
 */
function victimWithHookEnv(): { victim: string; scratch: string; hookEnv: NodeJS.ProcessEnv } {
  const scratch = mkdtempSync(join(tmpdir(), "git-env-isolation-"));
  tmpDirs.push(scratch);
  const victim = join(scratch, "victim");
  fixtureGit(["init", "-q", victim]);
  fixtureGit(
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "fixture",
    ],
    victim
  );
  fixtureGit(["worktree", "add", "-q", join(scratch, "wt"), "-b", "wt"], victim);
  const worktreeGitDir = join(victim, ".git", "worktrees", "wt");
  return {
    victim,
    scratch,
    hookEnv: {
      ...process.env,
      GIT_DIR: worktreeGitDir,
      GIT_INDEX_FILE: join(worktreeGitDir, "index"),
      GIT_PREFIX: "",
    },
  };
}

function isBare(victim: string): string {
  return fixtureGit(["--git-dir", join(victim, ".git"), "config", "core.bare"]);
}

describe("git environment isolation for tests", () => {
  it("no test file spawns git except through tests/helpers/git_env.ts", () => {
    const offenders: string[] = [];
    for (const file of testSources()) {
      for (const line of findGitSpawns(readFileSync(file, "utf8"))) {
        offenders.push(`${relative(REPO_ROOT, file)}:${line}`);
      }
    }
    expect(
      offenders,
      "These test files run git with the inherited environment. Under a git hook that " +
        "environment carries GIT_DIR / GIT_INDEX_FILE, so the command acts on the enclosing " +
        "repository instead of the test's directory. Use gitSync() or gitChildEnv() from " +
        "tests/helpers/git_env.ts."
    ).toEqual([]);
  });

  it("no test file keeps its own list of repository-locating variables", () => {
    // One canonical list: GIT_REPOSITORY_ENV_VARS. A local copy drifts (two
    // copies on main already differed from the helper by GIT_NAMESPACE).
    const marker = ["GIT", "ALTERNATE", "OBJECT", "DIRECTORIES"].join("_");
    const copies = testSources()
      .filter((file) => readFileSync(file, "utf8").includes(`"${marker}"`))
      .map((file) => relative(REPO_ROOT, file));
    expect(
      copies,
      "Import GIT_REPOSITORY_ENV_VARS from tests/helpers/git_env.ts instead of listing the variables."
    ).toEqual([]);
  });

  it("the scan recognises the call shapes it is meant to catch", () => {
    // Pins the detector, so the scan above cannot pass by matching nothing.
    expect(findGitSpawns('execFileSync("git", ["init", dir]);')).toEqual([1]);
    expect(findGitSpawns('x;\nexecSync("git log --oneline", { cwd });')).toEqual([2]);
    expect(findGitSpawns("const out = execFileSync(\n  'git',\n  ['rev-parse']\n);")).toEqual([1]);
    expect(findGitSpawns("spawnSync(`git`, args)")).toEqual([1]);
    expect(findGitSpawns('await execa("git", ["status"])')).toEqual([1]);
    expect(findGitSpawns('import { simpleGit } from "simple-git";')).toEqual([1]);
    expect(findGitSpawns('await import("simple-git")')).toEqual([1]);
    // Not git: a program whose name only starts with "git", a helper call, prose.
    expect(findGitSpawns('execFileSync("gitleaks", ["detect"])')).toEqual([]);
    expect(findGitSpawns('gitSync(["init", "-q", dir])')).toEqual([]);
    expect(findGitSpawns("// runs git init in a temp dir")).toEqual([]);
    // The scan actually reads files: a known git-using test is in scope.
    const scanned = testSources().map((f) => relative(REPO_ROOT, f));
    expect(scanned).toContain(join("tests", "unit", "site_ui_source_binding.test.ts"));
    expect(scanned).toContain(join("playwright", "global_setup.ts"));
  });

  it("gitSync keeps `git init <tmp>` out of the enclosing repository (raw execFileSync does not)", () => {
    const { victim, scratch, hookEnv } = victimWithHookEnv();
    expect(isBare(victim)).toBe("false");

    // Red control: this is what the suite did before the fix. It must still
    // reproduce, or the assertion below proves nothing.
    execFileSync("git", ["init", "-q", join(scratch, "raw")], { env: hookEnv, stdio: "ignore" });
    expect(isBare(victim)).toBe("true");
    expect(existsSync(join(scratch, "raw", ".git"))).toBe(false);

    // Reset, then the helper with the same inherited environment.
    fixtureGit(["--git-dir", join(victim, ".git"), "config", "core.bare", "false"]);
    gitSync(["init", "-q", join(scratch, "helper")], { env: hookEnv });
    expect(isBare(victim)).toBe("false");
    expect(statSync(join(scratch, "helper", ".git")).isDirectory()).toBe(true);
  });

  it("gitSync keeps `git fetch --depth 1` grafts out of the enclosing repository", () => {
    const { victim, scratch, hookEnv } = victimWithHookEnv();
    const source = `file://${join(victim, ".git")}`;
    const head = fixtureGit(["rev-parse", "HEAD"], victim);

    const raw = join(scratch, "raw-clone");
    fixtureGit(["clone", "-q", "--no-checkout", "--depth", "1", source, raw]);
    execFileSync("git", ["fetch", "-q", "--depth", "1", source, head], {
      cwd: raw,
      env: hookEnv,
      stdio: "ignore",
    });
    expect(existsSync(join(victim, ".git", "shallow"))).toBe(true);
    rmSync(join(victim, ".git", "shallow"));

    const helped = join(scratch, "helper-clone");
    fixtureGit(["clone", "-q", "--no-checkout", "--depth", "1", source, helped]);
    gitSync(["fetch", "-q", "--depth", "1", source, head], { cwd: helped, env: hookEnv });
    expect(existsSync(join(victim, ".git", "shallow"))).toBe(false);
    expect(existsSync(join(helped, ".git", "shallow"))).toBe(true);
  });

  it("gitChildEnv drops every GIT_* variable and keeps everything else", () => {
    const env = gitChildEnv(
      {
        PATH: "/usr/bin",
        HOME: "/home/x",
        GIT_DIR: "/elsewhere/.git",
        GIT_INDEX_FILE: "/elsewhere/.git/index",
        GIT_CONFIG_PARAMETERS: "'core.bare'='true'",
        GIT_AUTHOR_NAME: "x",
        LEGIT_VAR: "kept",
      },
      { GIT_TERMINAL_PROMPT: "0" }
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/x",
      LEGIT_VAR: "kept",
      GIT_TERMINAL_PROMPT: "0",
    });
  });

  it("stripGitRepositoryEnv removes exactly the repository-locating variables", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin", GIT_EDITOR: ":" };
    for (const name of GIT_REPOSITORY_ENV_VARS) env[name] = `/x/${name}`;
    expect(stripGitRepositoryEnv(env)).toEqual([...GIT_REPOSITORY_ENV_VARS]);
    expect(env).toEqual({ PATH: "/usr/bin", GIT_EDITOR: ":" });
  });

  it("the test process itself carries none of the repository-locating variables", () => {
    // vitest.global_setup.ts and vitest.setup.ts strip them; in-process code
    // under test (simple-git in canonical_mirror_git, execFileSync in scripts/)
    // inherits process.env directly.
    const present = GIT_REPOSITORY_ENV_VARS.filter((name) => name in process.env);
    expect(present).toEqual([]);
  });

  it("the pre-commit hook unsets the same variables, and only around its test stages", () => {
    const hook = readFileSync(join(REPO_ROOT, ".husky", "pre-commit"), "utf8");
    const fn = hook.match(/unset_git_repository_env\(\)\s*\{([^}]*)\}/);
    expect(fn, "unset_git_repository_env() missing from .husky/pre-commit").not.toBeNull();
    const unset = fn![1]
      .replace(/\\\n/g, " ")
      .replace(/\bunset\b/, "")
      .split(/\s+/)
      .filter(Boolean);
    expect(new Set(unset)).toEqual(new Set(GIT_REPOSITORY_ENV_VARS));

    // Each test runner unsets them inside a subshell, before running anything.
    for (const runner of ["run_vitest_suite", "run_playwright_suite"]) {
      const body = hook.match(new RegExp(`${runner}\\(\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
      expect(body, `${runner}() missing from .husky/pre-commit`).not.toBeNull();
      expect(body![1]).toMatch(/\(\s*\n\s*unset_git_repository_env\s*\n[\s\S]*"\$@"\s*\n\s*\)/);
    }
    // Every test stage goes through a runner; no bare `npm test` / vitest call.
    const stages = hook.match(/timed_stage \S+ .*/g) ?? [];
    for (const stage of stages.filter((s) => /\b(npm test|test:|vitest|playwright)/.test(s))) {
      expect(stage).toMatch(/timed_stage \S+ run_(vitest|playwright)_suite /);
    }
    // Never unset at the top level of the hook: its own git commands (git diff
    // --cached, hook_log) need GIT_INDEX_FILE, which names a temporary index
    // during `git commit -a` / `git commit <paths>`.
    expect(hook).not.toMatch(/^unset_git_repository_env(?!\(\))/m);
    expect(hook).not.toMatch(/^unset GIT_/m);
  });
});
