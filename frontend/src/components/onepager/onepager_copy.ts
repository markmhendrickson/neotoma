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

export const FIGURE_LEGEND: readonly string[] = [
  "Two sources say different things about one invoice: the PDF says due 22 October, a later email says 29 October.",
  "Each source becomes an observation. A rule, last write per field here, computes the current value from them.",
  "The due date now reads 29 October. The changed field points to the later observation.",
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

/** Caption line under the synthetic example. */
export const PLATE_CAPTION =
  "The current record selects a value for each field and keeps its observation trail.";

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

export const PIPELINE: readonly { name: string; label: string; text: string; doc: string }[] = [
  {
    name: "Source",
    label: "Keep the source",
    text: "The supplied document or message is retained as the input to this record.",
    doc: "docs/subsystems/sources.md",
  },
  {
    name: "Observation",
    label: "Record a fact",
    text: "Each stored fact is an observation with a path back to its source.",
    doc: "docs/subsystems/observation_architecture.md",
  },
  {
    name: "Entity",
    label: "Match the record",
    text: "Identity fields connect observations about the same invoice.",
    doc: "docs/foundation/entity_resolution.md",
  },
  {
    name: "Reducer",
    label: "Apply the field rule",
    text: "Merge rules per field compute the current value from the observations.",
    doc: "docs/subsystems/reducer.md",
  },
  {
    name: "Snapshot",
    label: "Read the current value",
    text: "The snapshot shows the rule-selected field values and the observations behind them.",
    doc: "docs/subsystems/entity_snapshots.md",
  },
];

export const CONNECTIONS_SETUP: readonly { host: string; tool: string }[] = [
  { host: "Claude Code", tool: "claude-code" },
  { host: "Cursor", tool: "cursor" },
  { host: "Codex CLI", tool: "codex" },
  { host: "OpenClaw", tool: "openclaw" },
  { host: "Claude Desktop", tool: "claude-desktop" },
];

export const CONNECTIONS_OTHER =
  "ChatGPT, Windsurf, Continue, VS Code, IronClaw and Letta use MCP or an HTTP connector, configured by hand, and OpenCode uses a plugin or MCP";

export const installCommands = (tool: string) => `npm install -g neotoma
neotoma init
neotoma setup --tool ${tool}`;
/** Kept for the canonical /install page's documented default example. */
export const INSTALL_COMMANDS = installCommands("claude-code");

const GH = "https://github.com/markmhendrickson/neotoma";
export const DEEPER_MATERIAL: readonly {
  title: string;
  links: readonly { label: string; href: string }[];
}[] = [
  {
    title: "Read",
    links: [
      { label: "README", href: `${GH}#readme` },
      { label: "Documentation", href: `${GH}/tree/main/docs` },
      { label: "Architecture", href: `${GH}/blob/main/docs/architecture/architecture.md` },
      { label: "Integrations", href: `${GH}/blob/main/docs/integrations/matrix.md` },
      { label: "Changelog and releases", href: `${GH}/releases` },
    ],
  },
  {
    title: "Reference",
    links: [
      { label: "REST API", href: `${GH}/blob/main/docs/api/rest_api.md` },
      { label: "MCP server", href: `${GH}/blob/main/docs/developer/mcp_overview.md` },
      { label: "CLI", href: `${GH}/blob/main/docs/developer/cli_reference.md` },
      { label: "Vocabulary", href: `${GH}/blob/main/docs/vocabulary/canonical_terms.md` },
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
    ],
  },
];
