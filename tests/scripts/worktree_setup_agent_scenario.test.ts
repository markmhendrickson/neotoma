/**
 * Executable agent scenario for the worktree environment rules.
 *
 * `.cursor/rules/worktree_env.mdc` and `.claude/rules/worktree_env.md` are
 * instructions agents act on. This scenario plays an agent that follows them
 * literally in a real linked worktree: it reads the documented commands out of
 * the rule files, runs those exact commands, and asserts the observable
 * outcomes the rules promise (generated keys, exit status, preservation of
 * existing settings, rejection of a wrong directory, no credentials anywhere).
 *
 * It pairs with the Tier 1 fixtures under tests/fixtures/agentic_eval/ the way
 * those pair with their integration tests: the rule text is pinned here, and
 * the behaviour it describes is executed here. If a rule names a command that
 * no longer works, or the command stops doing what the rule says, this fails.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WORKTREE_DEV_ENV_ALLOWLIST } from "../../scripts/lib/worktree_dev_env.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/**
 * Where the scripts and package manifest under test come from. Defaults to this
 * checkout; overridable so the same scenario can be pointed at another tree
 * (for example the pre-change tree, to show it failing).
 */
const SOURCE_ROOT = process.env.WORKTREE_SCENARIO_SOURCE_ROOT
  ? resolve(process.env.WORKTREE_SCENARIO_SOURCE_ROOT)
  : REPO_ROOT;
const FIXTURE_PATH = join(
  REPO_ROOT,
  "tests",
  "fixtures",
  "agentic_eval",
  "worktree_env_setup_rules.json"
);
const RULE_FILES = [".cursor/rules/worktree_env.mdc", ".claude/rules/worktree_env.md"];
const CANARY = "canary-bearer-8f3a1c0d";

const NPM_COMMAND = "npm run setup:worktree-env";
const NODE_COMMAND = "node scripts/write-worktree-dev-env.js";

const keysOf = (content: string) =>
  content
    .split("\n")
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((k): k is string => Boolean(k));

let root: string;
let home: string;
let main: string;
let worktree: string;
const transcript: string[] = [];

function cleanEnv() {
  return { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home };
}

/** Run a documented command string exactly as an agent would, from `cwd`. */
function agentRuns(command: string, cwd: string) {
  const result = spawnSync("sh", ["-c", command], { cwd, encoding: "utf-8", env: cleanEnv() });
  transcript.push(`${result.stdout}${result.stderr}`);
  return result;
}

