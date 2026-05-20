import repoInfo from "./repo_info.json";

/** Version from package.json (updated by scripts/repo_info.ts). */
export const REPO_VERSION: string = repoInfo.version;
/** Published GitHub releases count (updated by scripts/repo_info.ts). */
export const REPO_RELEASES_COUNT: number = repoInfo.releasesCount;
/** GitHub stargazers count (build-time fallback, refreshed client-side). */
export const REPO_STARS_COUNT: number =
  typeof repoInfo.starsCount === "number" && Number.isFinite(repoInfo.starsCount)
    ? repoInfo.starsCount
    : 0;

export interface SiteSection {
  id: string;
  label: string;
  /** Short label for sidebar nav (e.g. "Bugs" instead of "Report or fix bugs") */
  shortLabel: string;
  /** Icon name for sidebar (e.g. "Bug", "Terminal", "OpenCode") */
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
  database: GuaranteeLevel;
  neotoma: GuaranteeLevel;
}

export const MEMORY_GUARANTEE_ROWS: MemoryGuaranteeRow[] = [
  {
    property: "Deterministic state evolution",
    slug: "deterministic-state-evolution",
    tooltip:
      "Given the same set of observations, the system always produces the same entity state regardless of when or in what order they are processed. This eliminates ordering bugs and makes state transitions predictable and testable. Note: structured agent writes are fully deterministic. AI-based extraction from unstructured files is auditable (model, prompt hash, and config are logged) but is not replay-deterministic across model versions.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    database: "not-provided",
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
    database: "not-provided",
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
    database: "not-provided",
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
    database: "not-provided",
    neotoma: "guaranteed",
  },
  {
    property: "Schema constraints",
    slug: "schema-constraints",
    tooltip:
      "Entities conform to defined types and validation rules. Type mismatches are flagged at store time and missing fields generate warnings, preventing garbage-in-garbage-out failures across agents.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    database: "partial",
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
    database: "common",
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
    database: "common",
    neotoma: "prevented",
  },
  {
    property: "False closure risk",
    slug: "false-closure-risk",
    tooltip:
      "The likelihood that an agent confidently answers from stale or superseded context because the system cannot distinguish resolved decisions from open questions. Without versioned history and provenance, a settled policy from six months ago looks identical to a current one.",
    platform: "common",
    retrieval: "common",
    file: "common",
    database: "common",
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
    database: "not-provided",
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
    database: "partial",
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
    database: "not-provided",
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
    database: "not-provided",
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
    database: "not-provided",
    neotoma: "not-provided",
  },
  {
    property: "Privacy-first local storage",
    slug: "privacy-first-local-storage",
    tooltip:
      "Whether your data stays on your machine by default with no cloud sync, telemetry, or third-party access. Neotoma runs entirely locally \u2014 your data never leaves your machine unless you explicitly configure remote access. Platform memory is stored on vendor servers subject to their privacy policies.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "guaranteed",
    database: "guaranteed",
    neotoma: "guaranteed",
  },
  {
    property: "Full data export and portability",
    slug: "full-data-export-portability",
    tooltip:
      "Whether you can export all stored data in standard formats and move it to another system. Neotoma stores everything in a local SQLite database you own, with CLI export commands and a REST API. Platform memory may offer limited or no export capabilities.",
    platform: "not-provided",
    retrieval: "partial",
    file: "guaranteed",
    database: "guaranteed",
    neotoma: "guaranteed",
  },
  {
    property: "Strong consistency",
    slug: "strong-consistency",
    tooltip:
      "Core records, entities, and events are immediately visible after write. There is no eventual-consistency lag between write and read for the structured store; bounded-eventual delay applies only to optional secondary indices like search (~5s) and embeddings (~10s).",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    database: "guaranteed",
    neotoma: "guaranteed",
  },
  {
    property: "Transactional writes",
    slug: "transactional-writes",
    tooltip:
      "All graph inserts (entities, observations, relationships) commit in a single transaction. Either everything succeeds or nothing changes; there is no partial state where one half of a write landed and the other half did not.",
    platform: "not-provided",
    retrieval: "not-provided",
    file: "not-provided",
    database: "guaranteed",
    neotoma: "guaranteed",
  },
];

