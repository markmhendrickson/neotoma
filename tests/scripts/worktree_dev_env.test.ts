import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CREDENTIAL_KEY_PATTERN,
  WORKTREE_DEV_ENV_ALLOWLIST,
  buildWorktreeDevEnv,
} from "../../scripts/lib/worktree_dev_env.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS_DIR = join(REPO_ROOT, "scripts");

/** Worktree setup script under test. Overridable so the same suite can be pointed at another script. */
const SCRIPT = process.env.WORKTREE_ENV_SCRIPT
  ? resolve(process.env.WORKTREE_ENV_SCRIPT)
  : join(SCRIPTS_DIR, "write-worktree-dev-env.js");

// Independent of the library's own pattern, so the test cannot be satisfied by weakening it.
const CREDENTIAL_NAME = /(TOKEN|SECRET|KEY|MNEMONIC|PASSWORD|PAT|PRIVATE)/i;

const CANARIES: Record<string, string> = {
  NEOTOMA_BEARER_TOKEN: "canary-bearer-8f3a1c0d",
  NEOTOMA_MNEMONIC: "canary mnemonic words zebra quartz",
  MCP_TOKEN_ENCRYPTION_KEY: "canary-enc-5b9e7720",
  OPENAI_API_KEY: "sk-canary-0c11aa22",
  GITHUB_PAT: "ghp_canary_77de01",
  AGENT_SITE_AAUTH_PRIVATE_JWK: "canary-private-jwk-d41d8cd9",
  SOME_SERVICE_SECRET: "canary-secret-3344ee",
  SOME_SERVICE_PASSWORD: "canary-password-aa99",
};
const CANARY_FILE = `${Object.entries(CANARIES)
  .map(([k, v]) => `${k}=${v}`)
  .join("\n")}\nNEOTOMA_DATA_DIR=/canary/data/dir\n`;

const git = (cwd: string, args: string[]) =>
  execFileSync(
    "git",
    [
      "-c", "user.name=t",
      "-c", "user.email=t@example.invalid",
      "-c", "commit.gpgsign=false",
      "-c", "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd, stdio: "pipe", env: { PATH: process.env.PATH ?? "" } }
  );

interface Fixture {
  root: string;
  home: string;
  main: string;
  worktree: string;
}

let fixture: Fixture;

beforeAll(() => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "worktree-env-")));
  const home = join(root, "home");
  const main = join(root, "main");
  const worktree = join(root, "wt");
  mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
  // The operator's private config, holding canary credentials.
  writeFileSync(join(home, ".config", "neotoma", ".env"), CANARY_FILE);
  mkdirSync(main);
  git(main, ["init", "-q", "-b", "main"]);
  writeFileSync(join(main, "package.json"), JSON.stringify({ name: "neotoma" }));
  git(main, ["add", "package.json"]);
  git(main, ["commit", "-q", "-m", "init"]);
  git(main, ["worktree", "add", "-q", worktree, "-b", "wt-branch"]);
  fixture = { root, home, main, worktree };
});

afterAll(() => {
  if (fixture) rmSync(fixture.root, { recursive: true, force: true });
});

function runScript(
  args: string[] = [],
  extra: { cwd?: string; nodeArgs?: string[] } = {}
) {
  return spawnSync(process.execPath, [...(extra.nodeArgs ?? []), SCRIPT, ...args], {
    cwd: extra.cwd ?? fixture.worktree,
    encoding: "utf-8",
    env: { PATH: process.env.PATH ?? "", HOME: fixture.home, USERPROFILE: fixture.home },
  });
}

function devEnvPath() {
  return join(fixture.worktree, ".env.development");
}

function resetWorktreeEnv() {
  rmSync(devEnvPath(), { force: true });
  rmSync(join(fixture.main, ".env"), { force: true });
}

function keysOf(content: string): string[] {
  return content
    .split("\n")
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((k): k is string => Boolean(k));
}

describe("worktree setup credential canary", () => {
  const sources: Array<[string, () => void]> = [
    ["private config under HOME/.config/neotoma", () => undefined],
    [
      "repo-local .env in the main checkout",
      () => writeFileSync(join(fixture.main, ".env"), CANARY_FILE),
    ],
  ];

  it.each(sources)("never carries credentials out of the %s", (_label, seed) => {
    resetWorktreeEnv();
    seed();

    runScript();

    const output = existsSync(devEnvPath()) ? readFileSync(devEnvPath(), "utf-8") : "";
    for (const value of Object.values(CANARIES)) {
      expect(output).not.toContain(value);
    }
    expect(output).not.toContain("/canary/data/dir");
    for (const key of keysOf(output)) {
      expect(key, `credential-named key in generated env: ${key}`).not.toMatch(CREDENTIAL_NAME);
    }
    resetWorktreeEnv();
  });

  it("writes exactly the allowlisted non-secret keys", () => {
    resetWorktreeEnv();
    const result = runScript();
    expect(result.status).toBe(0);
    const output = readFileSync(devEnvPath(), "utf-8");
    expect(keysOf(output)).toEqual(WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key));
    expect(output).toContain(`NEOTOMA_DATA_DIR=${join(fixture.worktree, "data")}`);
    expect(output).toContain("NEOTOMA_ENV=development");
    resetWorktreeEnv();
  });
});

