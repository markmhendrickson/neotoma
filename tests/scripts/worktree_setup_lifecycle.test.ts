/**
 * Worktree setup, exercised through the entrances a developer actually uses:
 *
 *  - the Husky `post-checkout` hook, in a real linked worktree created with
 *    `git worktree add` and on a later checkout inside that worktree
 *  - `scripts/cursor-worktree-init.sh` (npm run setup:worktree)
 *  - the existing runtime config boundary against synthetic stale copies
 *
 * Every fixture is a throwaway repository under the OS temp directory. Hooks are
 * left ENABLED for the git commands under test; they are only disabled for the
 * fixture's own bookkeeping commit.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HUSKY_BIN = join(REPO_ROOT, "node_modules", ".bin", "husky");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

const CANARY_VALUE = "canary-bearer-8f3a1c0d";

/** Minimal, deterministic environment for child processes (no ambient secrets). */
function cleanEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  return { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, ...extra };
}

function gitNoHooks(cwd: string, args: string[], home: string) {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd, stdio: "pipe", env: cleanEnv(home) }
  );
}

/** Run git with the repository's own configuration, so Husky hooks fire. */
function gitWithHooks(cwd: string, args: string[], home: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8", env: cleanEnv(home) });
}

function copyInto(root: string, relPath: string) {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(REPO_ROOT, relPath), target);
}

interface Fixture {
  root: string;
  home: string;
  main: string;
}

function buildMainCheckout(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "worktree-lifecycle-")));
  const home = join(root, "home");
  const main = join(root, "main");
  mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
  // The operator's private config, holding a canary value that must never be carried.
  writeFileSync(
    join(home, ".config", "neotoma", ".env"),
    `NEOTOMA_BEARER_TOKEN=${CANARY_VALUE}\nNEOTOMA_DATA_DIR=/elsewhere/data\n`
  );
  mkdirSync(main);
  gitNoHooks(main, ["init", "-q", "-b", "main"], home);
  writeFileSync(join(main, "package.json"), JSON.stringify({ name: "neotoma", type: "module" }));
  for (const rel of [
    "scripts/copy-env-to-worktree.js",
    "scripts/write-worktree-dev-env.js",
    "scripts/lib/worktree_dev_env.js",
    "scripts/cursor-worktree-init.sh",
    ".husky/post-checkout",
  ]) {
    if (existsSync(join(REPO_ROOT, rel))) copyInto(main, rel);
  }
  writeFileSync(join(main, ".gitignore"), ".env\n.env.*\n_\n");
  gitNoHooks(main, ["add", "-A"], home);
  gitNoHooks(main, ["commit", "-q", "-m", "init"], home);
  // Activate Husky exactly as `npm install` (the `prepare` script) does.
  const husky = spawnSync(HUSKY_BIN, [], { cwd: main, encoding: "utf-8", env: cleanEnv(home) });
  expect(husky.status, `husky failed: ${husky.stderr}`).toBe(0);
  return { root, home, main };
}

let fx: Fixture;

beforeAll(() => {
  fx = buildMainCheckout();
});

afterAll(() => {
  if (fx) rmSync(fx.root, { recursive: true, force: true });
});

describe("post-checkout hook in a real linked worktree", () => {
  const worktree = () => join(fx.root, "wt");
  const generated = () => join(worktree(), ".env.development");

  it("git worktree add leaves .env.development absent despite a live source", () => {
    // A credential-bearing file in the main checkout must not be carried across.
    writeFileSync(join(fx.main, ".env"), `NEOTOMA_BEARER_TOKEN=${CANARY_VALUE}\n`);

    const add = gitWithHooks(fx.main, ["worktree", "add", worktree(), "-b", "wt-branch"], fx.home);
    expect(add.status, add.stderr).toBe(0);

    expect(existsSync(generated())).toBe(false);
    expect(`${add.stdout}${add.stderr}`).not.toContain(CANARY_VALUE);
    rmSync(join(fx.main, ".env"), { force: true });
  });

  it("a checkout run from the worktree's own hook path still leaves the file absent", () => {
    rmSync(generated(), { force: true });
    // `npm install` in the worktree generates its own Husky shims; hooks then run from its own path.
    const husky = spawnSync(HUSKY_BIN, [], {
      cwd: worktree(),
      encoding: "utf-8",
      env: cleanEnv(fx.home),
    });
    expect(husky.status, husky.stderr).toBe(0);

    const checkout = gitWithHooks(worktree(), ["checkout", "-b", "second-branch"], fx.home);
    expect(checkout.status, checkout.stderr).toBe(0);

    expect(existsSync(generated())).toBe(false);
  });

  it("keeps a developer's existing settings on a later checkout", () => {
    writeFileSync(generated(), "PORT=4321\n");
    const checkout = gitWithHooks(worktree(), ["checkout", "-b", "third-branch"], fx.home);
    expect(checkout.status, checkout.stderr).toBe(0);
    expect(readFileSync(generated(), "utf-8")).toBe("PORT=4321\n");
  });

  it("does not write a dev env file into the main checkout", () => {
    const checkout = gitWithHooks(fx.main, ["checkout", "-b", "main-side-branch"], fx.home);
    expect(checkout.status, checkout.stderr).toBe(0);
    expect(existsSync(join(fx.main, ".env.development"))).toBe(false);
  });

  it("reports a bootstrap failure on stderr and never fails the checkout", () => {
    rmSync(generated(), { force: true });
    const original = readFileSync(join(worktree(), "scripts", "copy-env-to-worktree.js"), "utf-8");
    writeFileSync(join(worktree(), "scripts", "copy-env-to-worktree.js"), "process.exit(3);\n");
    try {
      const checkout = gitWithHooks(worktree(), ["checkout", "-b", "fourth-branch"], fx.home);
      expect(checkout.status, checkout.stderr).toBe(0);
      expect(checkout.stderr).toMatch(/\[worktree-env\].*(fail|could not)/i);
      expect(checkout.stderr).toContain("npm run copy:env");
    } finally {
      writeFileSync(join(worktree(), "scripts", "copy-env-to-worktree.js"), original);
    }
  });
});

