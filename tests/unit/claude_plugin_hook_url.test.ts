/**
 * The Claude plugin's hooks and its bundled MCP connector must talk to the
 * same Neotoma. The connector URL is `${user_config.neotoma_mcp_url}` (plugin
 * option, else the plugin.json default); the hooks resolve their URL in
 * packages/claude-code-plugin/hooks/_common.py.
 *
 * Precedence for the hooks: plugin option > NEOTOMA_BASE_URL (only when
 * explicitly set and not running as the installed plugin) > plugin.json
 * default. Never a localhost default.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const PLUGIN_DIR = join(REPO_ROOT, "packages", "claude-code-plugin");
const HOOKS_DIR = join(PLUGIN_DIR, "hooks");
const MANIFEST = JSON.parse(
  readFileSync(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf-8")
) as {
  userConfig: { neotoma_mcp_url: { default: string } };
  mcpServers: { neotoma: { url: string } };
};
const DEFAULT_MCP_URL = MANIFEST.userConfig.neotoma_mcp_url.default;

const PROBE = `
import json, sys
sys.path.insert(0, ${JSON.stringify(HOOKS_DIR)})
import _common as c
print(json.dumps({
  "base": c.NEOTOMA_BASE_URL,
  "source": c.NEOTOMA_URL_SOURCE,
  "fallback_default": c._FALLBACK_DEFAULT_MCP_URL,
  "client_is_none": c.get_client() is None,
}))
`;

type Probe = {
  base: string;
  source: string;
  fallback_default: string;
  client_is_none: boolean;
};

function runHooksResolver(vars: Record<string, string | undefined>): Probe {
  const state = mkdtempSync(join(tmpdir(), "neotoma-plugin-url-"));
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: state,
    NEOTOMA_HOOK_STATE_DIR: state,
    NEOTOMA_LOG_LEVEL: "silent",
  };
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) env[k] = v;
  const res = spawnSync(process.env.NEOTOMA_EVAL_PYTHON ?? "python3", ["-c", PROBE], {
    env,
    encoding: "utf-8",
    timeout: 15_000,
  });
  if (res.status !== 0) throw new Error(`python probe failed: ${res.stderr}`);
  return JSON.parse(res.stdout.trim()) as Probe;
}

/** What Claude Code gives the connector: `${user_config.neotoma_mcp_url}`, defaulted. */
function connectorUrl(option: string | undefined): string {
  expect(MANIFEST.mcpServers.neotoma.url).toBe("${user_config.neotoma_mcp_url}");
  return option && option.trim() ? option.trim() : DEFAULT_MCP_URL;
}

function normalize(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");
}

const PLUGIN_ROOT = { CLAUDE_PLUGIN_ROOT: PLUGIN_DIR };

describe("Claude plugin hooks: Neotoma URL precedence", () => {
  it("prefers the plugin option over NEOTOMA_BASE_URL", () => {
    const r = runHooksResolver({
      ...PLUGIN_ROOT,
      CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "https://mine.example/mcp",
      NEOTOMA_BASE_URL: "http://127.0.0.1:3080",
    });
    expect(r).toMatchObject({ base: "https://mine.example", source: "plugin_option" });
  });

  it("uses an explicit NEOTOMA_BASE_URL only outside the installed plugin", () => {
    const standalone = runHooksResolver({ NEOTOMA_BASE_URL: "http://127.0.0.1:3080" });
    expect(standalone).toMatchObject({ base: "http://127.0.0.1:3080", source: "env" });

    const inPlugin = runHooksResolver({
      ...PLUGIN_ROOT,
      NEOTOMA_BASE_URL: "http://127.0.0.1:3080",
    });
    expect(inPlugin).toMatchObject({
      base: normalize(DEFAULT_MCP_URL),
      source: "plugin_default",
    });
  });

  it("falls back to the plugin.json default, never localhost", () => {
    for (const vars of [
      {},
      PLUGIN_ROOT,
      { NEOTOMA_BASE_URL: "", CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: " " },
    ]) {
      const r = runHooksResolver(vars);
      expect(r.source).toBe("plugin_default");
      expect(r.base).toBe(normalize(DEFAULT_MCP_URL));
      expect(r.base).not.toMatch(/127\.0\.0\.1|localhost/);
    }
  });

  it("keeps the hard-coded fallback equal to the manifest default", () => {
    expect(runHooksResolver({}).fallback_default).toBe(DEFAULT_MCP_URL);
  });
});

describe("Claude plugin hooks and connector never split", () => {
  const options = [undefined, "", "http://127.0.0.1:3080/mcp", "https://mine.example/mcp/"];
  const envBases = [undefined, "http://127.0.0.1:3080", "https://other.example"];

  for (const option of options) {
    for (const envBase of envBases) {
      it(`option=${JSON.stringify(option)} NEOTOMA_BASE_URL=${JSON.stringify(envBase)}`, () => {
        const r = runHooksResolver({
          ...PLUGIN_ROOT,
          CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: option,
          NEOTOMA_BASE_URL: envBase,
        });
        expect(r.base).toBe(normalize(connectorUrl(option)));
      });
    }
  }
});

describe("Claude plugin hooks never capture into the public sandbox", () => {
  it("skips the client when the resolved Neotoma is the public sandbox", () => {
    expect(new URL(DEFAULT_MCP_URL).hostname).toBe("sandbox.neotoma.io");
    expect(runHooksResolver(PLUGIN_ROOT).client_is_none).toBe(true);
  });

  it("builds a client for any other Neotoma", () => {
    const r = runHooksResolver({
      ...PLUGIN_ROOT,
      CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "http://127.0.0.1:9/mcp",
    });
    expect(r.base).toBe("http://127.0.0.1:9");
    expect(r.client_is_none).toBe(false);
  });
});
