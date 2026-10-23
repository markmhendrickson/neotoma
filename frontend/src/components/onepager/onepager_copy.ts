/**
 * Copy for the neotoma.io developer one-pager.
 *
 * Every claim here is listed with its evidence in the pull request that introduced this file
 * (claim-evidence table) and in the one-pager specification stored in Neotoma. Rules:
 * plain and concrete, no hype, no em dashes. Do not add a claim without adding its evidence.
 * Not claimed anywhere: hosted Neotoma for sale, export with history, a unified platform,
 * multi-operator authority, "corrections always win", database-enforced append-only,
 * an as-of read across the whole record. A per-entity as-of read does exist
 * (retrieve_entity_snapshot with `at` and `at_ingested`); the page does not claim it, and must not
 * deny it.
 */

import { neotomaDocUrl } from "@/site/neotoma_repo";

export const FIGURE_LEGEND: readonly string[] = [
  "Two sources say different things about one invoice: the PDF says due October 22nd, a later email says October 29th.",
  "Each source becomes an observation. A rule, last write per field here, computes the current value from them.",
  "The due date now reads October 29th. The changed field points to the later observation.",
  "The amount still comes from the first observation. Both observations stay on record.",
  "Agents write each source in as an observation, and read the current snapshot back out. Writes made through the MCP server also record the client name the client reports.",
];

/**
 * Text alternative for the sheet 01 plate (FIG. A-1). The image is a generated illustration, not a
 * photograph. The alternative says what the picture shows and that the numbered callouts are
 * explained in the legend; it does not repeat the legend, which is HTML right below it and is read
 * in full by screen readers. It makes no attribution claim.
 */
export const PLATE_ALT =
  "Plate A-1, a synthetic example: a generated illustration of cut-paper objects on beige paper (an invoice page, an email card, two filed slips, a punch card and a large record card) with drafting callouts numbered 1 to 5, explained in the legend below.";

/** Title-block note of the plate, one entry per line in the phone frame. */
export const PLATE_NOTE: readonly string[] = [
  "Paper objects carry no invoice data.",
  "Keys 1 to 5 match the legend.",
];

export const RECALL_VS_RECORD: readonly {
  question: string;
  recall: string;
  record: string;
}[] = [
  {
    question: "What is stored?",
    recall: "Typically a summary of what the agent saw.",
    record: "Each stored fact as an observation linked to its source.",
  },
  {
    question: "What happens when a fact changes?",
    recall: "Typically the new text sits beside the old, or replaces it.",
    record: "A new observation is added and the earlier one stays.",
  },
  {
    question: "How do you see why a value is current?",
    recall: "Typically the agent's own account.",
    record: "Each current field names the observation that set it.",
  },
  {
    question: "What does a second agent read?",
    recall: "Whatever that tool retained.",
    record: "The same record, when it uses the same instance and MCP entry or data profile.",
  },
];

export const PIPELINE: readonly {
  name: string;
  label: string;
  text: string;
  doc: string;
  link: string;
}[] = [
  {
    name: "Source",
    label: "Keep the source",
    text: "The supplied document or message is retained as the input to this record.",
    doc: "docs/subsystems/sources.md",
    link: "Read about sources",
  },
  {
    name: "Observation",
    label: "Record a fact",
    text: "Each stored fact is an observation with a path back to its source.",
    doc: "docs/subsystems/observation_architecture.md",
    link: "Read about observations",
  },
  {
    name: "Entity",
    label: "Match the record",
    text: "Identity fields connect observations about the same invoice.",
    doc: "docs/foundation/entity_resolution.md",
    link: "Read about entities",
  },
  {
    name: "Reducer",
    label: "Apply the field rule",
    text: "Merge rules per field compute the current value from the observations.",
    doc: "docs/subsystems/reducer.md",
    link: "Read about field rules",
  },
  {
    name: "Snapshot",
    label: "Read the current value",
    text: "The snapshot shows the rule-selected field values and the observations behind them.",
    doc: "docs/subsystems/entity_snapshots.md",
    link: "Read about snapshots",
  },
];

export type Connection =
  | { host: string; id: string; kind: "setup"; tool: string; guide: string }
  | {
      host: string;
      id: string;
      kind: "manual" | "plugin" | "sdk" | "registry";
      guide: string;
      instruction: string;
    };

