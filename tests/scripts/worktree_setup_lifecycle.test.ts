/**
 * Worktree setup, exercised through the entrances a developer actually uses:
 *
 *  - the Husky `post-checkout` hook, in a real linked worktree created with
 *    `git worktree add` and on a later checkout inside that worktree
 *  - `scripts/cursor-worktree-init.sh` (npm run setup:worktree)
 *  - the development config loaders, which must pick up the generated file
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
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WORKTREE_DEV_ENV_ALLOWLIST } from "../../scripts/lib/worktree_dev_env.js";

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
      "-c", "user.name=t",
      "-c", "user.email=t@example.invalid",
      "-c", "commit.gpgsign=false",
      "-c", "core.hooksPath=/dev/null",
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

function keysOf(content: string): string[] {
  return content
    .split("\n")
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((k): k is string => Boolean(k));
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
    "scripts/write-worktree-dev-env.js",
    "scripts/lib/worktree_dev_env.js",
    "scripts/lib/dev_env_files.js",
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

  it("git worktree add produces the non-secret .env.development with no manual step", () => {
    // A credential-bearing file in the main checkout must not be carried across.
    writeFileSync(join(fx.main, ".env"), `NEOTOMA_BEARER_TOKEN=${CANARY_VALUE}\n`);

    const add = gitWithHooks(fx.main, ["worktree", "add", worktree(), "-b", "wt-branch"], fx.home);
    expect(add.status, add.stderr).toBe(0);

    expect(existsSync(generated())).toBe(true);
    const content = readFileSync(generated(), "utf-8");
    expect(keysOf(content)).toEqual(WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key));
    expect(content).toContain(`NEOTOMA_DATA_DIR=${join(worktree(), "data")}`);
    expect(content).not.toContain(CANARY_VALUE);
    expect(`${add.stdout}${add.stderr}`).not.toContain(CANARY_VALUE);
    rmSync(join(fx.main, ".env"), { force: true });
  });

  it("a checkout run from the worktree's own hook path regenerates a missing file", () => {
    rmSync(generated(), { force: true });
    // `npm install` in the worktree generates its own Husky shims; hooks then run from its own path.
    const husky = spawnSync(HUSKY_BIN, [], { cwd: worktree(), encoding: "utf-8", env: cleanEnv(fx.home) });
    expect(husky.status, husky.stderr).toBe(0);

    const checkout = gitWithHooks(worktree(), ["checkout", "-b", "second-branch"], fx.home);
    expect(checkout.status, checkout.stderr).toBe(0);

    expect(existsSync(generated())).toBe(true);
    expect(keysOf(readFileSync(generated(), "utf-8"))).toEqual(
      WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key)
    );
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

  it("reports a generator failure on stderr and never fails the checkout", () => {
    rmSync(generated(), { force: true });
    const original = readFileSync(join(worktree(), "scripts", "write-worktree-dev-env.js"), "utf-8");
    writeFileSync(join(worktree(), "scripts", "write-worktree-dev-env.js"), "process.exit(3);\n");
    try {
      const checkout = gitWithHooks(worktree(), ["checkout", "-b", "fourth-branch"], fx.home);
      expect(checkout.status, checkout.stderr).toBe(0);
      expect(checkout.stderr).toMatch(/\[worktree-env\].*(fail|could not)/i);
      expect(checkout.stderr).toContain("npm run setup:worktree-env");
    } finally {
      writeFileSync(join(worktree(), "scripts", "write-worktree-dev-env.js"), original);
    }
  });
});

describe("scripts/cursor-worktree-init.sh", () => {
  function initFixture(generatorSource: string | null) {
    const dir = realpathSync(mkdtempSync(join(fx.root, "init-")));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "neotoma", type: "module" }));
    mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
    copyFileSync(
      join(REPO_ROOT, "scripts", "cursor-worktree-init.sh"),
      join(dir, "scripts", "cursor-worktree-init.sh")
    );
    if (generatorSource === null) {
      copyFileSync(
        join(REPO_ROOT, "scripts", "write-worktree-dev-env.js"),
        join(dir, "scripts", "write-worktree-dev-env.js")
      );
      copyFileSync(
        join(REPO_ROOT, "scripts", "lib", "worktree_dev_env.js"),
        join(dir, "scripts", "lib", "worktree_dev_env.js")
      );
    } else {
      writeFileSync(join(dir, "scripts", "write-worktree-dev-env.js"), generatorSource);
    }
    return dir;
  }

  const run = (dir: string) =>
    spawnSync("bash", [join(dir, "scripts", "cursor-worktree-init.sh")], {
      cwd: dir,
      encoding: "utf-8",
      env: cleanEnv(fx.home),
    });

  it("reports failure and exits non-zero when the generator fails", () => {
    const dir = initFixture("process.stderr.write('simulated failure\\n'); process.exit(2);\n");
    const result = run(dir);
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).not.toMatch(/Worktree setup complete/);
    expect(output).toMatch(/fail/i);
    expect(output).toContain("npm run setup:worktree-env");
    expect(existsSync(join(dir, ".env.development"))).toBe(false);
  });

  it("reports success, writes the file, and exits 0 when the generator succeeds", () => {
    const dir = initFixture(null);
    const result = run(dir);
    expect(result.status, result.stderr).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/Worktree setup complete/);
    expect(keysOf(readFileSync(join(dir, ".env.development"), "utf-8"))).toEqual(
      WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key)
    );
  });
});

describe("generated dev settings take effect in the development loaders", () => {
  /** A Neotoma-shaped checkout holding a freshly generated .env.development. */
  function generatedCheckout(extraFiles: Record<string, string> = {}) {
    const dir = realpathSync(mkdtempSync(join(fx.root, "cfg-")));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "neotoma", type: "module" }));
    mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
    copyFileSync(
      join(REPO_ROOT, "scripts", "write-worktree-dev-env.js"),
      join(dir, "scripts", "write-worktree-dev-env.js")
    );
    copyFileSync(
      join(REPO_ROOT, "scripts", "lib", "worktree_dev_env.js"),
      join(dir, "scripts", "lib", "worktree_dev_env.js")
    );
    const gen = spawnSync(process.execPath, [join(dir, "scripts", "write-worktree-dev-env.js")], {
      cwd: dir,
      encoding: "utf-8",
      env: cleanEnv(fx.home),
    });
    expect(gen.status, gen.stderr).toBe(0);
    for (const [name, body] of Object.entries(extraFiles)) writeFileSync(join(dir, name), body);
    return dir;
  }

  function loadConfig(projectRoot: string, extraEnv: Record<string, string> = {}) {
    // The user-level config (HOME) names a different data directory, as a developer's real one would.
    const script = `import { config } from ${JSON.stringify(
      pathToFileURL(join(REPO_ROOT, "src", "config.ts")).href
    )};\nconsole.log("RESULT:" + JSON.stringify({ dataDir: config.dataDir }));\n`;
    const result = spawnSync(TSX_BIN, ["--eval", script], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: cleanEnv(fx.home, { NEOTOMA_PROJECT_ROOT: projectRoot, ...extraEnv }),
    });
    const line = result.stdout.split("\n").find((l) => l.startsWith("RESULT:"));
    expect(line, `config did not load: ${result.stderr.slice(0, 500)}`).toBeDefined();
    return JSON.parse((line as string).slice("RESULT:".length)) as { dataDir: string };
  }

  it("src/config.ts applies the generated NEOTOMA_DATA_DIR over the user-level fallback", () => {
    const dir = generatedCheckout();
    expect(loadConfig(dir).dataDir).toBe(join(dir, "data"));
  });

  it("a developer's own .env still takes precedence over the generated file", () => {
    const dir = generatedCheckout({ ".env": "NEOTOMA_DATA_DIR=/own/choice\n" });
    expect(loadConfig(dir).dataDir).toBe("/own/choice");
  });

  it("an explicit shell setting still takes precedence over the generated file", () => {
    const dir = generatedCheckout();
    expect(loadConfig(dir, { NEOTOMA_DATA_DIR: "/from/shell" }).dataDir).toBe("/from/shell");
  });

  it("scripts/dev-serve.js loads the generated file through the shared env-file list", () => {
    const dir = generatedCheckout({ ".env": "HTTP_PORT=4555\n" });
    const helper = pathToFileURL(join(REPO_ROOT, "scripts", "lib", "dev_env_files.js")).href;
    const dotenvPath = createRequire(join(REPO_ROOT, "package.json")).resolve("dotenv");
    const script = `
      import { createRequire } from "node:module";
      const dotenv = createRequire(${JSON.stringify(pathToFileURL(REPO_ROOT + "/").href)})(${JSON.stringify(dotenvPath)});
      const { loadDevEnvFiles } = await import(${JSON.stringify(helper)});
      loadDevEnvFiles(dotenv, process.cwd(), "development");
      console.log("RESULT:" + JSON.stringify({
        port: process.env.PORT,
        dataDir: process.env.NEOTOMA_DATA_DIR,
        httpPort: process.env.HTTP_PORT,
      }));
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: dir,
      encoding: "utf-8",
      env: cleanEnv(fx.home),
    });
    const line = result.stdout.split("\n").find((l) => l.startsWith("RESULT:"));
    expect(line, `loader failed: ${result.stderr.slice(0, 500)}`).toBeDefined();
    const parsed = JSON.parse((line as string).slice("RESULT:".length));
    expect(parsed.dataDir).toBe(join(dir, "data"));
    expect(parsed.port).toBe("3000");
    // The developer's own .env wins where both set a key.
    expect(parsed.httpPort).toBe("4555");

    const devServe = readFileSync(join(REPO_ROOT, "scripts", "dev-serve.js"), "utf-8");
    expect(devServe).toContain("loadDevEnvFiles");
  });
});
