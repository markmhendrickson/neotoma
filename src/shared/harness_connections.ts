/** Public connection contract shared by the site chooser, root landing, and guides. */
export type ConnectionKind = "setup" | "manual" | "plugin" | "sdk" | "registry";
export interface Connection {
  id: string;
  host: string;
  kind: ConnectionKind;
  /** Legacy chooser property; present only for supported setup targets. */
  tool?: string;
  guide: `docs/guides/connections/${string}.md`;
  guideRoute: `/install/${string}/`;
  mode: "local" | "remote" | "hybrid" | "adapter" | "registry";
  transport: string;
  prerequisites: string;
  instruction: string;
  command?: string;
  verification: string;
  caveat: string;
  evidence: {
    /** Published release reference selected for this site; not the historical inspection date. */
    releasePin: string;
    /** Historical source revision inspected on checkedOn, retained separately from releasePin. */
    mainPin: string;
    repoPaths: string;
    vendorUrl: string;
    /** Date of the original source/vendor documentation check; no installed-host smoke is implied. */
    checkedOn: string;
  };
}
const RELEASE_PIN = "b6ae615964bdc4ac2eed4bbd7b0429c4107afc0d";
const MAIN_PIN = "477978471c5933e26fa07a0d28633382ec4bedb2";
export const CONNECTIONS: readonly Connection[] = [
  {
    id: "claude-code",
    host: "Claude Code",
    kind: "setup",
    tool: "claude-code",
    guide: "docs/guides/connections/claude-code.md",
    guideRoute: "/install/claude-code/",
    mode: "hybrid",
    transport: "local stdio; remote HTTP configured in host",
    prerequisites:
      "Install and initialize Neotoma on the host machine; the local stdio binary must be on PATH.",
    instruction: "neotoma setup --tool claude-code",
    command: "neotoma setup --tool claude-code",
    verification: "Run /mcp in Claude Code and call retrieve_entities on a known entity.",
    caveat: "MCP registration does not verify hooks or skills.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "src/cli/permissions.ts; src/cli/mcp_config_scan.ts",
      vendorUrl: "https://code.claude.com/docs/en/mcp",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "cursor",
    host: "Cursor",
    kind: "setup",
    tool: "cursor",
    guide: "docs/guides/connections/cursor.md",
    guideRoute: "/install/cursor/",
    mode: "hybrid",
    transport: "local stdio; remote HTTP configured in host",
    prerequisites:
      "Install and initialize Neotoma on the host machine; the local stdio binary must be on PATH.",
    instruction: "neotoma setup --tool cursor",
    command: "neotoma setup --tool cursor",
    verification:
      "Inspect .cursor/mcp.json or user config, then call retrieve_entities on a known entity.",
    caveat: "Check the actual Cursor config and tool list; a CLI exit is insufficient.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "src/cli/permissions.ts; src/cli/mcp_config_scan.ts",
      vendorUrl: "https://docs.cursor.com/context/model-context-protocol",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "codex",
    host: "Codex CLI",
    kind: "setup",
    tool: "codex",
    guide: "docs/guides/connections/codex.md",
    guideRoute: "/install/codex/",
    mode: "hybrid",
    transport: "local stdio; remote HTTP/OAuth configured in host",
    prerequisites:
      "Install and initialize Neotoma on the host machine; the local stdio binary must be on PATH.",
    instruction: "neotoma setup --tool codex",
    command: "neotoma setup --tool codex",
    verification: "Run codex mcp list and call retrieve_entities on a known entity.",
    caveat: "Local setup does not establish remote OAuth or host approval policy.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "src/cli/permissions.ts; src/cli/mcp_config_scan.ts",
      vendorUrl: "https://developers.openai.com/codex/mcp",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "openclaw",
    host: "OpenClaw",
    kind: "plugin",
    guide: "docs/guides/connections/openclaw.md",
    guideRoute: "/install/openclaw/",
    mode: "hybrid",
    transport: "native local plugin; optional manual remote MCP",
    prerequisites:
      "Choose the Neotoma instance OpenClaw will use, then install its native plugin. Optional Neotoma setup layers are separate.",
    instruction: "openclaw plugins install clawhub:neotoma",
    command: "openclaw plugins install clawhub:neotoma",
    verification: "Check plugin registration and a read-only Neotoma call.",
    caveat:
      "neotoma setup --tool openclaw adds separate Neotoma layers; it does not install the plugin.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "install.md; src/cli/permissions.ts",
      vendorUrl: "https://docs.openclaw.ai/cli/plugins/install",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "claude-desktop",
    host: "Claude Desktop",
    kind: "setup",
    tool: "claude-desktop",
    guide: "docs/guides/connections/claude-desktop.md",
    guideRoute: "/install/claude-desktop/",
    mode: "hybrid",
    transport: "local stdio; remote connector configured in host",
    prerequisites:
      "Install and initialize Neotoma on the host machine; the local stdio binary must be on PATH.",
    instruction: "neotoma setup --tool claude-desktop --install-scope user",
    command: "neotoma setup --tool claude-desktop --install-scope user",
    verification:
      "Inspect claude_desktop_config.json and call retrieve_entities on a known entity.",
    caveat: "Project scope may target Cursor config; use explicit user scope.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "install.md; src/cli/mcp_config_scan.ts",
      vendorUrl: "https://modelcontextprotocol.io/quickstart/user",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "chatgpt",
    host: "ChatGPT",
    kind: "manual",
    guide: "docs/guides/connections/chatgpt.md",
    guideRoute: "/install/chatgpt/",
    mode: "remote",
    transport: "remote authenticated HTTPS MCP; Actions use OpenAPI",
    prerequisites: "Operate a reachable authenticated HTTPS Neotoma /mcp endpoint.",
    instruction: "Add the HTTPS /mcp URL through ChatGPT custom MCP server setup.",
    verification: "Inspect connected tools and call retrieve_entities on a known entity.",
    caveat: "No local stdio or neotoma setup --tool target; account features and auth vary.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "docs/developer/chatgpt_apps_setup.md",
      vendorUrl: "https://developers.openai.com/api/docs/guides/custom-mcp-server",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "windsurf",
    host: "Windsurf",
    kind: "manual",
    guide: "docs/guides/connections/windsurf.md",
    guideRoute: "/install/windsurf/",
    mode: "hybrid",
    transport: "legacy Cascade local stdio; current agent configuration varies",
    prerequisites:
      "For local stdio, install and initialize Neotoma on the host machine. For a supported remote route, operate an authenticated endpoint. Check the installed host version.",
    instruction: "Use the installed host\u2019s MCP configuration flow; check its current format.",
    verification: "Inspect the host config and call retrieve_entities on a known entity.",
    caveat:
      "setup --tool windsurf can write Cursor config; current Devin Local differs from legacy Cascade.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "src/cli/mcp_config_scan.ts; docs/developer/mcp_windsurf_setup.md",
      vendorUrl: "https://docs.devin.ai/desktop/cascade/mcp",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "continue",
    host: "Continue",
    kind: "manual",
    guide: "docs/guides/connections/continue.md",
    guideRoute: "/install/continue/",
    mode: "hybrid",
    transport: "local stdio or host-supported remote MCP",
    prerequisites:
      "For local stdio, install and initialize Neotoma on the host machine. For a supported remote route, operate an authenticated endpoint. Check the installed host version.",
    instruction: "Add a Neotoma server to Continue YAML or .continue/mcpServers/ JSON.",
    verification: "Inspect Continue Agent mode tools and call retrieve_entities on a known entity.",
    caveat:
      "setup --tool continue can write Cursor config; old config.json instructions may be stale.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "src/cli/mcp_config_scan.ts; docs/developer/mcp_continue_setup.md",
      vendorUrl: "https://docs.continue.dev/customize/deep-dives/mcp",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "vscode",
    host: "VS Code / Copilot Chat",
    kind: "manual",
    guide: "docs/guides/connections/vscode.md",
    guideRoute: "/install/vscode/",
    mode: "hybrid",
    transport: "local stdio or HTTP in host-specific format",
    prerequisites:
      "For local stdio, install and initialize Neotoma on the host machine. For a supported remote route, operate an authenticated endpoint. Check the installed host version.",
    instruction: "Use MCP: Add Server or .vscode/mcp.json with a servers object.",
    verification: "Inspect Agent mode tools and call retrieve_entities on a known entity.",
    caveat: "setup --tool vscode can write Cursor config; .mcp.json uses a different key.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "src/cli/mcp_config_scan.ts; docs/developer/mcp_vscode_setup.md",
      vendorUrl: "https://code.visualstudio.com/docs/agents/reference/mcp-configuration",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "ironclaw",
    host: "IronClaw",
    kind: "manual",
    guide: "docs/guides/connections/ironclaw.md",
    guideRoute: "/install/ironclaw/",
    mode: "remote",
    transport: "host-supported remote MCP; local stdio conditional",
    prerequisites:
      "Operate an authenticated Neotoma endpoint for remote MCP; local stdio, if this IronClaw version supports it, requires Neotoma on its host machine.",
    instruction: "Use the installed IronClaw MCP registration flow.",
    verification: "Inspect IronClaw\u2019s MCP list and call retrieve_entities on a known entity.",
    caveat: "IronClaw is not a Neotoma setup target; verify installed host syntax.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "src/cli/permissions.ts; docs/developer/mcp_ironclaw_setup.md",
      vendorUrl: "https://www.mintlify.com/nearai/ironclaw/cli/mcp",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "letta",
    host: "Letta",
    kind: "sdk",
    guide: "docs/guides/connections/letta.md",
    guideRoute: "/install/letta/",
    mode: "remote",
    transport: "session-scoped MCP registration in Letta Agent SDK",
    prerequisites: "Operate a reachable authenticated HTTPS Neotoma /mcp endpoint.",
    instruction: "Attach a Neotoma MCP endpoint to a Letta Agent SDK session.",
    verification: "Inspect session tools and call retrieve_entities on a known entity.",
    caveat: "Current SDK session API differs from older V1 registration examples.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "docs/developer/mcp_letta_setup.md",
      vendorUrl: "https://docs.letta.com/agent-sdk/mcp",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "opencode",
    host: "OpenCode",
    kind: "manual",
    guide: "docs/guides/connections/opencode.md",
    guideRoute: "/install/opencode/",
    mode: "hybrid",
    transport: "MCP configured manually in OpenCode",
    prerequisites: "Operate a Neotoma instance and select its MCP transport and authentication.",
    instruction: "Configure Neotoma as an MCP server in opencode.json.",
    verification: "Inspect the OpenCode MCP tool list and retrieve a known entity.",
    caveat: "The optional @neotoma/opencode-plugin package is not published to npm; use MCP.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "docs/integrations/hooks/opencode.md; src/cli/hooks_detect.ts",
      vendorUrl: "https://opencode.ai/docs/mcp-servers/",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "claude-agent-sdk",
    host: "Claude Agent SDK",
    kind: "sdk",
    guide: "docs/guides/connections/claude-agent-sdk.md",
    guideRoute: "/install/claude-agent-sdk/",
    mode: "adapter",
    transport: "in-process adapter hooks; MCP optional",
    prerequisites:
      "Use an operated, reachable authenticated Neotoma API endpoint and add the adapter to the consumer application. Install and initialize a local Neotoma instance only if you are creating one.",
    instruction: "Mount createNeotomaAgentHooks() in the consumer application.",
    verification: "Read back an expected captured event in Neotoma.",
    caveat: "Adapter hooks do not register MCP; consumer app supplies endpoint and auth.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "packages/claude-agent-sdk-adapter; docs/integrations/hooks/claude_agent_sdk.md",
      vendorUrl: "https://platform.claude.com/docs/en/agent-sdk/overview",
      checkedOn: "2026-10-24",
    },
  },
  {
    id: "smithery",
    host: "Smithery",
    kind: "registry",
    guide: "docs/guides/connections/smithery.md",
    guideRoute: "/install/smithery/",
    mode: "registry",
    transport: "external authenticated HTTPS MCP endpoint",
    prerequisites: "Operate a reachable authenticated HTTPS Neotoma /mcp endpoint.",
    instruction: "Register an existing HTTPS /mcp URL in Smithery.",
    verification: "Read back the registry target and make a read-only MCP call.",
    caveat: "Registry publication alone does not prove a working connection.",
    evidence: {
      releasePin: RELEASE_PIN,
      mainPin: MAIN_PIN,
      repoPaths: "docs/integrations/smithery_external_url.md",
      vendorUrl: "https://smithery.ai/docs/build/publish",
      checkedOn: "2026-10-24",
    },
  },
];
export const CONNECTIONS_SETUP = CONNECTIONS.filter(
  (connection): connection is Connection & { kind: "setup"; tool: string; command: string } =>
    connection.kind === "setup"
);
/** Supported user-run command; unknown or manual hosts never become setup targets. */
export function setupCommandFor(tool: string): string | undefined {
  return CONNECTIONS_SETUP.find((connection) => connection.tool === tool)?.command;
}
