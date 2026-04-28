/**
 * Harness config snippet builders for the MCP root landing page.
 *
 * @remarks
 * These templates duplicate the shapes of `SITE_CODE_SNIPPETS` in
 * `frontend/src/site/site_data.ts`. Duplication is intentional: the marketing
 * SPA and the server bundle don't share a module path today, and splitting a
 * shared package is out of scope. See
 * `tests/unit/root_landing_harness_snippets.test.ts` for snapshot coverage.
 *
 * When updating the marketing snippets, update these too.
 */

export type LandingMode = "sandbox" | "personal" | "prod" | "local";
export type HarnessId =
  | "claude-code"
  | "claude-desktop"
  | "chatgpt"
  | "codex"
  | "cursor"
  | "openclaw";
export type HarnessFlow = "agent" | "human";

/** Generic placeholder when install root cannot be resolved (e.g. minimal container). */
export const PLACEHOLDER_STDIO_MCP_SCRIPT =
  "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh";

export interface HarnessSnippetContext {
  /** Absolute MCP URL for this instance, e.g. `https://sandbox.neotoma.io/mcp`. */
  mcpUrl: string;
  /** Absolute base URL for this instance (no trailing slash), e.g. `https://sandbox.neotoma.io`. */
  base: string;
  mode: LandingMode;
  /** Public docs URL, e.g. `https://neotoma.io`. */
  publicDocsUrl: string;
  /**
   * Absolute path to `scripts/run_neotoma_mcp_stdio.sh` when known (repo root
   * from `config.projectRoot` at render time). Omitted or null falls back to
   * {@link PLACEHOLDER_STDIO_MCP_SCRIPT}.
   */
  stdioMcpScriptPath?: string | null;
  /** Active sandbox session bearer token (if available via cookie). */
  sessionBearer?: string | null;
}

function resolvedStdioScript(ctx: HarnessSnippetContext): string {
  const p = ctx.stdioMcpScriptPath?.trim();
  return p && p.length > 0 ? p : PLACEHOLDER_STDIO_MCP_SCRIPT;
}

export interface HarnessDescriptor {
  id: HarnessId;
  label: string;
  description: string;
  docsPath: string;
  /** Optional permissions preflight snippet rendered above the human flow. */
  preflight?: { title: string; code: string; format: string };
}

export interface HarnessSnippetResult {
  id: HarnessId;
  label: string;
  description: string;
  /** Absolute URL to the per-harness docs page on `publicDocsUrl`. */
  docsUrl: string;
  agentPrompt: string;
  human: { format: string; code: string };
  preflight?: { title: string; code: string; format: string };
}

const HARNESS_META: Record<HarnessId, Omit<HarnessDescriptor, "preflight">> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    description: "CLI agent from Anthropic. Register via `claude mcp add`.",
    docsPath: "/neotoma-with-claude-code",
  },
  "claude-desktop": {
    id: "claude-desktop",
    label: "Claude Desktop",
    description: "Anthropic desktop app. Edit claude_desktop_config.json.",
    docsPath: "/neotoma-with-claude-connect-desktop",
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    description: "OpenAI ChatGPT developer mode. Add as remote MCP server.",
    docsPath: "/neotoma-with-chatgpt-connect-remote-mcp",
  },
  codex: {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex CLI. Add `[mcp_servers.neotoma]` to config.toml.",
    docsPath: "/neotoma-with-codex",
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    description: "Cursor IDE. Add to .cursor/mcp.json.",
    docsPath: "/neotoma-with-cursor",
  },
  openclaw: {
    id: "openclaw",
    label: "OpenClaw",
    description: "OpenClaw agents. Install via clawhub or manual MCP config.",
    docsPath: "/neotoma-with-openclaw",
  },
};

export const HARNESS_IDS: readonly HarnessId[] = [
  "claude-code",
  "claude-desktop",
  "chatgpt",
  "codex",
  "cursor",
  "openclaw",
];

const PREFLIGHT_CLAUDE_CODE = `// Paste into .claude/settings.local.json (project) or ~/.claude/settings.json (user).
// Merge with any existing "permissions.allow" list.
{
  "permissions": {
    "allow": [
      "Bash(neotoma:*)",
      "Bash(npm install -g neotoma:*)"
    ]
  }
}`;

