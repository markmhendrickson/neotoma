/**
 * Copy for the neotoma.io developer one-pager.
 *
 * Every claim here is listed with its evidence in the pull request that introduced this file
 * (claim-evidence table) and in the one-pager specification stored in Neotoma. Rules:
 * plain and concrete, no hype, no em dashes. Do not add a claim without adding its evidence.
 * Not claimed anywhere: hosted Neotoma for sale, export with history, a unified platform,
 * multi-operator authority, "corrections always win", database-enforced append-only,
 * one-call point-in-time state.
 */

export const FIGURE_LEGEND: readonly string[] = [
  "Two sources say different things about one invoice: the PDF says due 22 October, a later email says 29 October.",
  "Each source becomes an observation. A rule, last write per field here, computes the current value from them.",
  "The due date now reads 29 October. The revision cloud marks the field that changed, and it points to the later observation.",
  "The amount still comes from the first observation. Both observations stay on record.",
];

export const RECALL_VS_RECORD: readonly {
  question: string;
  recall: string;
  record: string;
}[] = [
  {
    question: "What is stored?",
    recall: "Typically a summary of what the agent saw.",
    record: "Each fact as an observation linked to its source.",
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
$ neotoma corrections create ent_7cbcf2519f652626f3fe292a \\
    --field-name amount_due --corrected-value 3250

$ neotoma entities get ent_7cbcf2519f652626f3fe292a
  observation_count   3
  amount_due          3250        set by 67071613 (correction)
  date_due            2026-10-29  set by 2b97b9aa (llm_summary)
  currency            USD         set by 845b4e51 (import)

$ neotoma observations list --entity-id ent_7cbcf2519f652626f3fe292a
  67071613  correction   amount_due=3250
  2b97b9aa  llm_summary  date_due=2026-10-29
  845b4e51  import       amount_due=3200, date_due=2026-10-22, currency=USD`;

export const CONNECTIONS_SETUP: readonly { host: string; command: string }[] = [
  { host: "Claude Code", command: "neotoma setup --tool claude-code --yes" },
  { host: "Cursor", command: "neotoma setup --tool cursor --yes" },
  { host: "Codex CLI", command: "neotoma setup --tool codex --yes" },
  { host: "OpenClaw", command: "neotoma setup --tool openclaw --yes" },
  { host: "Claude Desktop", command: "neotoma setup --tool claude-desktop --yes" },
];

export const CONNECTIONS_OTHER =
  "ChatGPT, Windsurf, Continue, VS Code, OpenCode, IronClaw and Letta. These use MCP or an HTTP connector, configured by hand";

export const INSTALL_COMMANDS = `npm install -g neotoma
neotoma init
neotoma setup --tool <claude-code|cursor|codex|openclaw|claude-desktop> --yes
neotoma mcp config`;

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
    text: "Each write carries an agent identity and agents can be limited by grants. Organizations, workspaces and rules for who may correct what are not built.",
  },
  {
    title: "Not a chat log or a vector store.",
    text: "Neotoma stores typed entities and their observations. It can sit beside tools that retain or retrieve context.",
  },
];
