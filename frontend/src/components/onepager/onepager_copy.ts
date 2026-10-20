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
  "The due date now reads 29 October. The revision cloud marks the field that changed, and it points to the later observation.",
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

/** Caption line under the sheet 01 legend. */
export const PLATE_CAPTION =
  "Synthetic example: agents write two sources in and read one current record out. The same flow is run for real in sheet 03.";

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
    record: "The same record, when it is connected to the same instance.",
  },
];

export const PIPELINE: readonly { name: string; text: string }[] = [
  { name: "Source", text: "Raw input is stored once, content-addressed." },
  {
    name: "Observation",
    text: "Each extracted fact is stored as an observation linked to its source.",
  },
  { name: "Entity", text: "The type's identity fields map the observation to an entity." },
  {
    name: "Reducer",
    text: "Merge rules per field compute the current value from the observations.",
  },
  {
    name: "Snapshot",
    text: "The current entity, with a map from each field to the observation behind it.",
  },
];

export const CLI_TRANSCRIPT = `$ neotoma store --observation-source import --entities '[{"entity_type":"invoice",
    "invoice_number":"INV-2041","vendor_name":"Acme","invoice_date":"2026-10-01",
    "amount_due":3200,"currency":"USD","date_due":"2026-10-22"}]'
$ neotoma store --observation-source llm_summary --entities '[{"entity_type":"invoice",
    "invoice_number":"INV-2041","vendor_name":"Acme","invoice_date":"2026-10-01",
    "date_due":"2026-10-29"}]'
$ neotoma corrections create ent_7cbcf2519f652626f3fe292a --entity-type invoice \\
    --field-name amount_due --corrected-value 3250

$ neotoma entities get ent_7cbcf2519f652626f3fe292a
  observation_count   3
  amount_due          3250        set by b7e0392c (correction)
  date_due            2026-10-29  set by 5e29854e (llm_summary)
  currency            USD         set by f640b9f1 (import)

$ neotoma observations list --entity-id ent_7cbcf2519f652626f3fe292a
  b7e0392c  correction   amount_due=3250
  5e29854e  llm_summary  date_due=2026-10-29
  f640b9f1  import       amount_due=3200, date_due=2026-10-22, currency=USD`;

export const CONNECTIONS_SETUP: readonly { host: string; command: string }[] = [
  { host: "Claude Code", command: "neotoma setup --tool claude-code --yes" },
  { host: "Cursor", command: "neotoma setup --tool cursor --yes" },
  { host: "Codex CLI", command: "neotoma setup --tool codex --yes" },
  { host: "OpenClaw", command: "neotoma setup --tool openclaw --yes" },
  { host: "Claude Desktop", command: "neotoma setup --tool claude-desktop --yes" },
];

export const CONNECTIONS_OTHER =
  "ChatGPT, Windsurf, Continue, VS Code, IronClaw and Letta use MCP or an HTTP connector, configured by hand, and OpenCode uses a plugin or MCP";

export const INSTALL_COMMANDS = `npm install -g neotoma
neotoma init
neotoma setup --tool claude-code --yes`;

export const LIMITS: readonly { title: string; text: string }[] = [
  {
    title: "A record is a working commitment.",
    text: "Agents have to write to it and read from it. Neotoma needs a local service and deliberate writes, and it does nothing for facts that never reach it.",
  },
  {
    title: "Provenance is a trail, not a verdict.",
    text: "It shows which observation set a field and where that came from. It does not show that an agent read the source correctly. Repeatable results are not proof of what is true in the world.",
  },
  {
    title: "Export carries current state.",
    text: "The export command writes the current value of each entity as JSONL. Observation history stays in the instance it was recorded in.",
  },
  {
    title: "Authority over the record is not modeled yet.",
    text: "Writes over MCP are attributed to the connecting client, and to a signed agent identity when one is configured. Without one, the name is the client's own claim. Agents can be limited by grants. Organizations, workspaces and rules for who may correct what are not built.",
  },
  {
    title: "Not a chat log or a vector store.",
    text: "Neotoma stores typed entities and their observations. It can sit beside tools that retain or retrieve context.",
  },
];

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
      { label: "Talk to the author", href: "/meet" },
    ],
  },
];