describe("worktree setup reads only inside the repo", () => {
  it("opens no file outside the repository (not HOME, not the main checkout)", () => {
    resetWorktreeEnv();
    const log =join(fixture.root, "fs-access.log");
    const preload = join(fixture.root, "trace-fs.cjs");
    writeFileSync(
      preload,
      `
const fs = require('fs');
const path = require('path');
const log = process.env.FS_TRACE_LOG;
const record = (p) => {
  try {
    if (typeof p === 'string' || Buffer.isBuffer(p)) {
      fs.appendFileSync(log, path.resolve(process.cwd(), p.toString()) + '\\n');
    } else if (p && typeof p === 'object' && p.pathname) {
      fs.appendFileSync(log, p.pathname + '\\n');
    }
  } catch {}
};
for (const name of ['readFileSync','openSync','existsSync','statSync','lstatSync','readdirSync','accessSync','copyFileSync','createReadStream','realpathSync','readFile','open','stat','access']) {
  const orig = fs[name];
  if (typeof orig !== 'function') continue;
  fs[name] = function (...args) { record(args[0]); if (name === 'copyFileSync') record(args[1]); return orig.apply(this, args); };
}
`
    );
    const spawned = spawnSync(process.execPath, ["--require", preload, SCRIPT], {
      cwd: fixture.worktree,
      encoding: "utf-8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: fixture.home,
        USERPROFILE: fixture.home,
        FS_TRACE_LOG: log,
      },
    });
    expect(spawned.error).toBeUndefined();

    const touched = existsSync(log)
      ? readFileSync(log, "utf-8").split("\n").filter(Boolean)
      : [];
    const allowedRoots = [fixture.worktree, SCRIPTS_DIR];
    const outside = touched.filter(
      (p) => !allowedRoots.some((r) => p === r || p.startsWith(r + sep))
    );
    expect(outside, `paths touched outside the repo: ${outside.join(", ")}`).toEqual([]);
    resetWorktreeEnv();
  });

  it("has no code path to the home directory, other checkouts, or a subprocess", () => {
    for (const file of [
      join(SCRIPTS_DIR, "lib", "worktree_dev_env.js"),
      join(SCRIPTS_DIR, "write-worktree-dev-env.js"),
    ]) {
      const source = readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(source, file).not.toMatch(/homedir|process\.env|\.config|child_process|git-common-dir/);
    }
  });
});

describe("worktree setup behavior", () => {
  it("leaves an existing .env.development untouched and never prints its content", () => {
    resetWorktreeEnv();
    writeFileSync(devEnvPath(), "MY_SERVICE_TOKEN=dev-own-value\nPORT=4000\n");
    const result = runScript();
    expect(result.status).toBe(0);
    expect(readFileSync(devEnvPath(), "utf-8")).toBe("MY_SERVICE_TOKEN=dev-own-value\nPORT=4000\n");
    expect(`${result.stdout}${result.stderr}`).toMatch(/already exists/);
    expect(`${result.stdout}${result.stderr}`).not.toContain("dev-own-value");
    resetWorktreeEnv();
  });

  it("regenerates over an existing file only with --force", () => {
    resetWorktreeEnv();
    writeFileSync(devEnvPath(), "MY_SERVICE_TOKEN=dev-own-value\n");
    expect(runScript(["--force"]).status).toBe(0);
    expect(readFileSync(devEnvPath(), "utf-8")).not.toContain("dev-own-value");
    resetWorktreeEnv();
  });

  it("refuses to write outside a Neotoma checkout", () => {
    const elsewhere = join(fixture.root, "elsewhere");
    mkdirSync(elsewhere, { recursive: true });
    const result = runScript([], { cwd: elsewhere });
    expect(result.status).toBe(1);
    expect(existsSync(join(elsewhere, ".env.development"))).toBe(false);
  });

  it("documents that credentials are the developer's own to set", () => {
    const help = runScript(["--help"]).stdout;
    expect(help).toMatch(/never writes credentials/i);
    expect(help).toMatch(/set them\s+yourself/i);
  });
});