export const CONNECTIONS: readonly Connection[] = [
  {
    host: "Claude Code",
    id: "claude-code",
    kind: "setup",
    tool: "claude-code",
    guide: "docs/developer/mcp_claude_code_setup.md",
  },
  {
    host: "Cursor",
    id: "cursor",
    kind: "setup",
    tool: "cursor",
    guide: "docs/developer/mcp_cursor_setup.md",
  },
  {
    host: "Codex CLI",
    id: "codex",
    kind: "setup",
    tool: "codex",
    guide: "docs/integrations/hooks/codex_cli.md",
  },
  {
    host: "OpenClaw",
    id: "openclaw",
    kind: "setup",
    tool: "openclaw",
    guide: "docs/integrations/openclaw.md",
  },
  {
    host: "Claude Desktop",
    id: "claude-desktop",
    kind: "setup",
    tool: "claude-desktop",
    guide: "docs/integrations/matrix.md",
  },
  {
    host: "ChatGPT",
    id: "chatgpt",
    kind: "manual",
    guide: "docs/developer/chatgpt_apps_setup.md",
    instruction:
      "Configure the HTTPS/OAuth connector in ChatGPT, or follow the Custom GPT Actions guide for the OpenAPI path.",
  },
  {
    host: "Windsurf",
    id: "windsurf",
    kind: "manual",
    guide: "docs/developer/mcp_windsurf_setup.md",
    instruction: "Add Neotoma to Windsurf's MCP configuration using the manual guide.",
  },
  {
    host: "Continue",
    id: "continue",
    kind: "manual",
    guide: "docs/developer/mcp_continue_setup.md",
    instruction: "Add Neotoma to Continue's MCP configuration using the manual guide.",
  },
  {
    host: "VS Code / Copilot Chat",
    id: "vscode",
    kind: "manual",
    guide: "docs/developer/mcp_vscode_setup.md",
    instruction: "Configure the Neotoma MCP server in VS Code using the manual guide.",
  },
  {
    host: "IronClaw",
    id: "ironclaw",
    kind: "manual",
    guide: "docs/developer/mcp_ironclaw_setup.md",
    instruction: "Use IronClaw's documented mcp add flow; this is not a Neotoma setup target.",
  },
  {
    host: "Letta",
    id: "letta",
    kind: "sdk",
    guide: "docs/developer/mcp_letta_setup.md",
    instruction: "Follow the Letta guide to connect its SDK or MCP client to Neotoma.",
  },
  {
    host: "OpenCode",
    id: "opencode",
    kind: "plugin",
    guide: "docs/integrations/hooks/opencode.md",
    instruction: "Install the documented OpenCode plugin or configure MCP through its guide.",
  },
  {
    host: "Claude Agent SDK",
    id: "claude-agent-sdk",
    kind: "sdk",
    guide: "docs/integrations/hooks/claude_agent_sdk.md",
    instruction: "Use the documented Claude Agent SDK adapter and hooks.",
  },
  {
    host: "Smithery",
    id: "smithery",
    kind: "registry",
    guide: "docs/integrations/smithery_external_url.md",
    instruction: "Register a Neotoma external URL in Smithery using its registry guide.",
  },
];
export const CONNECTIONS_SETUP = CONNECTIONS.filter((connection) => connection.kind === "setup");
export const installCommands = (tool: string) => `npm install -g neotoma
neotoma init
neotoma setup --tool ${tool}`;
/** Kept for the canonical /install page's documented default example. */
export const INSTALL_COMMANDS = installCommands("claude-code");

const GH = "https://github.com/markmhendrickson/neotoma";
export const DEEPER_MATERIAL: readonly {
  title: string;
  links: readonly { label: string; href?: string }[];
}[] = [
  {
    title: "Read",
    links: [
      { label: "README", href: neotomaDocUrl("README.md") },
      { label: "Documentation", href: neotomaDocUrl("docs/") },
      { label: "Architecture", href: neotomaDocUrl("docs/architecture/architecture.md") },
      { label: "Integrations", href: neotomaDocUrl("docs/integrations/matrix.md") },
      { label: "Changelog and releases", href: `${GH}/releases` },
      { label: "Ateles", href: "https://github.com/markmhendrickson/ateles" },
    ],
  },
  {
    title: "Reference",
    links: [
      { label: "REST API", href: neotomaDocUrl("docs/api/rest_api.md") },
      { label: "MCP server", href: neotomaDocUrl("docs/developer/mcp_overview.md") },
      { label: "CLI", href: neotomaDocUrl("docs/developer/cli_reference.md") },
      { label: "Vocabulary", href: neotomaDocUrl("docs/vocabulary/canonical_terms.md") },
    ],
  },
  {
    title: "Take part",
    links: [
      { label: "Source code", href: GH },
      { label: "npm package", href: "https://www.npmjs.com/package/neotoma" },
      { label: "Issues", href: `${GH}/issues` },
      { label: "Discussions", href: `${GH}/discussions` },
      { label: "Talk to us", href: "/meet" },
      { label: "Contributor", href: "https://markmhendrickson.com" },
    ],
  },
  {
    title: "Organization and legal",
    links: [
      { label: "MIT license", href: `${GH}/blob/main/LICENSE` },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms of use", href: "/terms" },
    ],
  },
];