const PREFLIGHT_CURSOR = `// Paste into .cursor/allowlist.json (project).
// Cursor will then auto-approve any \`neotoma ...\` command plus the one-time
// global install.
{
  "allow": [
    "neotoma *",
    "npm install -g neotoma"
  ]
}`;

const PREFLIGHT_CODEX = `# Append to ~/.codex/config.toml (user scope).
# Codex uses this to auto-approve commands matching each pattern.
[approvals]
allow = [
  "neotoma *",
  "npm install -g neotoma",
]`;

function isRemoteMode(mode: LandingMode): boolean {
  return mode !== "local";
}

function agentConnectPrompt(id: HarnessId, ctx: HarnessSnippetContext): string {
  const { mcpUrl, mode, publicDocsUrl } = ctx;
  const stdio = resolvedStdioScript(ctx);
  const preamble =
    mode === "sandbox"
      ? `Connect this Neotoma MCP server for me: ${mcpUrl}

It is a public, shared sandbox — treat everything as publicly visible and expect a weekly wipe. Use it to help me kick the tires.`
      : mode === "local"
        ? `Connect Neotoma MCP (local stdio) for this harness. Neotoma runs on this machine; use the stdio transport, not an HTTP URL.`
        : `Connect this Neotoma MCP server for me: ${mcpUrl}`;

  const installNote = `If Neotoma is already installed, confirm with \`neotoma doctor --json\`; otherwise follow ${publicDocsUrl}/install.`;

  const harnessHint: Record<HarnessId, string> = {
    "claude-code": mode === "local"
      ? `Register with: \`claude mcp add neotoma -- ${JSON.stringify(stdio)}\`.`
      : `Register with: \`claude mcp add neotoma --transport http --url ${mcpUrl}\`.`,
    "claude-desktop": mode === "local"
      ? `Edit \`claude_desktop_config.json\` and add a \`mcpServers.neotoma\` stdio entry pointing at \`${stdio}\`.`
      : `Edit \`claude_desktop_config.json\` and add \`mcpServers.neotoma\` with the remote URL \`${mcpUrl}\`.`,
    chatgpt: mode === "local"
      ? "ChatGPT cannot connect over stdio — expose this Neotoma via a tunnel (ngrok/Cloudflare) and register the HTTPS URL as a remote MCP server in ChatGPT developer mode."
      : `Register as a remote MCP server in ChatGPT developer mode, pointed at \`${mcpUrl}\`.`,
    codex: mode === "local"
      ? `Append an \`[mcp_servers.neotoma]\` stdio block to \`~/.codex/config.toml\` using \`${stdio}\`.`
      : `Append an \`[mcp_servers.neotoma]\` block to \`~/.codex/config.toml\` with \`url = "${mcpUrl}"\`.`,
    cursor: mode === "local"
      ? `Edit \`.cursor/mcp.json\` and add a \`mcpServers.neotoma\` entry with a \`command\` pointing at \`${stdio}\`.`
      : `Edit \`.cursor/mcp.json\` and add \`mcpServers.neotoma\` with \`"url": "${mcpUrl}"\`.`,
    openclaw: mode === "local"
      ? "Run `openclaw plugins install clawhub:neotoma` — the local plugin wires up the stdio transport."
      : `Run \`openclaw plugins install clawhub:neotoma --url ${mcpUrl}\`, or add a manual remote MCP entry pointed at \`${mcpUrl}\`.`,
  };

  return [preamble, "", harnessHint[id], "", installNote].join("\n");
}

