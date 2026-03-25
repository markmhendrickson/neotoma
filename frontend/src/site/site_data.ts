import repoInfo from "./repo_info.json";

/** Version from package.json (updated by scripts/repo_info.ts). */
export const REPO_VERSION: string = repoInfo.version;
/** Published GitHub releases count (updated by scripts/repo_info.ts). */
export const REPO_RELEASES_COUNT: number = repoInfo.releasesCount;

export interface SiteSection {
  id: string;
  label: string;
  /** Short label for sidebar nav (e.g. "Bugs" instead of "Report or fix bugs") */
  shortLabel: string;
  /** Lucide icon name for sidebar (e.g. "Bug", "Terminal") */
  icon: string;
}

export interface FunctionalityRow {
  functionality: string;
  openapi: string;
  /** One description per endpoint (same order as openapi split by comma). Falls back to functionality when absent. */
  endpointDescriptions?: string[];
  /** One parameters summary per endpoint (path/query/body). Same order as openapi. Use "—" when none. */
  endpointParameters?: string[];
  cli: string;
  mcp: string;
  /** One parameters summary per MCP action (same order as mcp split by comma). Use "—" when none. */
  mcpParameters?: string[];
  /** One parameters or flags summary per CLI command (same order as cli split by comma). Use "—" when none. */
  cliParameters?: string[];
  testCoverage: string;
}

/** One row per MCP action for the intro MCP table (Action | Description | Parameters). */
export interface McpActionRow {
  action: string;
  description: string;
  /** Short summary of action parameters (e.g. "entity_id, at?"). "—" when none. */
  parameters: string;
}

/** One row per CLI command for the intro CLI table (Command | Description | Flags or parameters). */
export interface CliCommandRow {
  command: string;
  description: string;
  /** Short summary of flags or parameters (e.g. "--type, --limit"). "—" when none. */
  parameters: string;
}

export interface GlossaryRow {
  term: string;
  definition: string;
}

export type GuaranteeLevel =
  | "guaranteed"
  | "not-provided"
  | "manual"
  | "partial"
  | "common"
  | "possible"
  | "prevented";

export interface MemoryGuaranteeRow {
  property: string;
  tooltip: string;
  slug: string;
  platform: GuaranteeLevel;
  retrieval: GuaranteeLevel;
  file: GuaranteeLevel;
  neotoma: GuaranteeLevel;
}

export const MEMORY_GUARANTEE_ROWS: MemoryGuaranteeRow[] = [
  {
    property: "Deterministic state evolution",
    slug: "deterministic-state-evolution",
    tooltip:
      "Given the same set of observations, the system always produces the same entity state regardless of when or in what order they are processed. This eliminates ordering bugs and makes state transitions predictable and testable.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    neotoma: "guaranteed",
  },
  {
    property: "Versioned history",
    slug: "versioned-history",
    tooltip:
      "Every change to an entity creates a new version rather than overwriting the previous one. Earlier states are preserved and accessible, so you can review what an entity looked like at any point in time.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "manual",
    neotoma: "guaranteed",
  },
  {
    property: "Replayable timeline",
    slug: "replayable-timeline",
    tooltip:
      "The full sequence of observations and state changes can be replayed from the beginning to reconstruct any historical state. This enables debugging, auditing, and verifying that the current state is correct.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    neotoma: "guaranteed",
  },
  {
    property: "Auditable change log",
    slug: "auditable-change-log",
    tooltip:
      "Every modification records who made it, when, and from what source. This provides a complete audit trail that can be reviewed to understand how and why the current state came to be.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "partial",
    neotoma: "guaranteed",
  },
  {
    property: "Schema constraints",
    slug: "schema-constraints",
    tooltip:
      "Entities conform to defined types and validation rules. The system rejects malformed or invalid data rather than silently accepting it, preventing garbage-in-garbage-out failures across agents.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    neotoma: "guaranteed",
  },
  {
    property: "Silent mutation risk",
    slug: "silent-mutation-risk",
    tooltip:
      "The likelihood that data changes without explicit user awareness or consent. Systems with high silent mutation risk may overwrite, merge, or drop facts without leaving a trace, making it impossible to know what changed or when.",
    platform: "common",
    retrieval: "common",
    file: "common",
    neotoma: "prevented",
  },
  {
    property: "Conflicting facts risk",
    slug: "conflicting-facts-risk",
    tooltip:
      "The likelihood that two or more contradictory statements coexist in memory without detection. Without conflict resolution, a system may store that someone lives in Barcelona and San Francisco simultaneously without flagging the inconsistency.",
    platform: "common",
    retrieval: "common",
    file: "possible",
    neotoma: "prevented",
  },
  {
    property: "Reproducible state reconstruction",
    slug: "reproducible-state-reconstruction",
    tooltip:
      "The ability to rebuild the complete current state from raw inputs alone. If the database is lost, the system can reconstruct it exactly from its observation log, the way a ledger balances to zero from its entries.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    neotoma: "guaranteed",
  },
  {
    property: "Human inspectability (diffs/lineage)",
    slug: "human-inspectability",
    tooltip:
      "The ability for a human to examine exactly what changed between any two versions of an entity and trace where each fact originated. This makes memory transparent rather than opaque, so trust does not depend on blind faith in the system.",
    platform: "partial",
    retrieval: "partial",
    file: "partial",
    neotoma: "guaranteed",
  },
  {
    property: "Zero-setup onboarding",
    slug: "zero-setup-onboarding",
    tooltip:
      "Whether memory is available immediately without any installation, configuration, or infrastructure setup. Platform memory is built into the chat product and works from the first message with no action required from the user.",
    platform: "guaranteed",
    retrieval: "not-provided",
    file: "not-provided",
    neotoma: "not-provided",
  },
  {
    property: "Semantic similarity search",
    slug: "semantic-similarity-search",
    tooltip:
      "The ability to find relevant prior context by meaning rather than exact match. Retrieval systems search over unstructured documents using vector embeddings. Neotoma searches over structured entity snapshots using the same technique, scoped by entity type and structural filters.",
    platform: "not-provided",
    retrieval: "guaranteed",
    file: "not-provided",
    neotoma: "guaranteed",
  },
  {
    property: "Direct human editability",
    slug: "direct-human-editability",
    tooltip:
      "Whether a person can open the memory store in a standard editor (e.g. VS Code, Notepad) and modify it directly. File-based systems use plain text formats like Markdown or JSON that any tool can read and write without a runtime or API layer. Platform memory (e.g. ChatGPT, Claude) may offer in-app UIs to view or edit memories, but the underlying store is not exposed as an editable file.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "guaranteed",
    neotoma: "not-provided",
  },
];

