import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gitChildEnv, gitSync } from "../helpers/git_env.js";

const REPO_ROOT = join(__dirname, "../..");
const COPY_SCRIPT = join(REPO_ROOT, "scripts", "copy-env-to-worktree.js");
const STAGED_ENV_GUARD = join(REPO_ROOT, "scripts", "deny-staged-env-files.js");
const POST_CHECKOUT_HOOK = join(REPO_ROOT, ".husky", "post-checkout");

const PRODUCTION_ENV_SOURCES = [
  ["an unquoted inline comment without a separating space", "NEOTOMA_ENV=production#note\n"],
  ["a quoted inline comment without a separating space", 'NEOTOMA_ENV="production"#note\n'],
  ["a backtick-quoted value", "NEOTOMA_ENV=`production`\n"],
  ["a colon assignment", "NEOTOMA_ENV: production\n"],
  ["carriage-return-only line endings", "NEOTOMA_ENV=production\rSYNTHETIC_FLAG=local\r"],
  ["a plain value", "NEOTOMA_ENV=production\n"],
] as const;

let sandbox: string;
let homeDir: string;
let mainRepo: string;
let worktree: string;

function isolatedEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = gitChildEnv(process.env, {
    HOME: homeDir,
    USERPROFILE: homeDir,
    ...overrides,
  });
  for (const name of [
    "NEOTOMA_ENV",
    "NEOTOMA_DATA_DIR",
    "NEOTOMA_BEARER_TOKEN",
    "NEOTOMA_BASE_URL",
    "NEOTOMA_MCP_USE_LOCAL_PORT_FILE",
    "OPENAI_API_KEY",
    "NEOTOMA_WORKTREE_COPY_ENV",
  ]) {
    delete env[name];
  }
  return { ...env, ...overrides };
}

function runNode(script: string, cwd: string, overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    env: isolatedEnv(overrides),
    encoding: "utf8",
  });
}

function runPostCheckoutHook(overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync("sh", [POST_CHECKOUT_HOOK, "old", "new", "0"], {
    cwd: worktree,
    env: isolatedEnv(overrides),
    encoding: "utf8",
  });
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "neotoma-worktree-env-"));
  homeDir = join(sandbox, "home");
  mainRepo = join(homeDir, "repo");
  worktree = join(homeDir, "worktree");
  mkdirSync(homeDir, { recursive: true });

  gitSync(["init", "-q", "-b", "main", mainRepo], { env: isolatedEnv() });
  gitSync(
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
    { cwd: mainRepo, env: isolatedEnv() }
  );
  gitSync(["worktree", "add", "-q", "-b", "fixture-worktree", worktree], {
    cwd: mainRepo,
    env: isolatedEnv(),
  });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("worktree env copy opt-in", () => {
  it("copies nothing without explicit opt-in", () => {
    writeFileSync(join(mainRepo, ".env.dev"), "NEOTOMA_ENV=development\nSYNTHETIC_KEY=local\n");

    const result = runNode(COPY_SCRIPT, worktree);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      "[copy-env] Skipped env copy. Set NEOTOMA_WORKTREE_COPY_ENV=1 to opt in."
    );
    expect(existsSync(join(worktree, ".env.development"))).toBe(false);
  });

  it("copies a non-production source after explicit opt-in", () => {
    const contents = "NEOTOMA_ENV=development\nSYNTHETIC_KEY=local\n";
    writeFileSync(join(mainRepo, ".env.dev"), contents);

    const result = runNode(COPY_SCRIPT, worktree, { NEOTOMA_WORKTREE_COPY_ENV: "1" });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("[copy-env] Copied env file to .env.development.");
    expect(readFileSync(join(worktree, ".env.development"), "utf8")).toBe(contents);
  });

  it.each(PRODUCTION_ENV_SOURCES)(
    "refuses a production source using %s without leaking values",
    (_description, productionLine) => {
      writeFileSync(join(mainRepo, ".env.dev"), `${productionLine}SYNTHETIC_KEY=do-not-print\n`);

      const result = runNode(COPY_SCRIPT, worktree, { NEOTOMA_WORKTREE_COPY_ENV: "1" });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe(
        "[copy-env] Refused env copy because the source selects production."
      );
      expect(result.stderr).not.toContain("do-not-print");
      expect(existsSync(join(worktree, ".env.development"))).toBe(false);
    }
  );

  it("refuses an unreadable selected source without creating or replacing the destination", () => {
    const source = join(mainRepo, ".env.dev");
    const destination = join(worktree, ".env.development");
    const preload = join(sandbox, "fail-selected-env-read.cjs");
    const existingDestination = "NEOTOMA_ENV=development\nSYNTHETIC_KEY=keep-existing\n";
    writeFileSync(source, "NEOTOMA_ENV=development\nSYNTHETIC_KEY=do-not-print\n");
    writeFileSync(destination, existingDestination);
    writeFileSync(
      preload,
      [
        'const fs = require("node:fs");',
        'const { syncBuiltinESMExports } = require("node:module");',
        "const originalReadFileSync = fs.readFileSync;",
        "fs.readFileSync = function (...args) {",
        "  if (fs.realpathSync(args[0]) === fs.realpathSync(process.env.NEOTOMA_TEST_FAIL_READ_PATH)) {",
        '    const error = new Error("synthetic unreadable source");',
        '    Object.assign(error, { code: "EACCES" });',
        "    throw error;",
        "  }",
        "  return originalReadFileSync.apply(this, args);",
        "};",
        "syncBuiltinESMExports();",
        "",
      ].join("\n")
    );

    const result = runNode(COPY_SCRIPT, worktree, {
      NEOTOMA_WORKTREE_COPY_ENV: "1",
      NEOTOMA_TEST_FAIL_READ_PATH: source,
      NODE_OPTIONS: `--require=${preload}`,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      "[copy-env] Refused env copy because the source could not be validated."
    );
    expect(result.stderr).not.toContain("do-not-print");
    expect(readFileSync(destination, "utf8")).toBe(existingDestination);
  });
});

