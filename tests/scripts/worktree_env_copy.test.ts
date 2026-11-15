import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gitChildEnv, gitSync } from "../helpers/git_env.js";

const REPO_ROOT = join(__dirname, "../..");
const COPY_SCRIPT = join(REPO_ROOT, "scripts", "copy-env-to-worktree.js");
const STAGED_ENV_GUARD = join(REPO_ROOT, "scripts", "deny-staged-env-files.js");

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

  it("refuses a production source after explicit opt-in without leaking values", () => {
    writeFileSync(
      join(mainRepo, ".env.dev"),
      'export NEOTOMA_ENV = "production" # synthetic fixture\nSYNTHETIC_KEY=do-not-print\n'
    );

    const result = runNode(COPY_SCRIPT, worktree, { NEOTOMA_WORKTREE_COPY_ENV: "1" });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      "[copy-env] Refused env copy because the source selects production."
    );
    expect(result.stderr).not.toContain("do-not-print");
    expect(existsSync(join(worktree, ".env.development"))).toBe(false);
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