export const MEMORY_MODEL_VENDORS: Record<string, string> = {
  platform: "Claude, ChatGPT, Gemini, Copilot",
  retrieval: "Mem0, Zep, LangChain Memory",
  file: "Markdown files, JSON stores, CRDT docs",
  neotoma: "Neotoma",
};

export const MEMORY_TYPE_SLUGS: Record<string, string> = {
  platform: "memory-models#platform-memory",
  retrieval: "memory-models#retrieval-memory",
  file: "memory-models#file-based-memory",
  neotoma: "memory-models#deterministic-memory",
};

export interface FoundationCard {
  title: string;
  icon: string;
  lines: string[];
  link: string;
}

export const THREE_FOUNDATIONS: FoundationCard[] = [
  {
    title: "Privacy-first",
    icon: "ShieldCheck",
    link: "/foundations#privacy-first",
    lines: [
      "Your data stays local. Never used for training.",
      "User-controlled storage, optional encryption at rest.",
      "Full export and deletion control.",
    ],
  },
  {
    title: "Deterministic",
    icon: "Fingerprint",
    link: "/foundations#deterministic",
    lines: [
      "Same input always produces same output.",
      "Schema-first extraction, hash-based entity IDs, full provenance.",
      "No silent mutation.",
    ],
  },
  {
    title: "Cross-platform",
    icon: "Globe2",
    link: "/foundations#cross-platform",
    lines: [
      "One state graph across Claude, Cursor, Codex, and CLI.",
      "MCP-based access. No platform lock-in.",
      "Works alongside native memory features. Nothing to uninstall.",
    ],
  },
];

export const SITE_SECTIONS: SiteSection[] = [
  { id: "intro", label: "Intro", shortLabel: "Intro", icon: "Zap" },
  { id: "outcomes", label: "Before / After", shortLabel: "Before / After", icon: "AlertTriangle" },
  { id: "memory-guarantees", label: "Guarantees", shortLabel: "Guarantees", icon: "ShieldCheck" },
  { id: "install", label: "Install", shortLabel: "Install", icon: "Rocket" },
  { id: "inspect", label: "Inspect", shortLabel: "Inspect", icon: "Search" },
  { id: "architecture", label: "Architecture", shortLabel: "Architecture", icon: "Layers" },
  { id: "who-is-it-for", label: "Who is it for", shortLabel: "Who is it for", icon: "Users" },
  { id: "interfaces", label: "Interfaces", shortLabel: "Interfaces", icon: "SatelliteDish" },
  { id: "learn-more", label: "Learn more", shortLabel: "Resources", icon: "GraduationCap" },
];

export interface DocNavItem {
  label: string;
  href: string;
  /** Lucide icon name for collapsed sidebar (e.g. "Rocket", "Terminal"). */
  icon?: string;
}

export interface DocNavCategory {
  title: string;
  items: DocNavItem[];
}