describe("staged env file guard", () => {
  it("rejects staged .env files while allowing example templates", () => {
    writeFileSync(join(mainRepo, ".env.local"), "SYNTHETIC_KEY=local\n");
    writeFileSync(join(mainRepo, ".env.production.example"), "SYNTHETIC_KEY=\n");
    gitSync(["add", "-f", ".env.local", ".env.production.example"], {
      cwd: mainRepo,
      env: isolatedEnv(),
    });

    const rejected = runNode(STAGED_ENV_GUARD, mainRepo);

    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("[pre-commit] Refusing staged env files.");
    expect(rejected.stderr).toContain(".env.local");
    expect(rejected.stderr).not.toContain(".env.production.example");

    gitSync(["restore", "--staged", ".env.local"], { cwd: mainRepo, env: isolatedEnv() });
    const allowed = runNode(STAGED_ENV_GUARD, mainRepo);
    expect(allowed.status).toBe(0);
  });

  it("runs the guard before pre-commit validation stages", () => {
    const hook = readFileSync(join(REPO_ROOT, ".husky", "pre-commit"), "utf8");
    const guardIndex = hook.indexOf("node scripts/deny-staged-env-files.js");
    const typeCheckIndex = hook.indexOf('echo "Running type check..."');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(typeCheckIndex).toBeGreaterThan(guardIndex);
  });
});

describe("post-checkout hook env copy", () => {
  it("does not copy by default", () => {
    writeFileSync(join(mainRepo, ".env.dev"), "NEOTOMA_ENV=development\n");

    const result = runPostCheckoutHook();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Skipped env copy");
    expect(existsSync(join(worktree, ".env.development"))).toBe(false);
  });

  it("copies safe content with explicit opt-in", () => {
    const contents = "NEOTOMA_ENV=development\nSYNTHETIC_KEY=local\n";
    writeFileSync(join(mainRepo, ".env.dev"), contents);

    const result = runPostCheckoutHook({ NEOTOMA_WORKTREE_COPY_ENV: "1" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Copied env file to .env.development");
    expect(readFileSync(join(worktree, ".env.development"), "utf8")).toBe(contents);
  });

  it("leaves an existing destination unchanged for a production source", () => {
    const destination = join(worktree, ".env.development");
    const original = "NEOTOMA_ENV=development\nSYNTHETIC_KEY=keep-existing\n";
    writeFileSync(join(mainRepo, ".env.dev"), "NEOTOMA_ENV: production\nSYNTHETIC_KEY=secret\n");
    writeFileSync(destination, original);

    const result = runPostCheckoutHook({ NEOTOMA_WORKTREE_COPY_ENV: "1" });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Refused env copy because the source selects production");
    expect(result.stderr).not.toContain("secret");
    expect(readFileSync(destination, "utf8")).toBe(original);
  });
});