function git(cwd: string, args: string[]) {
  return execFileSync(
    "git",
    [
      "-c", "user.name=t",
      "-c", "user.email=t@example.invalid",
      "-c", "commit.gpgsign=false",
      "-c", "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd, stdio: "pipe", env: cleanEnv() }
  );
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "worktree-agent-scenario-")));
  home = join(root, "home");
  main = join(root, "main");
  worktree = join(root, "wt");
  mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
  writeFileSync(join(home, ".config", "neotoma", ".env"), `NEOTOMA_BEARER_TOKEN=${CANARY}\n`);

  const repoPackage = JSON.parse(readFileSync(join(SOURCE_ROOT, "package.json"), "utf-8")) as {
    scripts: Record<string, string>;
  };
  mkdirSync(join(main, "scripts", "lib"), { recursive: true });
  writeFileSync(
    join(main, "package.json"),
    JSON.stringify({
      name: "neotoma",
      type: "module",
      scripts: { "setup:worktree-env": repoPackage.scripts["setup:worktree-env"] },
    })
  );
  for (const rel of ["scripts/write-worktree-dev-env.js", "scripts/lib/worktree_dev_env.js"]) {
    if (existsSync(join(SOURCE_ROOT, rel))) copyFileSync(join(SOURCE_ROOT, rel), join(main, rel));
  }
  writeFileSync(join(main, ".gitignore"), ".env\n.env.*\n");
  git(main, ["init", "-q", "-b", "main"]);
  git(main, ["add", "-A"]);
  git(main, ["commit", "-q", "-m", "init"]);
  // A credential-bearing file in the main checkout that must never reach the worktree.
  writeFileSync(join(main, ".env"), `NEOTOMA_BEARER_TOKEN=${CANARY}\n`);
  git(main, ["worktree", "add", "-q", worktree, "-b", "agent-branch"]);
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("agent follows the worktree environment rules", () => {
  it("both rule files document the same commands this scenario runs", () => {
    for (const file of RULE_FILES) {
      const text = readFileSync(join(REPO_ROOT, file), "utf-8");
      expect(text, file).toContain(NPM_COMMAND);
      expect(text, file).toContain(NODE_COMMAND);
      expect(text, file).toContain("--force");
      expect(text, file).toMatch(/never copied/i);
    }
  });

  it("the documented npm command is a real package script that runs the documented node command", () => {
    const pkg = JSON.parse(readFileSync(join(SOURCE_ROOT, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["setup:worktree-env"]).toBe(NODE_COMMAND);
  });

  it("setup: the documented command writes exactly the allowlisted, non-secret keys", () => {
    expect(existsSync(join(worktree, ".env.development"))).toBe(false);
    const result = agentRuns(NPM_COMMAND, worktree);
    expect(result.status, result.stderr).toBe(0);

    const content = readFileSync(join(worktree, ".env.development"), "utf-8");
    expect(keysOf(content)).toEqual(WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key));
    expect(content).toContain(`NEOTOMA_DATA_DIR=${join(worktree, "data")}`);
    for (const key of keysOf(content)) {
      expect(key).not.toMatch(/(TOKEN|SECRET|KEY|MNEMONIC|PASSWORD|PAT|PRIVATE)/i);
    }
  });

  it("repeated invocation: a developer's edit to the generated file is preserved", () => {
    const file = join(worktree, ".env.development");
    writeFileSync(file, "PORT=4000\nMY_OWN_SETTING=kept\n");
    const result = agentRuns(NPM_COMMAND, worktree);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(file, "utf-8")).toBe("PORT=4000\nMY_OWN_SETTING=kept\n");
  });

  it("explicit regeneration: --force restores the allowlisted defaults", () => {
    const result = agentRuns(`${NPM_COMMAND} -- --force`, worktree);
    expect(result.status, result.stderr).toBe(0);
    const content = readFileSync(join(worktree, ".env.development"), "utf-8");
    expect(keysOf(content)).toEqual(WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key));
    expect(content).toContain("PORT=3000");
    expect(content).not.toContain("MY_OWN_SETTING");
  });

  it("invalid directory: the documented node command refuses to write outside a Neotoma checkout", () => {
    const elsewhere = join(root, "not-neotoma");
    mkdirSync(elsewhere, { recursive: true });
    const script = join(worktree, "scripts", "write-worktree-dev-env.js");
    const result = agentRuns(`node ${JSON.stringify(script)}`, elsewhere);
    expect(result.status).not.toBe(0);
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it("no credential from the main checkout or the home directory appears in any file or output", () => {
    const content = readFileSync(join(worktree, ".env.development"), "utf-8");
    expect(content).not.toContain(CANARY);
    for (const output of transcript) expect(output).not.toContain(CANARY);
  });
});

interface FixtureEvent {
  hook: string;
  payload: {
    tool_name?: string;
    tool_input?: { command: string; cwd: string; note?: string };
    tool_output?: { exit_code: number; output: string };
  };
}

/**
 * Replays the shell commands pinned in the Tier 1 fixture
 * tests/fixtures/agentic_eval/worktree_env_setup_rules.json (run by the
 * `agentic_evals` CI lane) against a real linked worktree, and requires the real
 * exit code and output to equal what the fixture says the agent observed. The
 * fixture therefore cannot drift from the behaviour it claims to pin.
 */
describe("Tier 1 fixture worktree_env_setup_rules matches real behaviour", () => {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as { events: FixtureEvent[] };
  const shellEvents = fixture.events.filter(
    (e) => e.hook === "postToolUse" && e.payload.tool_name === "Shell"
  );
  const notACheckout = () => join(root, "not-a-checkout");

  it("pins at least the setup, repeat, regenerate and wrong-directory steps", () => {
    expect(shellEvents.length).toBeGreaterThanOrEqual(4);
  });

  it("every pinned command produces the pinned exit code and output", () => {
    // Start from a clean slate so the first command is a genuine first setup.
    rmSync(join(worktree, ".env.development"), { force: true });
    mkdirSync(notACheckout(), { recursive: true });
    const substitute = (text: string) =>
      text.split("<WORKTREE>").join(worktree).split("<NOT_A_CHECKOUT>").join(notACheckout());

    for (const event of shellEvents) {
      const input = event.payload.tool_input!;
      const pinned = event.payload.tool_output!;
      const isRepeat = /repeat/i.test(input.note ?? "");
      if (isRepeat) writeFileSync(join(worktree, ".env.development"), "PORT=4000\n");

      const result = agentRuns(substitute(input.command), substitute(input.cwd));
      const observed = `${result.stdout}${result.stderr}`
        .split("\n")
        .filter((line) => line.startsWith("[worktree-env]"))
        .join("\n")
        .split(worktree)
        .join("<WORKTREE>");

      expect(result.status, input.command).toBe(pinned.exit_code);
      expect(observed, input.command).toBe(pinned.output);
      if (isRepeat) {
        expect(readFileSync(join(worktree, ".env.development"), "utf-8")).toBe("PORT=4000\n");
      }
    }
    expect(readdirSync(notACheckout())).toEqual([]);
  });

  it("the fixture's final state holds only allowlisted keys and no canary", () => {
    const content = readFileSync(join(worktree, ".env.development"), "utf-8");
    expect(keysOf(content)).toEqual(WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key));
    expect(JSON.stringify(fixture)).not.toContain(CANARY);
  });
});