function humanSnippet(id: HarnessId, ctx: HarnessSnippetContext): { format: string; code: string } {
  const { mcpUrl, mode } = ctx;
  const stdioJson = JSON.stringify(resolvedStdioScript(ctx));

  if (mode === "local") {
    switch (id) {
      case "claude-code":
        return {
          format: "shell",
          code: `claude mcp add neotoma -- ${stdioJson}`,
        };
      case "claude-desktop":
        return {
          format: "json",
          code: `{
  "mcpServers": {
    "neotoma": {
      "command": ${stdioJson}
    }
  }
}`,
        };
      case "chatgpt":
        return {
          format: "text",
          code: `ChatGPT does not speak stdio. To connect a local Neotoma, expose it over HTTPS via a tunnel
(ngrok, Cloudflare, Tailscale funnel) and add the tunnel URL + "/mcp" as a remote MCP server
in ChatGPT developer mode. For a hosted sandbox instead, visit https://sandbox.neotoma.io/.`,
        };
      case "codex":
        return {
          format: "toml",
          code: `# ~/.codex/config.toml
[mcp_servers.neotoma]
command = ${stdioJson}`,
        };
      case "cursor":
        return {
          format: "json",
          code: `{
  "mcpServers": {
    "neotoma": {
      "command": ${stdioJson}
    }
  }
}`,
        };
      case "openclaw":
        return {
          format: "shell",
          code: `openclaw plugins install clawhub:neotoma`,
        };
    }
  }

  // Remote modes (sandbox, personal, prod)
  const bearer = ctx.sessionBearer;
  const bearerNote = bearer ? `\n  // Session bearer pre-filled from active sandbox session` : "";
  const headerBlock = bearer
    ? `,\n      "headers": {\n        "Authorization": "Bearer ${bearer}"\n      }`
    : "";

  switch (id) {
    case "claude-code":
      return {
        format: "shell",
        code: bearer
          ? `claude mcp add neotoma --transport http --url ${mcpUrl} --header "Authorization: Bearer ${bearer}"`
          : `claude mcp add neotoma --transport http --url ${mcpUrl}`,
      };
    case "claude-desktop":
      return {
        format: "json",
        code: `{${bearerNote}
  "mcpServers": {
    "neotoma": {
      "url": "${mcpUrl}"${headerBlock}
    }
  }
}`,
      };
    case "chatgpt":
      return {
        format: "text",
        code: `1. Open ChatGPT settings → Connectors → Add MCP server (requires developer mode).
2. Paste this URL: ${mcpUrl}
3. Name it "neotoma" so agents and custom GPT instructions can reference it consistently.
4. Authenticate if prompted.`,
      };
    case "codex":
      return {
        format: "toml",
        code: bearer
          ? `# ~/.codex/config.toml\n[mcp_servers.neotoma]\nurl = "${mcpUrl}"\n\n[mcp_servers.neotoma.headers]\nAuthorization = "Bearer ${bearer}"`
          : `# ~/.codex/config.toml\n[mcp_servers.neotoma]\nurl = "${mcpUrl}"`,
      };
    case "cursor":
      return {
        format: "json",
        code: `{${bearerNote}
  "mcpServers": {
    "neotoma": {
      "url": "${mcpUrl}"${headerBlock}
    }
  }
}`,
      };
    case "openclaw":
      return {
        format: "shell",
        code: `# Preferred: install the packaged plugin with this instance's URL
openclaw plugins install clawhub:neotoma --url ${mcpUrl}

# Or add a manual remote MCP entry
openclaw mcp add neotoma --url ${mcpUrl}`,
      };
  }
}

function preflightFor(id: HarnessId): HarnessDescriptor["preflight"] | undefined {
  switch (id) {
    case "claude-code":
      return {
        title: "Permissions preflight (optional)",
        code: PREFLIGHT_CLAUDE_CODE,
        format: "json",
      };
    case "cursor":
      return {
        title: "Permissions preflight (optional)",
        code: PREFLIGHT_CURSOR,
        format: "json",
      };
    case "codex":
      return {
        title: "Permissions preflight (optional)",
        code: PREFLIGHT_CODEX,
        format: "toml",
      };
    default:
      return undefined;
  }
}

export function buildHarnessSnippet(
  id: HarnessId,
  ctx: HarnessSnippetContext,
): HarnessSnippetResult {
  const meta = HARNESS_META[id];
  const docsUrl = `${ctx.publicDocsUrl.replace(/\/+$/, "")}${meta.docsPath}`;
  return {
    id,
    label: meta.label,
    description: meta.description,
    docsUrl,
    agentPrompt: agentConnectPrompt(id, ctx),
    human: humanSnippet(id, ctx),
    preflight: preflightFor(id),
  };
}

export function buildAllHarnessSnippets(ctx: HarnessSnippetContext): HarnessSnippetResult[] {
  return HARNESS_IDS.map((id) => buildHarnessSnippet(id, ctx));
}

/**
 * Exposed for tests to assert remote mode snippets interpolate the host.
 */
export { isRemoteMode };