export const MEMORY_MODEL_VENDORS: Record<string, string> = {
  platform: "Claude, ChatGPT, Gemini, Copilot",
  retrieval: "Mem0, Zep, LangChain Memory",
  file: "Markdown files, JSON stores, CRDT docs",
  database: "SQLite, Postgres, MySQL",
  neotoma: "Neotoma",
};

export const MEMORY_TYPE_SLUGS: Record<string, string> = {
  platform: "memory-models#platform-memory",
  retrieval: "memory-models#retrieval-memory",
  file: "memory-models#file-based-memory",
  database: "memory-models#database-memory",
  neotoma: "memory-models#deterministic-memory",
};

export interface FoundationCard {
  title: string;
  icon: string;
  lines: string[];
  link: string;
}

export const FOUNDATIONS: FoundationCard[] = [
  {
    title: "Privacy-first",
    icon: "ShieldCheck",
    link: "/foundations#privacy-first",
    lines: [
      "Your data stays local. Never used for training.",
      "User-controlled storage, optional encryption at rest.",
      "Nothing is stored unless you approve it. No background scanning, no implicit captures.",
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
    title: "Immutable and verifiable",
    icon: "Lock",
    link: "/foundations#immutable",
    lines: [
      "Every observation is append-only. History cannot be rewritten.",
      "Hash-based entity IDs ensure tamper-evident records.",
      "Full provenance chain from any state to its source.",
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

/** @deprecated alias kept temporarily for downstream imports during the 3->4 foundations expansion. */
export const THREE_FOUNDATIONS: FoundationCard[] = FOUNDATIONS;

export const SITE_SECTIONS: SiteSection[] = [
  { id: "intro", label: "Intro", shortLabel: "Intro", icon: "Zap" },
  { id: "outcomes", label: "Before / After", shortLabel: "Before / After", icon: "AlertTriangle" },
  { id: "who", label: "Who", shortLabel: "Who", icon: "Users" },
  { id: "memory-guarantees", label: "Guarantees", shortLabel: "Guarantees", icon: "ShieldCheck" },
  { id: "record-types", label: "Record types", shortLabel: "Types", icon: "BookOpen" },
  { id: "evaluate", label: "Evaluate", shortLabel: "Evaluate", icon: "ClipboardCheck" },
  {
    id: "common-questions",
    label: "Common questions",
    shortLabel: "Questions",
    icon: "HelpCircle",
  },
];

export interface DocNavItem {
  label: string;
  href: string;
  /** Lucide icon name for collapsed sidebar (e.g. "Download", "Terminal"). */
  icon?: string;
}

export interface DocNavCategory {
  title: string;
  /** Shorter label for the docs sidebar group header (uppercase in UI). Omit to use `title`. */
  sidebarTitle?: string;
  items: DocNavItem[];
}

/**
 * Use case marketing routes. Excluded from doc sidebar, header search, and sitemap (noindex in SEO).
 * Routes remain reachable via direct URL and in-page links (e.g. Build vs buy, use cases index).
 */
export const USE_CASE_LANDING_PATHS: readonly string[] = [
  "/use-cases",
  "/compliance",
  "/crm",
  "/contracts",
  "/diligence",
  "/portfolio",
  "/cases",
  "/financial-ops",
  "/procurement",
  "/agent-auth",
  "/healthcare",
  "/government",
  "/customer-ops",
  "/logistics",
  "/personal-data",
  "/trading",
  "/crypto-engineering",
];

export const DOC_NAV_CATEGORIES: DocNavCategory[] = [
  {
    title: "Getting started",
    items: [
      { label: "Documentation", href: "/docs", icon: "Home" },
      { label: "Evaluate", href: "/evaluate", icon: "ClipboardCheck" },
      { label: "Meet the creator", href: "/meet", icon: "CalendarClock" },
      { label: "What to store first", href: "/what-to-store", icon: "BookOpen" },
      { label: "Install", href: "/install", icon: "Download" },
      { label: "Test safely", href: "/non-destructive-testing", icon: "FlaskConical" },
      { label: "Backup and restore", href: "/backup", icon: "Database" },
      { label: "Connect remotely", href: "/connect", icon: "Plug" },
      { label: "Expose tunnel", href: "/tunnel", icon: "SatelliteDish" },
      { label: "Walkthrough", href: "/walkthrough", icon: "Waypoints" },
    ],
  },
  {
    title: "Architecture",
    items: [
      { label: "Foundations", href: "/foundations", icon: "Shield" },
      { label: "Memory guarantees", href: "/memory-guarantees", icon: "ShieldCheck" },
      { label: "Architecture", href: "/architecture", icon: "Layers" },
      { label: "Memory models", href: "/memory-models", icon: "Boxes" },
    ],
  },
  {
    title: "Hosted",
    items: [
      { label: "Hosted Neotoma", href: "/hosted", icon: "Server" },
      { label: "Public sandbox", href: "/sandbox", icon: "Globe" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { label: "ChatGPT", href: "/neotoma-with-chatgpt", icon: "MessageCircle" },
      { label: "Claude", href: "/neotoma-with-claude", icon: "MessageSquare" },
      { label: "Claude Code", href: "/neotoma-with-claude-code", icon: "Code" },
      { label: "Codex", href: "/neotoma-with-codex", icon: "Monitor" },
      { label: "Cursor", href: "/neotoma-with-cursor", icon: "PanelRight" },
      { label: "IronClaw", href: "/neotoma-with-ironclaw", icon: "IronClaw" },
      { label: "OpenClaw", href: "/neotoma-with-openclaw", icon: "Sparkles" },
      { label: "OpenCode", href: "/neotoma-with-opencode", icon: "OpenCode" },
    ],
  },
  {
    title: "Skills",
    items: [
      { label: "All skills", href: "/skills", icon: "Bot" },
      { label: "Ensure Neotoma", href: "/skills/ensure-neotoma", icon: "Download" },
      { label: "Remember Email", href: "/skills/remember-email", icon: "Mail" },
      { label: "Remember Conversations", href: "/skills/remember-conversations", icon: "MessageSquare" },
      { label: "Remember Meetings", href: "/skills/remember-meetings", icon: "Users" },
      { label: "Remember Finances", href: "/skills/remember-finances", icon: "Receipt" },
      { label: "Remember Contacts", href: "/skills/remember-contacts", icon: "BookUser" },
      { label: "Remember Calendar", href: "/skills/remember-calendar", icon: "CalendarClock" },
      { label: "Remember Codebase", href: "/skills/remember-codebase", icon: "Code" },
      { label: "Store Data", href: "/skills/store-data", icon: "Database" },
      { label: "Query Memory", href: "/skills/query-memory", icon: "Search" },
    ],
  },
  {
    title: "Record types",
    items: [
      { label: "Contacts", href: "/types/contacts", icon: "Users" },
      { label: "Tasks", href: "/types/tasks", icon: "ListChecks" },
      { label: "Transactions", href: "/types/transactions", icon: "Receipt" },
      { label: "Contracts", href: "/types/contracts", icon: "Scale" },
      { label: "Decisions", href: "/types/decisions", icon: "Waypoints" },
      { label: "Events", href: "/types/events", icon: "CalendarClock" },
    ],
  },
  {
    title: "Primitive record types",
    sidebarTitle: "Primitives",
    items: [
      { label: "Overview", href: "/primitives", icon: "Layers" },
      { label: "Entities", href: "/primitives/entities", icon: "Users" },
      {
        label: "Entity snapshots",
        href: "/primitives/entity-snapshots",
        icon: "Boxes",
      },
      { label: "Sources", href: "/primitives/sources", icon: "Database" },
      {
        label: "Interpretations",
        href: "/primitives/interpretations",
        icon: "Sparkles",
      },
      {
        label: "Observations",
        href: "/primitives/observations",
        icon: "Fingerprint",
      },
      {
        label: "Relationships",
        href: "/primitives/relationships",
        icon: "GitCompare",
      },
      {
        label: "Timeline events",
        href: "/primitives/timeline-events",
        icon: "CalendarClock",
      },
    ],
  },
  {
    title: "Schemas",
    sidebarTitle: "Schemas",
    items: [
      { label: "Overview", href: "/schemas", icon: "Layers" },
      { label: "Schema registry", href: "/schemas/registry", icon: "Database" },
      {
        label: "Merge policies",
        href: "/schemas/merge-policies",
        icon: "GitMerge",
      },
      {
        label: "Storage layers",
        href: "/schemas/storage-layers",
        icon: "Boxes",
      },
      {
        label: "Versioning & evolution",
        href: "/schemas/versioning",
        icon: "GitBranch",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "REST API", href: "/api", icon: "Globe" },
      { label: "MCP server", href: "/mcp", icon: "Server" },
      { label: "CLI", href: "/cli", icon: "Terminal" },
      { label: "Inspector", href: "/inspector", icon: "ScanSearch" },
      { label: "AAuth", href: "/aauth", icon: "Key" },
      { label: "Peer sync", href: "/peer-sync", icon: "Network" },
      { label: "Subscriptions", href: "/subscriptions", icon: "Radio" },
      { label: "Issue reporting", href: "/issue-reporting", icon: "Bug" },
      { label: "Security hardening", href: "/security-hardening", icon: "Lock" },
      { label: "Memory guarantees", href: "/memory-guarantees", icon: "ShieldCheck" },
      { label: "Memory models", href: "/memory-models", icon: "Container" },
      { label: "Foundations", href: "/foundations", icon: "Layers" },
      {
        label: "Problem statement",
        href: "/foundation/problem-statement",
        icon: "HelpCircle",
      },
      { label: "Agent instructions", href: "/agent-instructions", icon: "Bot" },
      { label: "Architecture", href: "/architecture", icon: "Building2" },
      { label: "Terminology", href: "/terminology", icon: "Bookmark" },
      { label: "Troubleshooting", href: "/troubleshooting", icon: "Bug" },
      { label: "FAQ", href: "/faq", icon: "HelpCircle" },
      { label: "Changelog", href: "/changelog", icon: "History" },
      {
        label: "All pages (Markdown)",
        href: "/site-markdown",
        icon: "FileText",
      },
    ],
  },
  {
    title: "Inspector",
    items: [
      { label: "Overview", href: "/inspector", icon: "ScanSearch" },
      { label: "Dashboard & health", href: "/inspector/dashboard", icon: "LayoutGrid" },
      { label: "Entities", href: "/inspector/entities", icon: "Boxes" },
      {
        label: "Observations & sources",
        href: "/inspector/observations-and-sources",
        icon: "History",
      },
      {
        label: "Relationships & graph",
        href: "/inspector/relationships-and-graph",
        icon: "Waypoints",
      },
      { label: "Schemas", href: "/inspector/schemas", icon: "Database" },
      {
        label: "Timeline & interpretations",
        href: "/inspector/timeline",
        icon: "History",
      },
      {
        label: "Conversations & turns",
        href: "/inspector/conversations",
        icon: "MessageSquare",
      },
      {
        label: "Agents & grants",
        href: "/inspector/agents",
        icon: "Bot",
      },
      { label: "Search", href: "/inspector/search", icon: "Search" },
      { label: "Settings", href: "/inspector/settings", icon: "Settings" },
    ],
  },
  {
    title: "Where the tax shows up",
    sidebarTitle: "The tax",
    items: [
      { label: "Context janitor", href: "/operating", icon: "SatelliteDish" },
      { label: "Inference variance", href: "/building-pipelines", icon: "Zap" },
      { label: "Log archaeology", href: "/debugging-infrastructure", icon: "Cpu" },
    ],
  },
  {
    title: "Compare",
    items: [
      { label: "Build vs buy", href: "/build-vs-buy", icon: "Scale" },
      { label: "Multi-agent shared state", href: "/multi-agent-state", icon: "Layers" },
      { label: "Neotoma vs platform memory", href: "/neotoma-vs-platform-memory", icon: "Globe" },
      { label: "Neotoma vs Mem0", href: "/neotoma-vs-mem0", icon: "Boxes" },
      { label: "Neotoma vs Zep", href: "/neotoma-vs-zep", icon: "History" },
      { label: "Neotoma vs RAG", href: "/neotoma-vs-rag", icon: "Search" },
      { label: "Neotoma vs file-based memory", href: "/neotoma-vs-files", icon: "FileText" },
      { label: "Neotoma vs database memory", href: "/neotoma-vs-database", icon: "Database" },
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
  onboardingSequence: "evaluation -> installation -> activation -> tooling config",
  activationSequence: "detect context -> discover -> propose -> preview -> ingest -> reconstruct -> query -> correct",
  installCommands: `# 1. Install globally (required for agent harnesses — avoids per-repo PATH prompts)
npm install -g neotoma

# 2. Inspect state in one call (no shell introspection needed)
neotoma doctor --json

# 3. Run the full idempotent setup for the current harness
neotoma setup --tool claude-code --yes   # or: --tool cursor | --tool codex | --tool openclaw
neotoma hooks install --tool opencode --yes   # optional OpenCode lifecycle hooks`,
  agentInstallPrompt: `Read https://neotoma.io/install and carry me through the install-first Neotoma flow.

Use \`neotoma\` commands for status and setup. If Neotoma is already installed, start with \`neotoma doctor --json\`; otherwise install it and run \`neotoma setup --tool <my_tool> --yes\`.

Avoid ad-hoc shell introspection or arbitrary repo scripts. Then activate Neotoma with my data and configure my current tool for robust ongoing use.`,
  postInstallCommands: `# Run API server (development)
neotoma api start --env dev

# Run API server (production)
neotoma api start --env prod`,
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
  /** Stdio harness → local HTTP `/mcp` via `mcp proxy` (unsigned dev shim; see docs/developer/mcp/proxy.md). */
  unsignedStdioDevShimMcpJson: `{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_unsigned_stdio_dev_shim.sh",
      "env": {
        "NEOTOMA_MCP_USE_LOCAL_PORT_FILE": "1",
        "NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE": "dev"
      }
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
  /** Short prompt — home evaluate section + integration “Getting started” blocks. */
  homeEvaluatePrompt: `Read https://neotoma.io/evaluate. Use any tool, workspace, and chat context already available in this session to assess my real workflow. Avoid ad-hoc shell introspection just to profile me; if Neotoma is already installed, use \`neotoma doctor --json\` for status instead. Then tell me whether Neotoma fits my workflow, what data would be highest value to persist first, and whether you recommend a non-destructive test at https://neotoma.io/non-destructive-testing before any full implementation rollout.`,
  agentEvaluationPrompt: `Read https://neotoma.io/evaluate. Use any tool, workspace, and chat context already available in this session to assess my real workflow. Avoid ad-hoc shell introspection just to profile me; if Neotoma is already installed, use \`neotoma doctor --json\` for status instead. Then tell me whether Neotoma is a real fit for my workflow, what data would be highest value to persist first, and whether you recommend offering a non-destructive test at https://neotoma.io/non-destructive-testing before any full implementation rollout.`,
  agentEvaluationShareEmail: "contact@neotoma.io",
  agentEvaluationShareSubject: "Agent evaluation of Neotoma",
  dockerCliExample: `# Store an entity
docker exec neotoma neotoma store \\
  --json='[{"entity_type":"task","title":"Submit expense report","status":"open"}]'

# List entities
docker exec neotoma neotoma entities list --type task`,
  cliStoreExample: `neotoma store --json='[{"entity_type":"task","title":"Submit expense report","status":"open"}]'`,
  cliListExample: `neotoma entities list --type company --limit 10`,
  /**
   * Per-harness permissions preflight snippets.
   *
   * Each snippet adds the minimal set of allow rules so the agent never needs
   * individual approvals for `neotoma doctor`, `neotoma setup`, `neotoma init`,
   * or any other `neotoma` subcommand. Users paste these *before* asking the
   * agent to run the install prompt.
   */
  preflightClaudeCode: `// Paste into .claude/settings.local.json (project) or ~/.claude/settings.json (user).
// Merge with any existing "permissions.allow" list.
{
  "permissions": {
    "allow": [
      "Bash(neotoma:*)",
      "Bash(npm install -g neotoma:*)"
    ]
  }
}`,
  preflightCursor: `// Paste into .cursor/allowlist.json (project).
// Cursor will then auto-approve any \`neotoma ...\` command plus the one-time
// global install.
{
  "allow": [
    "neotoma *",
    "npm install -g neotoma"
  ]
}`,
  preflightCodex: `# Append to ~/.codex/config.toml (user scope).
# Codex uses this to auto-approve commands matching each pattern.
[approvals]
allow = [
  "neotoma *",
  "npm install -g neotoma",
]`,
  cliUploadExample: `neotoma ingest ./fixtures/invoice.pdf
neotoma ingest ./doc.pdf --no-interpret --mime-type application/pdf
neotoma ingest --offline ./invoice.pdf   # run in-process, no API server required`,
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
  - index 1: { entity_type: "conversation_message", role: "user", sender_kind: "user", content: "<exact message>", turn_key: "{conversation_id}:{turn_id}" }
  - index 2+: optional extracted entities implied by the message
- relationships in same store call:
  - PART_OF from source_index 1 -> target_index 0
  - REFERS_TO from source_index 1 -> each extracted entity index (2+)
- idempotency_key: "conversation-{conversation_id}-{turn_id}-{suffix}" or "conversation-chat-<turn>-{suffix}"

Attachment/image turn:
- Use one store call with conversation + conversation_message, and file_path (or file_content + mime_type) in the same request.
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
  - store(entities, idempotency_key, relationships, file_path | file_content+mime_type, file_idempotency_key?, interpretation?, …)
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
      "Writing to Neotoma via the unified store path: entities, raw file bytes (sources), or both together.",
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
    cliParameters: ["--query, --entity-type"],
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
    cli: "schemas analyze, schemas recommend, schemas update, schemas register",
    cliParameters: ["--entity-type", "--entity-type", "--entity-type", "—"],
    mcp: "analyze_schema_candidates, get_schema_recommendations, update_schema_incremental, register_schema",
    mcpParameters: ["entity_type, entity_id?", "entity_type", "entity_type, new_fields", "schema"],
    testCoverage:
      "cli_schema_commands, mcp_schema_actions, mcp_schema_variations, schema_recommendation (service), schema_recommendation_integration",
  },
  {
    functionality:
      "Store structured entities, raw file bytes (sources), or both in one request (unified).",
    openapi: "POST /store",
    endpointDescriptions: [
      "Unified store: optional `entities`, optional `file_path` or (`file_content` + `mime_type`), `relationships`, `interpretation`, `idempotency_key` per OpenAPI.",
    ],
    endpointParameters: ["body: unified store payload (see OpenAPI `store`)"],
    cli: "store, ingest",
    cliParameters: ["--json / --file / --file-path, …", "<path> (ingest)"],
    mcp: "store",
    mcpParameters: [
      "entities?, file_path|file_content+mime_type?, idempotency_key, relationships?, interpretation?, …",
    ],
    testCoverage:
      "cli_store_commands, cli_to_mcp_store, mcp_store_variations, mcp_store_unstructured, mcp_store_parquet, nonjson_csv_store_behavior, fixture_mcp_store_replay",
  },
  {
    functionality: "Submit a correction or reinterpret a source.",
    openapi: "POST /correct, POST /reinterpret",
    endpointDescriptions: ["Submit a correction.", "Reinterpret a source."],
    endpointParameters: ["body: entity_id, field, value", "body: source_id"],
    cli: "corrections create, interpretations reinterpret",
    cliParameters: ["—", "<source_id>"],
    mcp: "correct",
    mcpParameters: ["entity_id, field, value"],
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
  {
    functionality: "Parse a file into agent-readable text without storing.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "schemas analyze <filePath>",
    cliParameters: ["<filePath>"],
    mcp: "parse_file",
    mcpParameters: ["file_path or file_content+mime_type"],
    testCoverage: "mcp_store_variations",
  },
  {
    functionality: "Check for a newer npm package version.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "—",
    cliParameters: [],
    mcp: "npm_check_update",
    mcpParameters: ["packageName?"],
    testCoverage: "—",
  },
  {
    functionality: "Health check.",
    openapi: "GET /health",
    endpointDescriptions: ["Check if server is running."],
    endpointParameters: ["—"],
    cli: "api status",
    cliParameters: ["--env dev|prod"],
    mcp: "—",
    testCoverage: "api_health",
  },
  {
    functionality: "OpenAPI specification.",
    openapi: "GET /openapi.yaml",
    endpointDescriptions: ["Get OpenAPI spec for API documentation."],
    endpointParameters: ["—"],
    cli: "—",
    cliParameters: [],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Initialize Neotoma (data dirs, DB, encryption, .env).",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "init",
    cliParameters: ["--data-dir, --force, --skip-db, --skip-env"],
    mcp: "—",
    testCoverage: "cli_init",
  },
  {
    functionality: "Reset local Neotoma state to clean slate.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "reset",
    cliParameters: ["--yes"],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Start, stop, or manage the API server.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "api start, api stop, api status, api logs, api processes",
    cliParameters: [
      "--env, --background, --tunnel, --tunnel-provider",
      "--env",
      "--env",
      "--env",
      "—",
    ],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Configure or check MCP server entries in IDE configs.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "mcp guide, mcp config",
    cliParameters: ["--no-check", "--user-level, --mcp-transport"],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Guide or install CLI agent instructions for IDEs.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "cli guide, cli config",
    cliParameters: ["—", "--user-level, --scope, --yes"],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Stream record changes in real time.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "watch",
    cliParameters: ["--interval, --json, --human, --tail"],
    mcp: "—",
    testCoverage: "cli_watch",
  },
  {
    functionality: "Show or change storage paths and merge databases.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "storage info, storage set-data-dir, storage merge-db",
    cliParameters: [
      "—",
      "--move-db-files, --on-conflict, --yes",
      "--source, --target, --mode, --dry-run",
    ],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Create or restore a backup.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "backup create, backup restore",
    cliParameters: ["--output", "--from, --target"],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Read persistent log files.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "logs tail",
    cliParameters: ["--decrypt, --lines, --file"],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Interactive session with persistent prompt.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "session",
    cliParameters: ["--servers"],
    mcp: "—",
    testCoverage: "cli_session_startup_ux",
  },
  {
    functionality: "Run npm scripts from the repo.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "dev list, dev <script>",
    cliParameters: ["—", "-- <args>"],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Interpret uninterpreted sources (backfill).",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "interpretations interpret-uninterpreted",
    cliParameters: ["--limit, --dry-run, --interpretation-config"],
    mcp: "—",
    testCoverage: "—",
  },
  {
    functionality: "Log out or get MCP auth token.",
    openapi: "—",
    endpointDescriptions: [],
    endpointParameters: [],
    cli: "auth logout, auth mcp-token",
    cliParameters: ["—", "—"],
    mcp: "—",
    testCoverage: "cli_auth_commands",
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
  /** Homepage-only second paragraph: imperative "Stop …" then the positive shift (see cards on home). */
  homepageTransition: string;
  /** Operational mode label (e.g. "Operating", "Building", "Debugging"). */
  modeLabel: string;
  /** Lucide icon name rendered on the homepage card (e.g. "Server"). */
  iconName: string;
  /** Role the ICP is escaping in this mode (e.g. "Context janitor"). */
  escaping: string;
  /** Role the ICP transforms into (e.g. "Operator with continuity"). */
  into: string;
  /** Interaction pattern shift summary (e.g. "Turn-by-turn prompting → review-and-steer"). */
  interactionShift: string;
  /** Tax the ICP pays in this mode without Neotoma. */
  taxPaid: string;
  /** What the ICP recovers when the tax is removed. */
  taxRecovered: string;
  painPoints: string[];
  failureModes: FailureModeItem[];
  dataTypes: string[];
  schemaHotSpots: string[];
  solutionSummary: string;
}

export const ICP_PROFILES: IcpProfile[] = [
  {
    slug: "operating",
    name: "You're the context janitor between tools",
    shortName: "Context janitor",
    tagline:
      "Every session starts from zero. You re-explain context, re-prompt corrections, re-establish what the agent already knew.",
    homepageTransition:
      "Stop acting as the human sync layer between tools. Start operating with continuity — steering instead of re-explaining.",
    modeLabel: "Cross-tool sync",
    iconName: "ArrowLeftRight",
    escaping: "Context janitor — human sync layer between tools",
    into: "Operator with continuity — steering, not driving",
    interactionShift: "Turn-by-turn prompting → review-and-steer",
    taxPaid: "Re-prompting, context re-establishment, manual cross-tool sync",
    taxRecovered: "Attention, continuity, trust in your tools",
    painPoints: [
      "Every session starts from zero; nothing your agent learns carries over",
      "Context scattered across email, drives, screenshots, and chat histories",
      "You re-explain the same project, preferences, and constraints in every conversation",
      "Commitments and action items vanish between sessions and tools",
      "Your personal data lives in provider memory you don't control",
    ],
    failureModes: [
      { label: "Commitments lost between tools", icon: "BookmarkX" },
      { label: "Context breaks when you switch tools", icon: "Unlink" },
      { label: "Facts silently drift over time", icon: "Activity" },
      { label: "Corrections don't stick", icon: "RefreshCw" },
      { label: "Stale decisions resurface as if current", icon: "Clock" },
      { label: "Personal data in provider memory with no deletion control", icon: "ShieldAlert" },
      { label: "Memory locked to one vendor", icon: "Lock" },
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
    schemaHotSpots: ["conversation", "conversation_message", "note", "task"],
    solutionSummary:
      "Neotoma removes the tax you pay re-explaining your world to every tool. Store a fact once and it's available everywhere — Claude, Cursor, Codex, ChatGPT. Correct once and it sticks.",
  },
  {
    slug: "building-pipelines",
    name: "You're babysitting inference variance",
    shortName: "Inference variance",
    tagline:
      "Your agent guesses entities every run. Corrections don\u2019t persist. Regressions ship because the architecture can\u2019t prevent them.",
    homepageTransition:
      "Stop babysitting inference variance. Build on solid ground — state that stays corrected from run to run.",
    modeLabel: "Pipeline state",
    iconName: "Workflow",
    escaping: "Babysitting inference — absorbing variance the architecture doesn't handle",
    into: "Builder who ships on solid ground",
    interactionShift: "Compensating for memory → building on top of it",
    taxPaid: "Prompt workarounds, dedup hacks, memory regression fixes",
    taxRecovered: "Product velocity, shipping confidence, roadmap ambition",
    painPoints: [
      "No shared memory across sessions or agents; everything resets",
      "Can't trace agent decisions back to the facts they were based on",
      "Same pipeline, different results — no reproducible state to compare",
      "Context fragments across orchestration steps and agent handoffs",
      "Client data flows through memory services you can't audit",
    ],
    failureModes: [
      { label: "Memory silently mutates between sessions", icon: "ZapOff" },
      { label: "Can't replay a pipeline to understand what went wrong", icon: "RotateCcw" },
      { label: "Context lost across orchestration steps", icon: "Hand" },
      { label: "No trail linking agent output to source facts", icon: "FileText" },
      { label: "Resolved decisions retrieved as open questions", icon: "Clock" },
      { label: "Client data in third-party memory with no access audit", icon: "ShieldAlert" },
      { label: "Memory locked to one framework", icon: "Lock" },
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
      "Neotoma removes the tax you pay compensating for unreliable memory. Entities resolve once and persist. Every fact traces back to its source. New features compound instead of regressing.",
  },
  {
    slug: "debugging-infrastructure",
    name: "You're the log archaeologist",
    shortName: "Log archaeology",
    tagline: "Two runs. Same inputs. Different state. No replay, no diff, no explanation.",
    homepageTransition:
      "Stop reverse-engineering truth from logs. Debug from replayable state you can inspect, diff, and trust.",
    modeLabel: "Replay & debug",
    iconName: "Bug",
    escaping: "Log archaeologist — reverse-engineering truth from logs",
    into: "Platform engineer with replayable state",
    interactionShift: "Manual orchestration → declarative trust",
    taxPaid: "Writing glue (checkpoint logic, custom diffing, state serialization)",
    taxRecovered: "Debugging speed, platform design time, sleep",
    painPoints: [
      "Same inputs produce different state across runs — no way to detect why",
      "State changes are invisible to your observability stack",
      "Debugging means reading logs and guessing at what the agent believed",
      "No trail connecting state changes to the pipeline step that caused them",
      "Memory locked to one vendor's runtime; switching means starting over",
      "Agent state routed through services with no data residency guarantees",
    ],
    failureModes: [
      { label: "Agent runs aren't reproducible", icon: "Repeat" },
      { label: "State mutates invisibly between sessions", icon: "EyeOff" },
      { label: "Can't trace output back to source data", icon: "LinkOff" },
      { label: "State drifts depending on processing order", icon: "GitBranch" },
      { label: "Stale state served confidently with no version trail", icon: "Clock" },
      { label: "No proof of data residency for compliance", icon: "ShieldAlert" },
      { label: "State layer locked to one vendor", icon: "Lock" },
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
      "Neotoma replaces the glue you write by hand — checkpoint logic, state serialization, custom diffing — with primitives that just work. Replay any timeline, diff any state, trace any output to its source.",
  },
];

export const SITE_METADATA = {
  canonicalUrl: "https://neotoma.io/",
  ogImageUrl: "https://neotoma.io/neotoma-og-1200x630.png",
  pageTitle: "Your agents forget. Neotoma makes them remember.",
  pageDescription:
    "State integrity for AI agents, not retrieval quality. Versioned contacts, tasks, decisions, finances \u2014 stored once, queryable everywhere. Open-source and local-first.",
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
