/**
 * Test the `--global` flag of `packages/cursor-hooks/scripts/install.mjs`.
 *
 * The script resolves `~/.cursor/hooks.json` via `os.homedir()`. To exercise
 * real filesystem writes without touching the developer's actual home dir, we
 * spawn the script as a child process with HOME pointed at a temp directory.
 *
 * Properties validated:
 * - --global writes to $HOME/.cursor/hooks.json (not to cwd's .cursor/)
 * - the file is created if absent (parent dir created with recursive mkdir)
 * - Neotoma hook entries are inserted under all five expected events
 * - re-running on an existing file with unrelated hooks preserves them
 *   (merge-safe, not destructive)
 * - --uninstall --global removes only Neotoma entries; foreign entries stay
 * - project mode (no --global) writes to <cwd>/.cursor/ instead of HOME
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const INSTALL_SCRIPT = join(
  process.cwd(),
  "packages/cursor-hooks/scripts/install.mjs",
);

function runInstaller(args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const result = spawnSync("node", [INSTALL_SCRIPT, ...args], {
    env: { ...process.env, ...env },
    cwd,
    encoding: "utf-8",
  });
  return result;
}

describe("cursor-hooks --global", () => {
  let tmpHome: string;
  let tmpProject: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "neotoma-cursor-hooks-home-"));
    tmpProject = await mkdtemp(join(tmpdir(), "neotoma-cursor-hooks-proj-"));
  });

  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
    await rm(tmpProject, { recursive: true, force: true });
  });

  it("writes to $HOME/.cursor/hooks.json when --global is set", () => {
    const result = runInstaller(["install", "--global"], { HOME: tmpHome }, tmpProject);
    expect(result.status).toBe(0);

    const globalPath = join(tmpHome, ".cursor", "hooks.json");
    const projectPath = join(tmpProject, ".cursor", "hooks.json");

    expect(existsSync(globalPath)).toBe(true);
    expect(existsSync(projectPath)).toBe(false);
  });

  it("project mode (no --global) writes to cwd/.cursor/hooks.json", () => {
    const result = runInstaller(["install"], { HOME: tmpHome }, tmpProject);
    expect(result.status).toBe(0);

    const projectPath = join(tmpProject, ".cursor", "hooks.json");
    const globalPath = join(tmpHome, ".cursor", "hooks.json");

    expect(existsSync(projectPath)).toBe(true);
    expect(existsSync(globalPath)).toBe(false);
  });

  it("creates ~/.cursor/ directory if it doesn't exist", () => {
    // Sanity: tmpHome is fresh, no .cursor dir yet.
    expect(existsSync(join(tmpHome, ".cursor"))).toBe(false);

    const result = runInstaller(["install", "--global"], { HOME: tmpHome }, tmpProject);
    expect(result.status).toBe(0);
    expect(existsSync(join(tmpHome, ".cursor"))).toBe(true);
    expect(existsSync(join(tmpHome, ".cursor", "hooks.json"))).toBe(true);
  });

  it("inserts entries for all five expected hook events", async () => {
    const result = runInstaller(["install", "--global"], { HOME: tmpHome }, tmpProject);
    expect(result.status).toBe(0);

    const hooks = JSON.parse(
      await readFile(join(tmpHome, ".cursor", "hooks.json"), "utf-8"),
    );

    expect(hooks.version).toBe(1);
    const events = Object.keys(hooks.hooks);
    expect(events).toEqual(
      expect.arrayContaining([
        "sessionStart",
        "beforeSubmitPrompt",
        "postToolUse",
        "postToolUseFailure",
        "stop",
      ]),
    );

    // Every entry must reference a cursor-hooks script.
    for (const entries of Object.values(hooks.hooks) as Array<{ command: string }[]>) {
      for (const e of entries) {
        expect(e.command).toMatch(/cursor-hooks/);
      }
    }
  });

  it("preserves foreign hooks on merge (does not clobber unrelated tools)", async () => {
    // Seed an existing global hooks.json with a third-party hook entry.
    const globalDir = join(tmpHome, ".cursor");
    await mkdir(globalDir, { recursive: true });
    const foreignEntry = { command: "node /some/other/tool/hook.js" };
    await writeFile(
      join(globalDir, "hooks.json"),
      JSON.stringify(
        {
          version: 1,
          hooks: {
            sessionStart: [foreignEntry],
            customEvent: [{ command: "echo unrelated" }],
          },
        },
        null,
        2,
      ),
    );

    const result = runInstaller(["install", "--global"], { HOME: tmpHome }, tmpProject);
    expect(result.status).toBe(0);

    const hooks = JSON.parse(
      await readFile(join(globalDir, "hooks.json"), "utf-8"),
    );

    // Foreign entry under sessionStart must still be present.
    const sessionStart = hooks.hooks.sessionStart as Array<{ command: string }>;
    expect(sessionStart.some((e) => e.command === foreignEntry.command)).toBe(true);

    // Neotoma entry must also be present.
    expect(sessionStart.some((e) => /cursor-hooks/.test(e.command))).toBe(true);

    // Custom non-Neotoma event must be untouched.
    expect(hooks.hooks.customEvent).toEqual([{ command: "echo unrelated" }]);
  });

  it("--uninstall --global removes only Neotoma entries", async () => {
    // Install first.
    const installResult = runInstaller(["install", "--global"], { HOME: tmpHome }, tmpProject);
    expect(installResult.status).toBe(0);

    // Add a foreign entry alongside Neotoma's.
    const hooksPath = join(tmpHome, ".cursor", "hooks.json");
    const existing = JSON.parse(await readFile(hooksPath, "utf-8"));
    existing.hooks.sessionStart.push({ command: "node /other/tool/hook.js" });
    await writeFile(hooksPath, JSON.stringify(existing, null, 2));

    // Uninstall.
    const uninstallResult = runInstaller(
      ["--uninstall", "--global"],
      { HOME: tmpHome },
      tmpProject,
    );
    expect(uninstallResult.status).toBe(0);

    const after = JSON.parse(await readFile(hooksPath, "utf-8"));
    // Foreign hook survives.
    expect(after.hooks.sessionStart).toEqual([{ command: "node /other/tool/hook.js" }]);
    // Neotoma entries are gone from all events.
    for (const entries of Object.values(after.hooks ?? {}) as Array<
      { command: string }[]
    >) {
      for (const e of entries) {
        expect(e.command).not.toMatch(/cursor-hooks/);
      }
    }
  });

  it("re-installing is idempotent (doesn't duplicate Neotoma entries)", async () => {
    runInstaller(["install", "--global"], { HOME: tmpHome }, tmpProject);
    runInstaller(["install", "--global"], { HOME: tmpHome }, tmpProject);

    const hooks = JSON.parse(
      await readFile(join(tmpHome, ".cursor", "hooks.json"), "utf-8"),
    );

    // Each event should have exactly one Neotoma entry.
    for (const [event, entries] of Object.entries(hooks.hooks) as Array<
      [string, { command: string }[]]
    >) {
      const neotomaEntries = entries.filter((e) => /cursor-hooks/.test(e.command));
      expect(neotomaEntries.length).toBe(1);
    }
  });
});