describe("worktree setup stays inside the worktree for the destination entry", () => {
  const OUTSIDE_CONTENT = "OUTSIDE_SECRET_NAME=outside-planted-value\n";
  const outside = () => join(fixture.root, "outside-target");

  function resetOutside() {
    rmSync(outside(), { recursive: true, force: true });
    mkdirSync(outside(), { recursive: true });
    writeFileSync(join(outside(), "file"), OUTSIDE_CONTENT);
  }

  function outsideUnchanged() {
    return readFileSync(join(outside(), "file"), "utf-8") === OUTSIDE_CONTENT;
  }

  it("never opens or reads an existing .env.development (the planted content stays unread)", () => {
    resetWorktreeEnv();
    resetOutside();
    writeFileSync(devEnvPath(), "MY_SERVICE_TOKEN=dev-own-value\n");
    const log = join(fixture.root, "read-trace.log");
    rmSync(log, { force: true });
    const preload = join(fixture.root, "trace-reads.cjs");
    writeFileSync(
      preload,
      `
const fs = require('fs');
const path = require('path');
const log = process.env.FS_TRACE_LOG;
for (const name of ['readFileSync','openSync','createReadStream','readFile','open']) {
  const orig = fs[name];
  if (typeof orig !== 'function') continue;
  fs[name] = function (...args) {
    try {
      const p = args[0];
      if (typeof p === 'string') fs.appendFileSync(log, name + ' ' + path.resolve(process.cwd(), p) + '\\n');
    } catch {}
    return orig.apply(this, args);
  };
}
`
    );
    const spawned = spawnSync(process.execPath, ["--require", preload, SCRIPT], {
      cwd: fixture.worktree,
      encoding: "utf-8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: fixture.home,
        USERPROFILE: fixture.home,
        FS_TRACE_LOG: log,
      },
    });
    expect(spawned.status).toBe(0);
    const touched = existsSync(log) ? readFileSync(log, "utf-8").split("\n").filter(Boolean) : [];
    const readsOfDestination = touched.filter((l) => l.endsWith(` ${devEnvPath()}`));
    expect(readsOfDestination, "existing destination must not be opened").toEqual([]);
    expect(readFileSync(devEnvPath(), "utf-8")).toBe("MY_SERVICE_TOKEN=dev-own-value\n");
    resetWorktreeEnv();
  });

  it("does not follow a symlinked destination by default (no read, no write)", () => {
    resetWorktreeEnv();
    resetOutside();
    symlinkSync(join(outside(), "file"), devEnvPath());
    const result = runScript();
    expect(result.status).toBe(0);
    expect(outsideUnchanged()).toBe(true);
    expect(lstatSync(devEnvPath()).isSymbolicLink()).toBe(true);
    expect(`${result.stdout}${result.stderr}`).not.toContain("outside-planted-value");
    resetWorktreeEnv();
  });

  it("does not create the target of a dangling symlinked destination", () => {
    resetWorktreeEnv();
    resetOutside();
    symlinkSync(join(outside(), "not-yet-there"), devEnvPath());
    runScript();
    expect(existsSync(join(outside(), "not-yet-there"))).toBe(false);
    runScript(["--force"]);
    expect(existsSync(join(outside(), "not-yet-there"))).toBe(false);
    resetWorktreeEnv();
  });

  it("--force replaces a symlinked destination itself and leaves the referent byte-identical", () => {
    resetWorktreeEnv();
    resetOutside();
    symlinkSync(join(outside(), "file"), devEnvPath());
    const result = runScript(["--force"]);
    expect(result.status).toBe(0);
    expect(outsideUnchanged()).toBe(true);
    expect(lstatSync(devEnvPath()).isSymbolicLink()).toBe(false);
    expect(keysOf(readFileSync(devEnvPath(), "utf-8"))).toEqual(
      WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key)
    );
    resetWorktreeEnv();
  });

  it("--force does not truncate a file the destination is hard-linked to", () => {
    resetWorktreeEnv();
    resetOutside();
    linkSync(join(outside(), "file"), devEnvPath());
    const result = runScript(["--force"]);
    expect(result.status).toBe(0);
    expect(outsideUnchanged()).toBe(true);
    expect(readFileSync(devEnvPath(), "utf-8")).toContain("NEOTOMA_ENV=development");
    resetWorktreeEnv();
  });

  it.each([[[]], [["--force"]]] as Array<[string[]]>)(
    "rejects a directory at the destination (args: %j) without changing it",
    (args) => {
      resetWorktreeEnv();
      mkdirSync(devEnvPath());
      writeFileSync(join(devEnvPath(), "keep"), "x");
      const result = runScript(args);
      expect(result.status).not.toBe(0);
      expect(lstatSync(devEnvPath()).isDirectory()).toBe(true);
      expect(readFileSync(join(devEnvPath(), "keep"), "utf-8")).toBe("x");
      rmSync(devEnvPath(), { recursive: true, force: true });
    }
  );

  it("leaves no temporary file behind after a forced regeneration", () => {
    resetWorktreeEnv();
    writeFileSync(devEnvPath(), "PORT=1\n");
    expect(runScript(["--force"]).status).toBe(0);
    const leftovers = readdirSync(fixture.worktree).filter(
      (n) => n.startsWith(".env.development") && n !== ".env.development"
    );
    expect(leftovers).toEqual([]);
    resetWorktreeEnv();
  });
});

