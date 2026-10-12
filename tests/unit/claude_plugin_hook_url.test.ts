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

function probe(vars: Vars, opts: { blockIdna?: boolean } = {}): Probe {
  // blockIdna exercises the stdlib IDNA fallback used when the idna package
  // (an httpx dependency) is not importable.
  const script = opts.blockIdna ? `import sys\nsys.modules["idna"] = None\n${PROBE}` : PROBE;
  return JSON.parse(runPython(["-c", script], vars)) as Probe;
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

  // The transport (httpx) maps Unicode full stops and IDNA forms to the ASCII
  // host, so the guard must too, or the sandbox check is bypassed.
  const IDEOGRAPHIC = "\u3002";
  const FULLWIDTH = "\uff0e";
  const HALFWIDTH = "\uff61";
  const separatorVariants = (host: string): string[] => {
    const labels = host.split(".");
    return [
      ...[IDEOGRAPHIC, FULLWIDTH, HALFWIDTH].map((sep) => `https://${labels.join(sep)}/mcp`),
      `https://${labels[0]}${IDEOGRAPHIC}${labels.slice(1).join(FULLWIDTH)}/mcp`,
      `https://${labels.join(HALFWIDTH)}${IDEOGRAPHIC}/mcp`,
      `https://${labels.join(".")}${FULLWIDTH}/mcp`,
    ];
  };
  const fullwidthUpper = (s: string): string =>
    [...s.toUpperCase()]
      .map((ch) => (/[A-Z]/.test(ch) ? String.fromCharCode(ch.charCodeAt(0) + 0xfee0) : ch))
      .join("");
  const UNICODE_SANDBOX_URLS = ["sandbox.neotoma.io", "neotoma-sandbox.fly.dev"].flatMap((host) => [
    ...separatorVariants(host),
    `https://${fullwidthUpper(host.split(".")[0])}${IDEOGRAPHIC}${host.split(".").slice(1).join(FULLWIDTH)}/mcp`,
    // Full-width letters and a soft hyphen: httpx refuses these, but the
    // guard still recognises the sandbox (stricter than the client is safe).
    `https://${fullwidthUpper(host)}/mcp`,
    `https://${host.slice(0, 3)}\u00ad${host.slice(3)}/mcp`,
  ]);

  it.each(UNICODE_SANDBOX_URLS)(
    "treats Unicode-separator form %s as the sandbox: capture off, visible notice",
    (url) => {
      const r = probe({ CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: url });
      expect(r.capture).toBe(false);
      expect(r.status).toMatch(/public sandbox.*capture is off/);
    }
  );

  it.each(UNICODE_SANDBOX_URLS)(
    "the same with the idna package unavailable (stdlib IDNA fallback): %s",
    (url) => {
      const r = probe({ CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: url }, { blockIdna: true });
      expect(r.capture).toBe(false);
      expect(r.status).toMatch(/public sandbox.*capture is off/);
    }
  );

  it("fails closed: a host that cannot be read turns capture off", () => {
    for (const url of [`https://\u00e4${"a".repeat(70)}.example/mcp`, "https://:3080/mcp"]) {
      for (const blockIdna of [false, true]) {
        const r = probe({ CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: url }, { blockIdna });
        expect(r.capture).toBe(false);
        expect(r.status).toMatch(/could not read the host.*capture is off/);
      }
    }
  });

  it("whenever capture is on, the httpx transport is not sending to the sandbox", () => {
    // Ties the guard to the client: any spelling httpx maps to a sandbox host
    // must turn capture off, including spellings added in future httpx/idna.
    const urls = [
      ...UNICODE_SANDBOX_URLS,
      "https://SANDBOX.neotoma.io./mcp",
      "https://sandbox%2Eneotoma.io/mcp",
      "https://u:p@sandbox.neotoma.io:443/mcp",
      "https://mine.example/mcp",
      "http://neotoma_api:3080/mcp",
      "http://127.0.0.1:3080/mcp",
      "https://[::1]:3080/mcp",
    ];
    const out = runPython(
      [
        "-c",
        `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(HOOKS_DIR)})
import httpx, importlib
res = []
for u in json.loads(sys.argv[1]):
    os.environ["CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL"] = u
    import _common as c
    c = importlib.reload(c)
    try:
        t = httpx.URL(c.NEOTOMA_BASE_URL).host.lower().rstrip(".")
    except Exception:
        t = None
    res.append([u, c.capture_enabled(), t])
print(json.dumps(res))
`,
        JSON.stringify(urls),
      ],
      {}
    );
    const rows = JSON.parse(out) as Array<[string, boolean, string | null]>;
    const SANDBOX_HOSTS = ["sandbox.neotoma.io", "neotoma-sandbox.fly.dev"];
    for (const [url, capture, transport] of rows) {
      if (capture)
        expect({ url, transport: SANDBOX_HOSTS.includes(transport ?? "") }).toEqual({
          url,
          transport: false,
        });
    }
    // Positive control: the probe really resolves hosts, and plain hosts capture.
    expect(rows.filter(([, c]) => c).map(([u]) => u)).toEqual([
      "https://sandbox%2Eneotoma.io/mcp",
      "https://mine.example/mcp",
      "http://neotoma_api:3080/mcp",
      "http://127.0.0.1:3080/mcp",
      "https://[::1]:3080/mcp",
    ]);
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

  it("loopback hosts, IPv6 included, still count as local and get the token", () => {
    for (const url of [
      "http://127.0.0.1:3080/mcp",
      "http://[::1]:3080/mcp",
      "http://localhost:3080/mcp",
    ]) {
      const r = probe({
        ...IN_PLUGIN,
        CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: url,
        NEOTOMA_TOKEN: "tok",
      });
      expect({ url, capture: r.capture, token: r.token }).toEqual({
        url,
        capture: true,
        token: "tok",
      });
    }
  });

  it("never pairs the token with a URL whose host cannot be read", () => {
    const r = probe({
      ...IN_PLUGIN,
      CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL: "https://:443/mcp",
      NEOTOMA_BASE_URL: "https://:443",
      NEOTOMA_TOKEN: "tok",
    });
    expect(r.token).toBeNull();
    expect(r.capture).toBe(false);
  });

  it("does not send the token to a Unicode spelling of the sandbox", () => {
    const url = "https://sandbox\u3002neotoma\u3002io";
    const r = probe({ NEOTOMA_BASE_URL: url, NEOTOMA_TOKEN: "tok" });
    expect(r.capture).toBe(false);
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