describe("scripts/cursor-worktree-init.sh", () => {
  function initFixture(bootstrapSource: string | null) {
    const dir = realpathSync(mkdtempSync(join(fx.root, "init-")));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "neotoma", type: "module" }));
    mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
    copyFileSync(
      join(REPO_ROOT, "scripts", "cursor-worktree-init.sh"),
      join(dir, "scripts", "cursor-worktree-init.sh")
    );
    if (bootstrapSource === null) {
      copyFileSync(
        join(REPO_ROOT, "scripts", "copy-env-to-worktree.js"),
        join(dir, "scripts", "copy-env-to-worktree.js")
      );
      copyFileSync(
        join(REPO_ROOT, "scripts", "lib", "worktree_dev_env.js"),
        join(dir, "scripts", "lib", "worktree_dev_env.js")
      );
    } else {
      writeFileSync(join(dir, "scripts", "copy-env-to-worktree.js"), bootstrapSource);
    }
    return dir;
  }

  const run = (dir: string) =>
    spawnSync("bash", [join(dir, "scripts", "cursor-worktree-init.sh")], {
      cwd: dir,
      encoding: "utf-8",
      env: cleanEnv(fx.home),
    });

  it("reports failure and exits non-zero when the bootstrap helper fails", () => {
    const dir = initFixture("process.stderr.write('simulated failure\\n'); process.exit(2);\n");
    const result = run(dir);
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).not.toMatch(/Worktree setup complete/);
    expect(output).toMatch(/fail/i);
    expect(output).toContain("npm run copy:env");
    expect(existsSync(join(dir, ".env.development"))).toBe(false);
  });

  it("reports success without writing a file when bootstrap succeeds", () => {
    const dir = initFixture(null);
    const result = run(dir);
    expect(result.status, result.stderr).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/Worktree setup complete/);
    expect(existsSync(join(dir, ".env.development"))).toBe(false);
  });
});

describe("synthetic stale worktree env stays outside the runtime loaders", () => {
  function staleCheckout(extraFiles: Record<string, string> = {}) {
    const dir = realpathSync(mkdtempSync(join(fx.root, "stale-")));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "neotoma", type: "module" }));
    writeFileSync(
      join(dir, ".env.development"),
      "NEOTOMA_BEARER_TOKEN=synthetic-stale-only\nNEOTOMA_DATA_DIR=/stale/copied-data\n"
    );
    for (const [name, body] of Object.entries(extraFiles)) writeFileSync(join(dir, name), body);
    return dir;
  }

  function readConfig(projectRoot: string, extraEnv: Record<string, string> = {}) {
    const emptyHome = join(fx.root, "isolated-home");
    mkdirSync(emptyHome, { recursive: true });
    const script = `import { config } from ${JSON.stringify(
      pathToFileURL(join(REPO_ROOT, "src", "config.ts")).href
    )};\nconsole.log("RESULT:" + JSON.stringify({ dataDir: config.dataDir, staleToken: process.env.NEOTOMA_BEARER_TOKEN }));\n`;
    const result = spawnSync(TSX_BIN, ["--eval", script], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: cleanEnv(emptyHome, { NEOTOMA_PROJECT_ROOT: projectRoot, ...extraEnv }),
    });
    const line = result.stdout.split("\n").find((l) => l.startsWith("RESULT:"));
    expect(line, `config did not load: ${result.stderr.slice(0, 500)}`).toBeDefined();
    return JSON.parse((line as string).slice("RESULT:".length)) as {
      dataDir: string;
      staleToken?: string;
    };
  }

  it("ignores a stale credential-bearing .env.development when no explicit source is provided", () => {
    const result = readConfig(staleCheckout());
    expect(result.dataDir).not.toBe("/stale/copied-data");
    expect(result.staleToken).toBeUndefined();
  });

  it("preserves the existing project .env and shell source behavior", () => {
    const own = staleCheckout({ ".env": "NEOTOMA_DATA_DIR=/own/choice\n" });
    const ownResult = readConfig(own);
    expect(ownResult.dataDir).toBe("/own/choice");
    expect(ownResult.staleToken).toBeUndefined();
    const shell = staleCheckout();
    const shellResult = readConfig(shell, { NEOTOMA_DATA_DIR: "/from/shell" });
    expect(shellResult.dataDir).toBe("/from/shell");
    expect(shellResult.staleToken).toBeUndefined();
  });

  it("keeps dev-serve on its existing .env-only non-production file list", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "dev-serve.js"), "utf-8");
    expect(source).toContain("[path.join(projectRoot, '.env')]");
    expect(source).not.toContain("loadDevEnvFiles");
    expect(source).not.toContain(".env.development");
  });
});
