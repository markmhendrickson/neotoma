import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
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
  it("leaves an existing .env.development untouched and warns about credential-named keys by count only", () => {
    resetWorktreeEnv();
    writeFileSync(devEnvPath(), "MY_SERVICE_TOKEN=dev-own-value\nPORT=4000\n");
    const result = runScript();
    expect(result.status).toBe(0);
    expect(readFileSync(devEnvPath(), "utf-8")).toBe("MY_SERVICE_TOKEN=dev-own-value\nPORT=4000\n");
    expect(`${result.stdout}${result.stderr}`).toMatch(/1 credential-named key/);
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