describe("generated values are validated before writing", () => {
  const LOADER = join(SCRIPTS_DIR, "lib", "neotoma_mcp_source_env.sh");

  /** A Neotoma-shaped checkout whose directory name is `name`. */
  function checkoutNamed(name: string): string {
    const dir = join(fixture.root, "named", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "neotoma" }));
    return dir;
  }

  /** Evaluate the generated file through the shared shell loader the MCP launchers use. */
  function loadThroughShellLoader(dir: string) {
    return spawnSync(
      "/bin/bash",
      [
        "--noprofile",
        "--norc",
        "-c",
        `set -euo pipefail; REPO_ROOT="$1"; source "$2"; printf '%s' "$NEOTOMA_DATA_DIR"`,
        "bash",
        dir,
        LOADER,
      ],
      { cwd: dir, encoding: "utf-8", env: { PATH: "/usr/bin:/bin" } }
    );
  }

  const SHELL_ACTIVE_NAMES: Array<[string, (marker: string) => string]> = [
    ["command substitution", (m) => `evil-$(touch ${m})-x`],
    ["backticks", (m) => `evil-\`touch ${m}\`-x`],
    ["variable expansion", () => "evil-${HOME}-x"],
    ["bare variable", () => "evil-$HOME-x"],
    ["double quote", () => 'evil-"-x'],
    ["single quote", () => "evil-'-x"],
    ["backslash", () => "evil-\\-x"],
    ["newline", () => "evil-\nnewline-x"],
  ];

  it.each(SHELL_ACTIVE_NAMES)(
    "refuses a checkout path containing %s: nothing written, nothing executed",
    (_label, makeName) => {
      const markerDir = join(fixture.root, "markers");
      mkdirSync(markerDir, { recursive: true });
      const marker = join(markerDir, `executed-${Math.random().toString(36).slice(2)}`);
      const dir = checkoutNamed(makeName(marker));

      const result = runScript([], { cwd: dir });
      const output = `${result.stdout}${result.stderr}`;

      if (existsSync(join(dir, ".env.development"))) {
        // Only reachable if the generator wrote it: prove what evaluating it would do.
        loadThroughShellLoader(dir);
      }
      expect(existsSync(marker), "shell-active path text was executed").toBe(false);
      expect(existsSync(join(dir, ".env.development"))).toBe(false);
      expect(result.status).not.toBe(0);
      expect(output).not.toContain("evil-");

      const printed = runScript(["--print"], { cwd: dir });
      expect(printed.status).not.toBe(0);
      expect(printed.stdout).toBe("");
    }
  );

  it("still writes a path with spaces, and the shell loader reads it back literally", () => {
    const dir = checkoutNamed("my repo (copy)-v1.2");
    const parenthesised = runScript([], { cwd: dir });
    // Parentheses are outside the allowed set, so this name is refused.
    expect(parenthesised.status).not.toBe(0);

    const spaced = checkoutNamed("my repo v1.2");
    expect(runScript([], { cwd: spaced }).status).toBe(0);
    const loaded = loadThroughShellLoader(spaced);
    expect(loaded.status, loaded.stderr).toBe(0);
    expect(loaded.stdout).toBe(join(spaced, "data"));
  });
});

describe("worktree dev env allowlist", () => {
  it("contains no credential-named key", () => {
    for (const { key } of WORKTREE_DEV_ENV_ALLOWLIST) {
      expect(key).not.toMatch(CREDENTIAL_KEY_PATTERN);
      expect(key).not.toMatch(CREDENTIAL_NAME);
    }
  });

  it("keeps port and URL defaults equal to the committed .env.example", () => {
    const example = new Map(
      readFileSync(join(REPO_ROOT, ".env.example"), "utf-8")
        .split("\n")
        .map((l) => /^([A-Z_]+)=(.*)$/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2]] as const)
    );
    const generated = new Map(
      buildWorktreeDevEnv("/repo")
        .split("\n")
        .map((l) => /^([A-Z_]+)=(.*)$/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2]] as const)
    );
    for (const key of ["PORT", "HTTP_PORT", "WS_PORT", "VITE_API_BASE_URL"]) {
      expect(generated.get(key), key).toBe(example.get(key));
    }
  });
});