export const DOC_NAV_CATEGORIES: DocNavCategory[] = [
  {
    title: "Getting started",
    items: [
      { label: "Documentation", href: "/docs", icon: "Home" },
      { label: "Install", href: "/install", icon: "Rocket" },
      { label: "Developer walkthrough", href: "/developer-walkthrough", icon: "Code" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { label: "Claude Code", href: "/neotoma-with-claude-code", icon: "Code" },
      { label: "Claude", href: "/neotoma-with-claude", icon: "MessageSquare" },
      { label: "ChatGPT", href: "/neotoma-with-chatgpt", icon: "MessageCircle" },
      { label: "Codex", href: "/neotoma-with-codex", icon: "Monitor" },
      { label: "Cursor", href: "/neotoma-with-cursor", icon: "PanelRight" },
      { label: "OpenClaw", href: "/neotoma-with-openclaw", icon: "Sparkles" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "REST API", href: "/api", icon: "Globe" },
      { label: "MCP server", href: "/mcp", icon: "Server" },
      { label: "CLI", href: "/cli", icon: "Terminal" },
      { label: "Memory guarantees", href: "/memory-guarantees", icon: "ShieldCheck" },
      { label: "Memory models", href: "/memory-models", icon: "Container" },
      { label: "Foundations", href: "/foundations", icon: "Layers" },
      { label: "Agent instructions", href: "/agent-instructions", icon: "Bot" },
      { label: "Architecture", href: "/architecture", icon: "Building2" },
      { label: "Terminology", href: "/terminology", icon: "Bookmark" },
      { label: "Data model walkthrough", href: "/data-model", icon: "Boxes" },
      { label: "Schema management", href: "/schema-management", icon: "Database" },
      { label: "Troubleshooting", href: "/troubleshooting", icon: "Bug" },
      { label: "Changelog", href: "/changelog", icon: "History" },
    ],
  },
  {
    title: "Use cases",
    items: [
      { label: "AI infrastructure engineers", href: "/ai-infrastructure-engineers", icon: "Cpu" },
      { label: "Agent system builders", href: "/agentic-systems-builders", icon: "Zap" },
      { label: "AI-native operators", href: "/ai-native-operators", icon: "SatelliteDish" },
    ],
  },
  {
    title: "External",
    items: [
      { label: "GitHub", href: "https://github.com/markmhendrickson/neotoma", icon: "Github" },
      { label: "npm", href: "https://www.npmjs.com/package/neotoma", icon: "Package" },
    ],
  },
];

export const SITE_CODE_SNIPPETS = {
  installCommands: `# Global install
npm install -g neotoma

# Initialize
neotoma init`,
  agentInstallPrompt: `Follow this workflow to set up Neotoma:

1. Install Neotoma with npm install -g neotoma.
2. Initialize Neotoma with neotoma init.
3. Report what changed after install/init.
4. If I ask for integration setup after init, link the matching setup guide in docs/developer/ (for example mcp_cursor_setup.md, mcp_claude_code_setup.md, mcp_openclaw_setup.md).
5. Gather candidate data from available context, including facts this tool already remembers about me.
6. Present one preview list with provenance, mark already-stored vs new, and ask for explicit confirmation.
7. Save only what I explicitly confirm.
8. Pause after asking for confirmation. Do not save or continue until I approve.

Canonical source: https://github.com/markmhendrickson/neotoma/blob/main/install.md`,
  postInstallCommands: `# Run API server (development)
neotoma api start --env dev

# Run API server (production)
neotoma api start --env production`,
  stdioConfigJson: `{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
    },
    "neotoma": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    }
  }
}`,
  syncConfigCommands: `cd /path/to/neotoma
# Add neotoma-dev and neotoma to .cursor/mcp.json (see mcp_cursor_setup.md Option A)
npm run sync:mcp`,
  dockerAgentPrompt: `Follow the instructions at:
https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/agent_docker_instructions.md`,
  dockerBuild: `git clone https://github.com/markmhendrickson/neotoma.git
cd neotoma
docker build -t neotoma .`,
  dockerRun: `docker run -d \\
  --name neotoma \\
  -p 3080:3080 \\
  -v neotoma-data:/app/data \\
  neotoma`,
  dockerInit: `docker exec neotoma neotoma init --yes --data-dir /app/data`,
  dockerMcpConfig: `{
  "mcpServers": {
    "neotoma": {
      "command": "docker",
      "args": ["exec", "-i", "neotoma", "node", "dist/index.js"]
    }
  }
}`,
  dockerCliExample: `# Store an entity
docker exec neotoma neotoma store \\
  --json='[{"entity_type":"task","title":"Submit expense report","status":"open"}]'

# List entities
docker exec neotoma neotoma entities list --type task`,
  cliStoreExample: `neotoma store --json='[{"entity_type":"task","title":"Submit expense report","status":"open"}]'`,
  cliListExample: `neotoma entities list --type company --limit 10`,
  cliUploadExample: `neotoma upload ./fixtures/invoice.pdf
neotoma upload ./doc.pdf --no-interpret --mime-type application/pdf
neotoma upload --local ./invoice.pdf   # run in-process, no API server required`,
  chatgptCustomGptInstructions: `You are an assistant that uses Neotoma MCP actions for memory persistence and retrieval.

Execution order (mandatory every turn):
1) Run bounded retrieval for entities implied by the user message.
   - Use retrieve_entity_by_identifier for names/emails/identifiers.
   - Use retrieve_entities for related types (task, contact, event, etc.).
2) Run one store call for this turn's conversation + user message (+ implied entities).
3) Only after steps (1) and (2), continue with other tools and compose the user response.

Do not respond before completing steps (1) and (2).

Storage recipes:

Unified store (preferred one call):
- store with entities:
  - index 0: { entity_type: "conversation", title? }
  - index 1: { entity_type: "agent_message", role: "user", content: "<exact message>", turn_key: "{conversation_id}:{turn_id}" }
  - index 2+: optional extracted entities implied by the message
- relationships in same store call:
  - PART_OF from source_index 1 -> target_index 0
  - REFERS_TO from source_index 1 -> each extracted entity index (2+)
- idempotency_key: "conversation-{conversation_id}-{turn_id}-{suffix}" or "conversation-chat-<turn>-{suffix}"

Attachment/image turn:
- Use one store call with conversation + agent_message, and file_path (or file_content + mime_type) in the same request.
- Then create_relationship:
  - relationship_type: "EMBEDS"
  - source_entity_id: step1_response.structured.entities[1].entity_id
  - target_entity_id: step1_response.unstructured.interpretation.entities[0].entityId
- For screenshots/images, extract and store distinct visible entities, and link with REFERS_TO.

Turn identity fallback:
- If no host conversation_id/turn_id:
  - turn_key = "chat:<turn>"
  - idempotency_key = "conversation-chat-<turn>-<timestamp_ms>"

Tool-usage constraints for chat/attachment/entity extraction flows:
- Do NOT list, glob, or read MCP tool descriptor/schema files for these storage flows.
- Use only:
  - store(entities, idempotency_key, relationships, file_path | file_content+mime_type, file_idempotency_key?)
  - create_relationship(relationship_type, source_entity_id, target_entity_id)

Behavior requirements:
- Store every turn, including greetings and short messages.
- Use MCP actions proactively; do not wait for the user to ask to save.
- If pulling external data (web/search/API/files/email/calendar/etc.), store relevant entities first, then answer.
- Extract and store people, tasks, events, places, commitments, preferences, and relationships.
- Create task entities when user expresses intent/obligation/future action (unless user explicitly says not to).
- Use descriptive entity_type + fields implied by the message; do not block on strict schema lookup.

Response style:
- Do not mention internal storage/linking unless user asks.
- If user asks whether something was saved, use memory-oriented wording (e.g., "stored in memory", "I can recall that").`,
};

export const GLOSSARY_ROWS: GlossaryRow[] = [
  {
    term: "State layer",
    definition:
      "Neotoma's role: a deterministic, immutable structured memory substrate that other layers read and write.",
  },
  {
    term: "Entity",
    definition:
      "Canonical representation of a person, company, or other object with a deterministic ID.",
  },
  {
    term: "Entity snapshot",
    definition:
      "Current truth for an entity; computed by merging all observations about that entity.",
  },
  {
    term: "Observation",
    definition:
      "Granular fact extracted from source; reducers merge observations into entity snapshots.",
  },
  {
    term: "Source",
    definition:
      "Raw data (file, text, URL, or structured JSON) stored with content-addressed deduplication.",
  },
  {
    term: "Provenance",
    definition:
      "Origin tracking (source, timestamp, user, interpretation) so every value traces back to its source.",
  },
  {
    term: "Memory graph",
    definition:
      "The graph of source, observations, entities, relationships, and events with typed edges.",
  },
  {
    term: "Reducer",
    definition:
      "Deterministic function that merges observations into an entity snapshot; same observations always yield the same snapshot.",
  },
  {
    term: "Relationship",
    definition: "Typed connection between two entities (e.g. SETTLES, REFERS_TO, PART_OF).",
  },
  {
    term: "Entity type",
    definition:
      "Classification (e.g. person, company, invoice) that determines the entity schema and resolution rules.",
  },
  {
    term: "Storing",
    definition:
      "Uploading and processing source into the memory graph (unstructured or structured).",
  },
  {
    term: "Retrieving",
    definition:
      "Querying entities, entity snapshots, observations, and related data from the memory graph.",
  },
];

export const FUNCTIONALITY_MATRIX: FunctionalityRow[] = [
  {
    functionality: "Get or authenticate the current user.",
    openapi:
      "GET /me, POST /mcp/oauth/initiate, GET /mcp/oauth/authorize, POST /mcp/oauth/token, GET /mcp/oauth/status, GET /mcp/oauth/connections, DELETE /mcp/oauth/connections/{id}",
    endpointDescriptions: [
      "Get the current user.",
      "Initiate the OAuth flow.",
      "Handle the OAuth authorize redirect.",
      "Exchange the OAuth code for a token.",
      "Get OAuth connection status.",
      "List OAuth connections.",
      "Remove an OAuth connection.",
    ],
    endpointParameters: [
      "—",
      "body: auth_provider, redirect_uri",
      "query: code, state",
      "body: code, code_verifier",
      "—",
      "—",
      "path: id",
    ],
    cli: "auth login, auth status, auth whoami, request (OAuth ops)",
    cliParameters: ["—", "—", "—", "—"],
    mcp: "get_authenticated_user",
    mcpParameters: ["—"],
    testCoverage: "cli_auth_commands, mcp_oauth_flow, mcp_oauth (service)",
  },
  {
    functionality: "Query entities with filters.",
    openapi: "POST /entities/query",
    endpointDescriptions: ["Query entities with filters."],
    endpointParameters: ["body: filters, limit, offset"],
    cli: "entities list",
    cliParameters: ["--type, --limit, --offset, --search"],
    mcp: "retrieve_entities",
    mcpParameters: ["filters, limit?, search?"],
    testCoverage:
      "cli_entity_subcommands, cli_to_mcp_entities, mcp_entity_variations, mcp_query_variations, entity_queries",
  },
  {
    functionality: "Get an entity by ID.",
    openapi: "GET /entities/{id}",
    endpointDescriptions: ["Get an entity by ID."],
    endpointParameters: ["path: id"],
    cli: "entities get",
    cliParameters: ["<entity_id>"],
    mcp: "—",
    testCoverage: "cli_entity_subcommands, cli_to_mcp_entities",
  },
  {
    functionality: "Get an entity snapshot with provenance.",
    openapi: "POST /get_entity_snapshot",
    endpointDescriptions: ["Get an entity snapshot with provenance."],
    endpointParameters: ["body: entity_id, at?"],
    cli: "request --operation getEntitySnapshot",
    cliParameters: ["--entity-id, --at?"],
    mcp: "retrieve_entity_snapshot",
    mcpParameters: ["entity_id, at?"],
    testCoverage: "cli_to_mcp_entities, mcp_resource_variations, cli_to_mcp_stats_snapshots",
  },
  {
    functionality: "List observations for an entity or get field provenance.",
    openapi: "GET /entities/{id}/observations, POST /list_observations, POST /get_field_provenance",
    endpointDescriptions: [
      "List observations for an entity.",
      "List observations by query.",
      "Get provenance for a field.",
    ],
    endpointParameters: ["path: id", "body: filters", "body: entity_id, field"],
    cli: "request (getEntityObservations, listObservationsForEntity, getFieldProvenance)",
    cliParameters: ["--entity-id (or body)", "—", "—"],
    mcp: "list_observations, retrieve_field_provenance",
    mcpParameters: ["entity_id", "entity_id, field"],
    testCoverage: "cli_observation_commands, mcp_resource_variations",
  },
  {
    functionality: "List relationships for an entity.",
    openapi: "GET /entities/{id}/relationships, POST /list_relationships",
    endpointDescriptions: ["List relationships for an entity.", "List relationships by query."],
    endpointParameters: ["path: id", "body: filters"],
    cli: "relationships list",
    cliParameters: ["--entity-id"],
    mcp: "list_relationships",
    mcpParameters: ["entity_id"],
    testCoverage:
      "cli_relationship_commands, cli_to_mcp_relationships, mcp_relationship_variations",
  },
  {
    functionality: "Search for an entity by identifier or semantic.",
    openapi: "POST /retrieve_entity_by_identifier",
    endpointDescriptions: ["Search for an entity by identifier or semantic."],
    endpointParameters: ["body: identifier, entity_type?"],
    cli: "entities search",
    cliParameters: ["--query, --type"],
    mcp: "retrieve_entity_by_identifier",
    mcpParameters: ["identifier, entity_type?"],
    testCoverage: "cli_query_commands, mcp_entity_variations",
  },
  {
    functionality: "Retrieve related entities or the graph neighborhood.",
    openapi: "POST /retrieve_related_entities, POST /retrieve_graph_neighborhood",
    endpointDescriptions: ["Retrieve related entities.", "Retrieve the graph neighborhood."],
    endpointParameters: [
      "body: entity_id, relationship_types?, depth?",
      "body: node_id, node_type",
    ],
    cli: "entities related, entities neighborhood",
    cliParameters: ["--entity-id", "--entity-id"],
    mcp: "retrieve_related_entities, retrieve_graph_neighborhood",
    mcpParameters: ["entity_id, relationship_types?, depth?", "node_id, node_type"],
    testCoverage: "cli_query_commands, mcp_graph_variations",
  },
  {
    functionality: "Merge two entities.",
    openapi: "POST /entities/merge",
    endpointDescriptions: ["Merge two entities."],
    endpointParameters: ["body: source_entity_id, target_entity_id"],
    cli: "request --operation mergeEntities",
    cliParameters: ["--source-id, --target-id"],
    mcp: "merge_entities",
    mcpParameters: ["source_entity_id, target_entity_id"],
    testCoverage: "cli_entity_subcommands, mcp_entity_variations",
  },
  {
    functionality: "Delete or restore an entity.",
    openapi: "POST /delete_entity, POST /restore_entity",
    endpointDescriptions: ["Delete an entity.", "Restore an entity."],
    endpointParameters: ["body: entity_id", "body: entity_id"],
    cli: "entities delete, entities restore",
    cliParameters: ["<entity_id>", "<entity_id>"],
    mcp: "delete_entity, restore_entity",
    mcpParameters: ["entity_id", "entity_id"],
    testCoverage: "cli_entity_subcommands, deletion (service), mcp_correction_variations",
  },
  {
    functionality: "List sources or get a source by ID.",
    openapi: "GET /sources, GET /sources/{id}",
    endpointDescriptions: ["List sources.", "Get a source by ID."],
    endpointParameters: ["query: limit?, offset?", "path: id"],
    cli: "sources list, request --operation getSourceById",
    cliParameters: ["—", "—"],
    mcp: "—",
    testCoverage: "cli_source_commands, mcp_resources",
  },
  {
    functionality: "List, query, or create observations.",
    openapi: "GET /observations, POST /observations/query, POST /observations/create",
    endpointDescriptions: ["List observations.", "Query observations.", "Create an observation."],
    endpointParameters: ["query: limit?, offset?", "body: filters", "body: entity_id, fields"],
    cli: "request (listObservations), observations list",
    cliParameters: ["—", "—"],
    mcp: "—",
    testCoverage: "cli_observation_commands, observation_ingestion",
  },
  {
    functionality: "List relationships, get one by ID, or get a snapshot.",
    openapi: "GET /relationships, GET /relationships/{id}, POST /relationships/snapshot",
    endpointDescriptions: [
      "List relationships.",
      "Get a relationship by ID.",
      "Get a relationship snapshot.",
    ],
    endpointParameters: ["query: limit?, offset?", "path: id", "body: relationship_key or ids"],
    cli: "relationships list, request (getRelationshipById), relationships get-snapshot",
    cliParameters: ["—", "—", "—"],
    mcp: "get_relationship_snapshot",
    mcpParameters: ["relationship_key"],
    testCoverage:
      "cli_relationship_commands, cli_to_mcp_relationships, mcp_relationship_variations, relationship_snapshots",
  },
  {
    functionality: "Create, delete, or restore a relationship.",
    openapi: "POST /create_relationship, POST /delete_relationship, POST /restore_relationship",
    endpointDescriptions: [
      "Create a relationship.",
      "Delete a relationship.",
      "Restore a relationship.",
    ],
    endpointParameters: [
      "body: relationship_type, source_entity_id, target_entity_id",
      "body: relationship_key",
      "body: relationship_key",
    ],
    cli: "request (createRelationship), relationships delete, relationships restore",
    cliParameters: ["--source-id, --target-id, --type", "--relationship-key", "--relationship-key"],
    mcp: "create_relationship, delete_relationship, restore_relationship",
    mcpParameters: [
      "relationship_type, source_entity_id, target_entity_id",
      "relationship_key",
      "relationship_key",
    ],
    testCoverage:
      "cli_relationship_commands, cli_correction_commands, mcp_relationship_variations, deletion (service)",
  },
  {
    functionality: "List timeline events or get one by ID.",
    openapi: "GET /timeline, GET /timeline/{id}",
    endpointDescriptions: ["List timeline events.", "Get a timeline event by ID."],
    endpointParameters: ["query: type?, from?, to?", "path: id"],
    cli: "timeline list, timeline get",
    cliParameters: ["—", "<id>"],
    mcp: "list_timeline_events",
    mcpParameters: ["type?, from?, to?"],
    testCoverage: "cli_timeline_commands, cli_to_mcp_stats_snapshots, event_generation",
  },
  {
    functionality: "List schema types or get a schema by entity type.",
    openapi: "GET /schemas, GET /schemas/{entity_type}",
    endpointDescriptions: ["List schema types.", "Get a schema for an entity type."],
    endpointParameters: ["—", "path: entity_type"],
    cli: "schemas list, schemas get",
    cliParameters: ["—", "<entity_type>"],
    mcp: "list_entity_types",
    mcpParameters: ["keyword?"],
    testCoverage: "cli_to_mcp_schemas, cli_schema_commands, mcp_schema_variations",
  },
  {
    functionality:
      "Analyze schema candidates, get recommendations, update incrementally, or register a schema.",
    openapi:
      "POST /analyze_schema_candidates, POST /get_schema_recommendations, POST /update_schema_incremental, POST /register_schema",
    endpointDescriptions: [
      "Analyze schema candidates.",
      "Get schema recommendations.",
      "Update a schema incrementally.",
      "Register a schema.",
    ],
    endpointParameters: [
      "body: entity_type, entity_id?",
      "body: entity_type",
      "body: entity_type, new_fields",
      "body: schema",
    ],
    cli: "schemas analyze-candidates, schemas recommendations, schemas update-incremental, schemas register",
    cliParameters: ["--entity-type", "--entity-type", "--entity-type", "—"],
    mcp: "analyze_schema_candidates, get_schema_recommendations, update_schema_incremental, register_schema",
    mcpParameters: ["entity_type, entity_id?", "entity_type", "entity_type, new_fields", "schema"],
    testCoverage:
      "cli_schema_commands, mcp_schema_actions, mcp_schema_variations, schema_recommendation (service), schema_recommendation_integration",
  },
  {
    functionality: "Store structured entities.",
    openapi: "POST /store",
    endpointDescriptions: ["Store structured entities."],
    endpointParameters: ["body: entities, idempotency_key?, relationships?"],
    cli: "store",
    cliParameters: ["--json"],
    mcp: "store, store_structured",
    mcpParameters: [
      "entities, file_path?, idempotency_key?",
      "entities, idempotency_key?, relationships?",
    ],
    testCoverage:
      "cli_store_commands, cli_to_mcp_store, mcp_store_variations, fixture_mcp_store_replay",
  },
  {
    functionality: "Store an unstructured file.",
    openapi: "POST /store/unstructured",
    endpointDescriptions: ["Store an unstructured file."],
    endpointParameters: ["body: file_path or file_content, mime_type"],
    cli: "upload <path>",
    cliParameters: ["<path>, --no-interpret?, --mime-type?"],
    mcp: "store_unstructured",
    mcpParameters: ["file_path or file_content, mime_type"],
    testCoverage:
      "cli_store_commands, mcp_store_unstructured, mcp_store_parquet, nonjson_csv_store_behavior",
  },
  {
    functionality: "Submit a correction or reinterpret a source.",
    openapi: "POST /correct, POST /reinterpret",
    endpointDescriptions: ["Submit a correction.", "Reinterpret a source."],
    endpointParameters: ["body: entity_id, field, value", "body: source_id"],
    cli: "corrections create, interpretations reinterpret",
    cliParameters: ["—", "<source_id>"],
    mcp: "correct, reinterpret",
    mcpParameters: ["entity_id, field, value", "source_id"],
    testCoverage: "cli_correction_commands, mcp_correction_variations, interpretation (service)",
  },
  {
    functionality: "List interpretations.",
    openapi: "GET /interpretations",
    endpointDescriptions: ["List interpretations."],
    endpointParameters: ["query: limit?, offset?"],
    cli: "request --operation listInterpretations",
    cliParameters: ["—"],
    mcp: "—",
    testCoverage: "cli_observation_commands, interpretation (service)",
  },
  {
    functionality: "Get server stats, server info, or run health check snapshots.",
    openapi: "GET /stats, GET /server-info, POST /health_check_snapshots",
    endpointDescriptions: ["Get server stats.", "Get server info.", "Run health check snapshots."],
    endpointParameters: ["—", "—", "—"],
    cli: "stats, snapshots check",
    cliParameters: ["—", "—"],
    mcp: "health_check_snapshots",
    mcpParameters: ["—"],
    testCoverage: "cli_stats_commands, cli_to_mcp_stats_snapshots, dashboard_stats",
  },
  {
    functionality: "Get a signed file URL (internal).",
    openapi: "GET /get_file_url (internal path)",
    endpointDescriptions: ["Get a signed file URL (internal)."],
    endpointParameters: ["query: path"],
    cli: "request --operation getFileUrl",
    cliParameters: ["—"],
    mcp: "retrieve_file_url",
    mcpParameters: ["path"],
    testCoverage: "mcp_resources, contract_mapping",
  },
];

/** Derived from FUNCTIONALITY_MATRIX: one row per MCP action, with description and parameters. */
export const MCP_ACTIONS_TABLE: McpActionRow[] = (() => {
  const rows: McpActionRow[] = [];
  for (const row of FUNCTIONALITY_MATRIX) {
    const actions = row.mcp
      .split(",")
      .map((s) => s.trim())
      .filter((a) => a && a !== "—");
    const desc = row.functionality;
    const params = row.mcpParameters ?? [];
    for (let i = 0; i < actions.length; i++) {
      rows.push({ action: actions[i], description: desc, parameters: params[i] ?? "—" });
    }
  }
  return rows;
})();

/** Derived from FUNCTIONALITY_MATRIX: one row per CLI command, with description and flags/parameters. */
export const CLI_COMMANDS_TABLE: CliCommandRow[] = (() => {
  const rows: CliCommandRow[] = [];
  for (const row of FUNCTIONALITY_MATRIX) {
    const commands = row.cli
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const desc = row.functionality;
    const params = row.cliParameters ?? [];
    for (let i = 0; i < commands.length; i++) {
      rows.push({ command: commands[i], description: desc, parameters: params[i] ?? "—" });
    }
  }
  return rows;
})();

export interface LearnMoreCardItem {
  label: string;
  title: string;
  description: string;
  href: string;
  imageUrl?: string;
  /** Call-to-action text (e.g. "Visit repo"). Defaults to "Read more →". */
  ctaLabel?: string;
}

/** Repository card (first in Learn more). Uses official GitHub Mark. */
export const LEARN_MORE_REPO_CARD: LearnMoreCardItem = {
  label: "Repository",
  title: "Neotoma on GitHub",
  description:
    "Source code, README with installation and MCP setup, and the deterministic state layer architecture. Clone, contribute, or open issues.",
  href: "https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#neotoma",
  imageUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  ctaLabel: "Visit repo →",
};

export const LEARN_MORE_GUARANTEES_CARD: LearnMoreCardItem = {
  label: "Deep dive",
  title: "Memory guarantees explained",
  description:
    "State integrity, deterministic evolution, state invariants, and why agent reliability depends on them. Architecture, pipeline, and guarantee reference.",
  href: "/architecture",
  ctaLabel: "Read architecture →",
};

export const LEARN_MORE_POSTS: LearnMoreCardItem[] = [
  {
    label: "Related post",
    title: "Neotoma developer release",
    description:
      "Announcing the developer release: local CLI, MCP, and API with tunnel support; for developers comfortable with early-stage tooling and feedback.",
    href: "https://markmhendrickson.com/posts/neotoma-developer-release",
    imageUrl: "https://markmhendrickson.com/images/posts/neotoma-developer-release-hero.png",
  },
  {
    label: "Related post",
    title: "Your AI remembers your vibe but not your work",
    description:
      "A breakdown of convenience memory, retrieval memory, and durable operational memory, and why they are not interchangeable.",
    href: "https://markmhendrickson.com/posts/your-ai-remembers-your-vibe-but-not-your-work",
    imageUrl:
      "https://markmhendrickson.com/images/posts/your-ai-remembers-your-vibe-but-not-your-work-hero.png",
  },
  {
    label: "Related post",
    title: "Building a truth layer for persistent agent memory",
    description:
      "Why a deterministic, inspectable memory substrate for AI tools matters and how Neotoma fits.",
    href: "https://markmhendrickson.com/posts/truth-layer-agent-memory",
    imageUrl: "https://markmhendrickson.com/images/posts/truth-layer-agent-memory-hero.png",
  },
  {
    label: "Related post",
    title: "Agent memory has a truth problem",
    description:
      "Why retrieval dominates early, where it fails for ongoing state, and why local-first structured memory is hard but necessary.",
    href: "https://markmhendrickson.com/posts/agent-memory-truth-problem",
    imageUrl: "https://markmhendrickson.com/images/posts/agent-memory-truth-problem-hero.png",
  },
  {
    label: "Related post",
    title: "Six agentic trends I'm betting on (and how I might be wrong)",
    description:
      "The structural pressures that underpin my work, and what would invalidate them as the AI industry evolves. Neotoma is built in response to these assumptions.",
    href: "https://markmhendrickson.com/posts/six-agentic-trends-betting-on",
    imageUrl: "https://markmhendrickson.com/images/posts/six-agentic-trends-betting-on-hero.png",
  },
  {
    label: "Related post",
    title: "Why agent memory needs more than RAG",
    description:
      "Why similarity search works for exploration but breaks for durable state, and how schema-first memory closes the gap.",
    href: "https://markmhendrickson.com/posts/why-agent-memory-needs-more-than-rag",
    imageUrl:
      "https://markmhendrickson.com/images/posts/why-agent-memory-needs-more-than-rag-hero.png",
  },
  {
    label: "Related post",
    title: "Agent command centers need one source of truth",
    description:
      "Positioning Neotoma as the backend for agent dashboards and command centers; multi-layer memory above the state layer.",
    href: "https://markmhendrickson.com/posts/agent-command-centers-source-of-truth",
    imageUrl:
      "https://markmhendrickson.com/images/posts/agent-command-centers-source-of-truth-hero.png",
  },
];

/** A failure mode with a label and Lucide icon name for the component to render. */
export interface FailureModeItem {
  label: string;
  /** Lucide icon name (e.g. "BookmarkX", "Unlink"); should symbolize this failure. */
  icon: string;
}

export interface IcpProfile {
  slug: string;
  /** Page title: use sentence case (e.g. "Builders of agentic systems"). */
  name: string;
  shortName: string;
  tagline: string;
  painPoints: string[];
  failureModes: FailureModeItem[];
  dataTypes: string[];
  schemaHotSpots: string[];
  solutionSummary: string;
}

export const ICP_PROFILES: IcpProfile[] = [
  {
    slug: "ai-infrastructure-engineers",
    name: "AI infrastructure engineers",
    shortName: "AI infrastructure engineers",
    tagline: "Two runs. Same inputs. Different state.",
    painPoints: [
      "Cannot reproduce agent runs: same inputs yield different state",
      "State mutations invisible to debugging and observability tooling",
      "Debugging production failures requires manual log archaeology",
      "No provenance trail for state changes across pipeline steps",
      "No portable state layer; agent memory locked to one vendor's runtime",
      "Agent state routed through third-party services with no data residency or compliance guarantees",
    ],
    failureModes: [
      { label: "Non-reproducible agent runs in production", icon: "Repeat" },
      { label: "Invisible state mutation across sessions", icon: "EyeOff" },
      { label: "No provenance linking outputs to source data", icon: "LinkOff" },
      { label: "Ordering-sensitive state drift across orchestration steps", icon: "GitBranch" },
      { label: "No proof of data residency or access control for compliance", icon: "ShieldAlert" },
      { label: "State layer locked to one vendor; no portability across runtimes", icon: "Lock" },
    ],
    dataTypes: [
      "session state",
      "agent actions",
      "pipelines",
      "evaluations",
      "audit trails",
      "run state",
      "orchestration logs",
      "tool configs",
      "runbooks",
      "entity graphs",
    ],
    schemaHotSpots: [
      "agent_session",
      "action",
      "pipeline",
      "evaluation",
      "audit_event",
      "tool_config",
    ],
    solutionSummary:
      "Neotoma replaces the glue you've been hand-rolling (checkpoint logic, state serialization, custom diffing) with deterministic primitives. Append-only observations, versioned history, and replayable timelines become infrastructure you build on, not plumbing you maintain.",
  },
  {
    slug: "agentic-systems-builders",
    name: "Builders of agentic systems",
    shortName: "Agent system builders",
    tagline: "Your agent resolves entities by inference. Every session, it guesses again.",
    painPoints: [
      "No shared state for agents: token-based or conversation-only; no cross-session, cross-agent state",
      "No provenance: cannot trace agent decisions or outputs to source data",
      "No deterministic layer: need reproducible, explainable state for eval, debug, and compliance",
      "Fragmented context across orchestration steps and multi-agent workflows",
      "Sensitive client data flows through external memory services with no storage or access audit",
    ],
    failureModes: [
      { label: "Silent state mutation between agent sessions", icon: "ZapOff" },
      { label: "Non-replayable pipelines; can't reconstruct agent reasoning", icon: "RotateCcw" },
      { label: "Context loss across orchestration steps and agent handoffs", icon: "Hand" },
      {
        label: "Evaluation gaps; no audit trail linking outputs to source facts",
        icon: "FileText",
      },
      { label: "Client data in third-party memory with no access audit", icon: "ShieldAlert" },
      { label: "Framework-specific memory; no portability across agent tools", icon: "Lock" },
    ],
    dataTypes: [
      "session state",
      "agent actions",
      "pipelines",
      "evaluations",
      "audit trails",
      "conversations",
      "tool outputs",
      "tool configs",
      "runbooks",
      "entity graphs",
    ],
    schemaHotSpots: [
      "agent_session",
      "action",
      "pipeline",
      "evaluation",
      "audit_event",
      "tool_config",
    ],
    solutionSummary:
      "Neotoma removes the tax your team pays compensating for unreliable memory. Entities resolve once and persist. State evolves through versioned, auditable transitions. Every fact traces to provenance. Cross-session state with full audit trail.",
  },
  {
    slug: "ai-native-operators",
    name: "AI-native individual operators",
    shortName: "AI-native operators",
    tagline: "The agent infers. It doesn't guarantee. Here's what that costs you.",
    painPoints: [
      "No persistent state across sessions; every AI conversation starts from zero",
      "Fragmented document sources scattered across email, drives, and screenshots",
      "Repetitive context-setting in every new AI interaction",
      "Lost commitments and forgotten action items between sessions",
      "Personal data (receipts, contacts, preferences) stored in provider memory with no control over retention or training use",
    ],
    failureModes: [
      { label: "Lost commitments across tools", icon: "BookmarkX" },
      { label: "Tool-to-tool context loss", icon: "Unlink" },
      { label: "Silent state drift over time", icon: "Activity" },
      { label: "Weak correction loop; no way to fix what the agent got wrong", icon: "RefreshCw" },
      {
        label: "Personal data in opaque provider memory with no deletion control",
        icon: "ShieldAlert",
      },
      { label: "Memory locked to one vendor's ecosystem", icon: "Lock" },
    ],
    dataTypes: [
      "tasks",
      "preferences",
      "contacts",
      "deadlines",
      "notes",
      "conversations",
      "receipts",
      "travel docs",
      "meeting notes",
    ],
    schemaHotSpots: ["conversation", "message", "agent_message", "note", "task"],
    solutionSummary:
      "Neotoma removes the tax you pay re-explaining your world to every tool. Every conversation, entity, and commitment persists as versioned state. Switch between Claude, Cursor, and Codex without losing context. Correct once and the correction sticks.",
  },
];

export const SITE_METADATA = {
  canonicalUrl: "https://neotoma.io/",
  ogImageUrl: "https://neotoma.io/neotoma-og-1200x630.png",
  pageTitle: "Neotoma | Deterministic state layer for long-running agents",
  pageDescription:
    "Deterministic agent state layer for long-running agents: deterministic state evolution, versioned, schema-bound, replayable, auditable. No silent mutation. Agents install Neotoma themselves.",
  heroImageUrl: "neotoma-hero.png",
};

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="1" stop-color="#2d1b69"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#bg)"/>
  <text x="16" y="22" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="white">N</text>
</svg>`;
