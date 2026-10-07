/**
 * Which Neotoma the Claude plugin's hooks use, and how that relates to the
 * plugin's bundled MCP connector (`${user_config.neotoma_mcp_url}`, defaulting
 * to the public sandbox). Runs the real packages/claude-code-plugin/hooks code
 * under Python with a controlled environment.
 *
 * Hook precedence: plugin option (non-default) > explicit NEOTOMA_BASE_URL >
 * existing Neotoma CLI config (its base_url, else the 0.1.x localhost default)
 * > plugin default (sandbox). The hooks never capture into the sandbox, and
 * whenever they and the connector differ the user is told at SessionStart.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const PYTHON = process.env.NEOTOMA_EVAL_PYTHON ?? "python3";

const PROBE = `
import json, sys
sys.path.insert(0, ${JSON.stringify(HOOKS_DIR)})
import _common as c
print(json.dumps({
  "base": c.NEOTOMA_BASE_URL,
  "source": c.NEOTOMA_URL_SOURCE,
  "connector": c.connector_mcp_url(),
  "status": c.status_message(),
  "token": c.NEOTOMA_TOKEN,
  "fallback_default": c._FALLBACK_DEFAULT_MCP_URL,
  "capture": c.capture_enabled(),
}))
`;

type Probe = {
  base: string;
  source: string;
  connector: string;
  status: string | null;
  token: string | null;
  fallback_default: string;
  capture: boolean;
};

type Vars = Record<string, string | undefined>;

function freshHome(cliConfig?: Record<string, unknown>): string {
  const home = mkdtempSync(join(tmpdir(), "neotoma-plugin-home-"));
  if (cliConfig) {
    mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
    writeFileSync(join(home, ".config", "neotoma", "config.json"), JSON.stringify(cliConfig));
  }
  return home;
}

function runPython(args: string[], vars: Vars, input = ""): string {
  const home = vars.HOME ?? freshHome();
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    NEOTOMA_HOOK_STATE_DIR: home,
    NEOTOMA_LOG_LEVEL: "silent",
  };
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) env[k] = v;
  const res = spawnSync(PYTHON, args, { env, input, encoding: "utf-8", timeout: 15_000 });
  if (res.status !== 0) throw new Error(`python failed: ${res.stderr}`);
  return res.stdout.trim();
}

function probe(vars: Vars): Probe {
  return JSON.parse(runPython(["-c", PROBE], vars)) as Probe;
}

function normalize(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");
}

const IN_PLUGIN = { CLAUDE_PLUGIN_ROOT: PLUGIN_DIR };

describe("Claude plugin hooks: Neotoma URL precedence", () => {
  it("a non-default plugin option wins over NEOTOMA_BASE_URL and a local CLI config", () => {
    const r = probe({
      ...IN_PLUGIN,
      HOME: freshHome({ base_url: "http://127.0.0.1:3180" }),
      CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "https://mine.example/mcp",
      NEOTOMA_BASE_URL: "http://127.0.0.1:3080",
    });
    expect(r).toMatchObject({ base: "https://mine.example", source: "plugin_option" });
    expect(r.status).toBeNull();
  });

  it("an explicit NEOTOMA_BASE_URL is honoured when the option is unset or the default", () => {
    for (const option of [undefined, "", DEFAULT_MCP_URL]) {
      const r = probe({
        ...IN_PLUGIN,
        CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: option,
        NEOTOMA_BASE_URL: "http://127.0.0.1:3080",
      });
      expect(r).toMatchObject({ base: "http://127.0.0.1:3080", source: "env" });
      expect(r.capture).toBe(true);
    }
  });

  it("upgrade from 0.1.x: an existing local CLI config keeps capture local, not the sandbox", () => {
    // 0.1.x hooks always used http://127.0.0.1:3080; a user with `neotoma init`
    // done and no env set relied on that.
    const legacy = probe({ ...IN_PLUGIN, HOME: freshHome({}) });
    expect(legacy).toMatchObject({ base: "http://127.0.0.1:3080", source: "local_config" });
    expect(legacy.capture).toBe(true);

    const configured = probe({
      ...IN_PLUGIN,
      HOME: freshHome({ base_url: "http://127.0.0.1:3180/" }),
    });
    expect(configured).toMatchObject({ base: "http://127.0.0.1:3180", source: "local_config" });
  });

  it("with nothing configured, uses the plugin default (the sandbox), never localhost", () => {
    for (const vars of [
      {},
      IN_PLUGIN,
      { CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "  ", NEOTOMA_BASE_URL: "" },
    ]) {
      const r = probe(vars);
      expect(r.source).toBe("plugin_default");
      expect(r.base).toBe(normalize(DEFAULT_MCP_URL));
      expect(r.base).not.toMatch(/127\.0\.0\.1|localhost/);
    }
  });

  it("keeps the hard-coded fallback equal to the manifest default", () => {
    expect(probe({}).fallback_default).toBe(DEFAULT_MCP_URL);
  });
});

describe("Claude plugin hooks and connector never split silently", () => {
  const options = [
    undefined,
    "",
    DEFAULT_MCP_URL,
    "http://127.0.0.1:3080/mcp",
    "https://mine.example/mcp/",
  ];
  const envBases = [undefined, "http://127.0.0.1:3080", "https://other.example"];
  const homes: Array<[string, Record<string, unknown> | undefined]> = [
    ["no local config", undefined],
    ["local CLI config", {}],
  ];

  for (const option of options) {
    for (const envBase of envBases) {
      for (const [homeLabel, cliConfig] of homes) {
        it(`option=${JSON.stringify(option)} NEOTOMA_BASE_URL=${JSON.stringify(envBase)} ${homeLabel}`, () => {
          const r = probe({
            ...IN_PLUGIN,
            HOME: freshHome(cliConfig),
            CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: option,
            NEOTOMA_BASE_URL: envBase,
          });
          // What Claude Code gives the connector: the option, else the default.
          expect(MANIFEST.mcpServers.neotoma.url).toBe("${user_config.neotoma_mcp_url}");
          const connector = option && option.trim() ? option.trim() : DEFAULT_MCP_URL;
          expect(r.connector).toBe(connector);
          if (r.base === normalize(connector)) {
            // Same Neotoma. The only notice allowed is the sandbox one.
            if (r.status) expect(r.status).toMatch(/public sandbox.*capture is off/);
          } else {
            // Different Neotomas: only for an existing local setup, and the user
            // is told, naming both URLs and the command that reconciles them.
            expect(["env", "local_config"]).toContain(r.source);
            expect(r.status).toContain(r.base);
            expect(r.status).toContain(connector);
            expect(r.status).toContain("neotoma hooks install --tool claude-code");
          }
        });
      }
    }
  }
});

describe("Claude plugin hooks never capture into the public sandbox", () => {
  it.each([
    "https://sandbox.neotoma.io/mcp",
    "https://SANDBOX.neotoma.io/MCP",
    "https://sandbox.neotoma.io./mcp",
    "sandbox.neotoma.io/mcp",
    "https://sandbox.neotoma.io:443/mcp",
    "https://neotoma-sandbox.fly.dev/mcp",
  ])("treats %s as the sandbox: capture off, visible notice", (url) => {
    const r = probe({ CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: url });
    expect(r.capture).toBe(false);
    expect(r.status).toMatch(/public sandbox.*capture is off/);
  });

  it("captures for any other Neotoma", () => {
    const r = probe({
      ...IN_PLUGIN,
      CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "http://127.0.0.1:9/mcp",
    });
    expect(r.base).toBe("http://127.0.0.1:9");
    expect(r.capture).toBe(true);
  });

  it("SessionStart shows the capture-off notice to the user at the default log level", () => {
    const out = runPython(
      [join(HOOKS_DIR, "session_start.py")],
      { ...IN_PLUGIN, NEOTOMA_LOG_LEVEL: "warn" },
      "{}"
    );
    const parsed = JSON.parse(out) as {
      systemMessage?: string;
      hookSpecificOutput?: { additionalContext?: string };
    };
    expect(parsed.systemMessage).toMatch(/public sandbox.*capture is off/);
    expect(parsed.hookSpecificOutput?.additionalContext).toBe(parsed.systemMessage);
  });

  it("SessionStart shows the split notice on an upgraded install with a local config", () => {
    const out = runPython(
      [join(HOOKS_DIR, "session_start.py")],
      // Port 9 (discard): nothing listens, so the hook's writes fail fast and
      // best-effort; only the notice matters here.
      { ...IN_PLUGIN, HOME: freshHome({ base_url: "http://127.0.0.1:9" }) },
      "{}"
    );
    const parsed = JSON.parse(out) as { systemMessage?: string };
    expect(parsed.systemMessage).toContain("http://127.0.0.1:9");
    expect(parsed.systemMessage).toContain(DEFAULT_MCP_URL);
  });
});

describe("Claude plugin hooks send NEOTOMA_TOKEN only to its own Neotoma", () => {
  it("sends it when the hooks use NEOTOMA_BASE_URL's origin", () => {
    const r = probe({ NEOTOMA_BASE_URL: "https://mine.example/", NEOTOMA_TOKEN: "tok" });
    expect(r.token).toBe("tok");
  });

  it("withholds it when the option points at a different host", () => {
    const r = probe({
      ...IN_PLUGIN,
      CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "https://other.example/mcp",
      NEOTOMA_BASE_URL: "https://mine.example",
      NEOTOMA_TOKEN: "tok",
    });
    expect(r.base).toBe("https://other.example");
    expect(r.token).toBeNull();
  });

  it("never sends it over plain http to a non-local host", () => {
    const r = probe({ NEOTOMA_BASE_URL: "http://mine.example", NEOTOMA_TOKEN: "tok" });
    expect(r.token).toBeNull();
  });

  it("without NEOTOMA_BASE_URL, sends it only to a loopback server", () => {
    expect(
      probe({
        ...IN_PLUGIN,
        CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "http://127.0.0.1:3080/mcp",
        NEOTOMA_TOKEN: "tok",
      }).token
    ).toBe("tok");
    expect(
      probe({
        ...IN_PLUGIN,
        CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "https://mine.example/mcp",
        NEOTOMA_TOKEN: "tok",
      }).token
    ).toBeNull();
  });
});
