/**
 * CLI installs of the Claude plugin must point it at the user's own Neotoma,
 * never leave it on the public-sandbox default, and leave Claude Code with
 * exactly one Neotoma connector.
 *
 * Covers `neotoma hooks install --tool claude-code` (also what `neotoma setup`
 * calls): a fresh install, a re-run on an existing install (the upgrade path
 * for plugin 0.1.x), a user who already has their own Neotoma MCP entry, a dry
 * run, and a failed configure. `claude` is never actually spawned.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnCalls: Array<{ cmd: string; args: string[]; input?: string }> = [];
let configureStatus = 0;

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn((cmd: string, args: string[], opts?: { input?: string }) => {
      spawnCalls.push({ cmd, args, input: opts?.input });
      const isConfigure = cmd === "claude" && args[0] === "plugin" && args[1] === "configure";
      return { status: isConfigure ? configureStatus : 0, stdout: "", stderr: "" };
    }),
  };
});

import {
  CLAUDE_PLUGIN_BUNDLED_SERVER,
  configureClaudePluginConnector,
  mergeDisabledMcpServers,
  resolveClaudePluginMcpUrl,
} from "../../src/cli/claude_plugin_connector.js";
import type { DoctorReport } from "../../src/cli/doctor.js";
import { doInstallForTest } from "../../src/cli/hooks.js";

const SPEC = "neotoma@neotoma-marketplace";

function fakeReport(opts: {
  present: boolean;
  ownMcp: boolean;
  apiBaseUrl?: string | null;
}): DoctorReport {
  return {
    data: { initialized: true },
    api: { base_url: opts.apiBaseUrl ?? null },
    mcp_servers_detected: opts.ownMcp
      ? { claude_code: { path: "/x/.claude.json", has_neotoma: true, has_neotoma_dev: false } }
      : {},
    hooks: {
      installed: {
        "claude-code": { present: opts.present, path: "plugin", other_hook_plugins: [] },
      },
    },
  } as unknown as DoctorReport;
}

function configureCall() {
  return spawnCalls.find((c) => c.args[0] === "plugin" && c.args[1] === "configure");
}

describe("resolveClaudePluginMcpUrl", () => {
  it("prefers NEOTOMA_BASE_URL, then the CLI config, then the running API, then localhost", () => {
    expect(
      resolveClaudePluginMcpUrl({
        envBaseUrl: "http://127.0.0.1:3180/",
        configBaseUrl: "http://a",
        apiBaseUrl: "http://b",
      })
    ).toBe("http://127.0.0.1:3180/mcp");
    expect(
      resolveClaudePluginMcpUrl({ envBaseUrl: " ", configBaseUrl: "https://mine.example/mcp" })
    ).toBe("https://mine.example/mcp");
    expect(resolveClaudePluginMcpUrl({ apiBaseUrl: "http://127.0.0.1:3080" })).toBe(
      "http://127.0.0.1:3080/mcp"
    );
    expect(resolveClaudePluginMcpUrl({})).toBe("http://127.0.0.1:3080/mcp");
  });
});

describe("mergeDisabledMcpServers", () => {
  it("adds the bundled server and keeps every other key", () => {
    const merged = mergeDisabledMcpServers(
      JSON.stringify({ permissions: { allow: ["x"] }, disabledMcpServers: ["other"] }),
      CLAUDE_PLUGIN_BUNDLED_SERVER
    );
    expect(merged?.changed).toBe(true);
    expect(JSON.parse(merged!.after)).toEqual({
      permissions: { allow: ["x"] },
      disabledMcpServers: ["other", CLAUDE_PLUGIN_BUNDLED_SERVER],
    });
  });

  it("is idempotent, creates the file when absent, and refuses invalid JSON", () => {
    const once = mergeDisabledMcpServers(null, CLAUDE_PLUGIN_BUNDLED_SERVER)!;
    expect(JSON.parse(once.after)).toEqual({ disabledMcpServers: [CLAUDE_PLUGIN_BUNDLED_SERVER] });
    expect(mergeDisabledMcpServers(once.after, CLAUDE_PLUGIN_BUNDLED_SERVER)?.changed).toBe(false);
    expect(mergeDisabledMcpServers("{not json", CLAUDE_PLUGIN_BUNDLED_SERVER)).toBeNull();
  });
});

describe("configureClaudePluginConnector", () => {
  let settingsPath: string;
  beforeEach(() => {
    spawnCalls.length = 0;
    configureStatus = 0;
    settingsPath = join(mkdtempSync(join(tmpdir(), "neotoma-claude-settings-")), "settings.json");
  });

  it("does not overwrite an unparseable settings file, and says so", async () => {
    writeFileSync(settingsPath, "{not json");
    const r = await configureClaudePluginConnector(
      { installSpec: SPEC, urlInputs: {}, hasOwnNeotomaMcp: true },
      { settingsPath }
    );
    expect(r.ok).toBe(true);
    expect(r.disabledBundled).toBe(false);
    expect(readFileSync(settingsPath, "utf-8")).toBe("{not json");
    expect(r.message).toContain("NOT turned off");
  });

  it("reports the exact manual command when configure fails", async () => {
    configureStatus = 1;
    const r = await configureClaudePluginConnector(
      { installSpec: SPEC, urlInputs: {}, hasOwnNeotomaMcp: false },
      { settingsPath }
    );
    expect(r.ok).toBe(false);
    expect(r.message).toContain(`claude plugin configure ${SPEC} --values-stdin`);
    expect(r.message).toContain("http://127.0.0.1:3080/mcp");
  });
});

describe("neotoma hooks install --tool claude-code", () => {
  let home: string;
  const prevHome = process.env.HOME;
  const prevBase = process.env.NEOTOMA_BASE_URL;

  beforeEach(() => {
    spawnCalls.length = 0;
    configureStatus = 0;
    home = mkdtempSync(join(tmpdir(), "neotoma-claude-home-"));
    process.env.HOME = home;
    delete process.env.NEOTOMA_BASE_URL;
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevBase === undefined) delete process.env.NEOTOMA_BASE_URL;
    else process.env.NEOTOMA_BASE_URL = prevBase;
  });

  function settings(): Record<string, unknown> | null {
    try {
      return JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    } catch {
      return null;
    }
  }

  it("fresh install sets the plugin URL to the user's Neotoma, not the sandbox", async () => {
    const res = await doInstallForTest(
      { tool: "claude-code", yes: true },
      fakeReport({ present: false, ownMcp: false, apiBaseUrl: "http://127.0.0.1:3080" })
    );
    expect(res.ok).toBe(true);
    const install = spawnCalls.find((c) => c.args[0] === "plugin" && c.args[1] === "install");
    expect(install?.args).toContain(SPEC);
    const configure = configureCall();
    expect(configure?.args).toEqual(["plugin", "configure", SPEC, "--values-stdin"]);
    expect(JSON.parse(configure!.input!)).toEqual({ neotoma_mcp_url: "http://127.0.0.1:3080/mcp" });
    expect(configure!.input).not.toContain("sandbox");
    // No own MCP entry: the bundled connector is the one connector; leave it on.
    expect(settings()).toBeNull();
  });

  it("with the user's own Neotoma MCP entry (what `neotoma setup` writes), turns off the duplicate bundled connector", async () => {
    const res = await doInstallForTest(
      { tool: "claude-code", yes: true },
      fakeReport({ present: false, ownMcp: true })
    );
    expect(res.ok).toBe(true);
    expect(configureCall()).toBeDefined();
    expect(settings()).toEqual({ disabledMcpServers: [CLAUDE_PLUGIN_BUNDLED_SERVER] });
    expect(res.message).toContain("turned off");
  });

  it("upgrade from 0.1.x: re-running on an existing install still points the plugin at the user's Neotoma", async () => {
    process.env.NEOTOMA_BASE_URL = "http://127.0.0.1:3180";
    const res = await doInstallForTest(
      { tool: "claude-code", yes: true },
      fakeReport({ present: true, ownMcp: true })
    );
    expect(res.ok).toBe(true);
    expect(res.message).toContain("already installed");
    // No reinstall, but the option and the duplicate are fixed.
    expect(spawnCalls.find((c) => c.args[1] === "install")).toBeUndefined();
    expect(JSON.parse(configureCall()!.input!)).toEqual({
      neotoma_mcp_url: "http://127.0.0.1:3180/mcp",
    });
    expect(settings()).toEqual({ disabledMcpServers: [CLAUDE_PLUGIN_BUNDLED_SERVER] });
  });

  it("dry run spawns nothing and writes nothing, but says what it would set", async () => {
    const res = await doInstallForTest(
      { tool: "claude-code", yes: true, dryRun: true },
      fakeReport({ present: false, ownMcp: true })
    );
    expect(spawnCalls).toHaveLength(0);
    expect(settings()).toBeNull();
    expect(res.message).toContain("neotoma_mcp_url=http://127.0.0.1:3080/mcp");
    expect(res.message).toContain(CLAUDE_PLUGIN_BUNDLED_SERVER);
  });

  it("a failed configure fails the install instead of leaving the sandbox default silently", async () => {
    configureStatus = 1;
    const res = await doInstallForTest(
      { tool: "claude-code", yes: true },
      fakeReport({ present: false, ownMcp: false })
    );
    expect(res.ok).toBe(false);
    expect(res.message).toContain("--values-stdin");
  });
});
