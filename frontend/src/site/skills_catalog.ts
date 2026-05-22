import { neotomaGithubBlobUrl, neotomaGithubRawUrl } from "@/site/neotoma_repo";

export interface ExternalTool {
  name: string;
  type: "mcp" | "cli" | "file" | "api";
  description: string;
  /** Optional documentation or project URL (shown in the skill detail sidebar). */
  url?: string;
}

export interface WorkflowStep {
  phase: string;
  title: string;
  description: string;
}

export interface SkillCatalogEntry {
  slug: string;
  namingTier: "generic" | "neotoma_branded";
  name: string;
  tagline: string;
  description: string;
  tier: 1 | 2 | 3;
  harnesses: string[];
  dataSources: string[];
  entityTypes: string[];
  externalTools: ExternalTool[];
  relatedSkills: string[];
  relatedUseCases: string[];
  installCommands: Record<string, string>;
  workflowSteps: WorkflowStep[];
  /**
   * Repo-relative path to this skill’s SKILL.md for agent instructions.
   * Defaults to `skills/{slug}/SKILL.md` when omitted.
   */
  skillMarkdownRepoPath?: string;
}

const ALL_HARNESSES = ["Cursor", "Claude Code", "Codex", "Windsurf"];

/** Repo-relative path to SKILL.md used for agent-facing install and usage instructions. */
export function getSkillInstructionMarkdownRepoPath(skill: SkillCatalogEntry): string {
  return skill.skillMarkdownRepoPath ?? `skills/${skill.slug}/SKILL.md`;
}

export function getSkillInstructionMarkdownBlobUrl(skill: SkillCatalogEntry): string {
  return neotomaGithubBlobUrl(getSkillInstructionMarkdownRepoPath(skill));
}

export function getSkillInstructionMarkdownRawUrl(skill: SkillCatalogEntry): string {
  return neotomaGithubRawUrl(getSkillInstructionMarkdownRepoPath(skill));
}

const NEOTOMA_SETUP_INSTALL: Record<string, string> = {
  Cursor: "neotoma setup --tool cursor --yes",
  "Claude Code": "neotoma setup --tool claude-code --yes",
  Codex: "neotoma setup --tool codex --yes",
  Windsurf: "neotoma setup --yes",
};

export const SKILLS_CATALOG: SkillCatalogEntry[] = [
  {
    slug: "ensure-neotoma",
    /** Meta bootstrap: canonical human+agent procedure lives in install.md. */
    skillMarkdownRepoPath: "install.md",
    namingTier: "neotoma_branded",
    name: "Ensure Neotoma",
    tagline: "Install Neotoma, configure MCP, and verify connectivity",
    description:
      "Meta skill that bootstraps Neotoma for your AI agent. Checks if the CLI is installed, guides installation via npm, runs `neotoma setup` for your harness (MCP config, CLI instructions, hooks, permissions, and skills), and verifies MCP connectivity. Every other memory skill references this as a prerequisite.",
    tier: 1,
    harnesses: ALL_HARNESSES,
    dataSources: [],
    entityTypes: [],
    externalTools: [
      {
        name: "Node.js / npm",
        type: "cli",
        description: "Required for installing the Neotoma CLI",
        url: "https://nodejs.org/",
      },
    ],
    relatedSkills: ["remember-email", "remember-conversations", "store-data", "query-memory"],
    relatedUseCases: [],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "1", title: "Check CLI availability", description: "Runs `npx neotoma doctor` to detect installation status" },
      { phase: "2", title: "Install if needed", description: "Guides `npm install -g neotoma` when the CLI is not found" },
      { phase: "3", title: "Run setup", description: "Executes `neotoma setup --yes` to configure MCP, hooks, and permissions" },
      { phase: "4", title: "Verify connectivity", description: "Calls `get_session_identity` to confirm the MCP connection is live" },
    ],
  },
  {
    slug: "remember-email",
    namingTier: "generic",
    name: "Remember Email",
    tagline: "Import emails into persistent memory",
    description:
      "Configure an email MCP server, discover and preview emails, and extract structured entities — contacts, tasks, events, and transactions — from email content. Each entity traces back to a specific email via provenance.",
    tier: 1,
    harnesses: ALL_HARNESSES,
    dataSources: ["Gmail MCP", "IMAP MCP", "Email exports"],
    entityTypes: ["contact", "task", "event", "email_message", "transaction"],
    externalTools: [
      {
        name: "Gmail MCP",
        type: "mcp",
        description: "OAuth-authenticated access to Gmail",
        url: "https://github.com/googleworkspace/mcp-gmail",
      },
      {
        name: "IMAP MCP",
        type: "mcp",
        description: "Generic IMAP email access",
        url: "https://github.com/modelcontextprotocol/servers",
      },
    ],
    relatedSkills: ["remember-contacts", "remember-calendar", "ensure-neotoma"],
    relatedUseCases: ["crm", "personal-data", "compliance"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "0", title: "Verify prerequisites", description: "Ensure Neotoma and email MCP are configured" },
      { phase: "1", title: "Discover emails", description: "Search by sender, date range, or query" },
      { phase: "2", title: "Preview and confirm", description: "Show what will be imported and extracted" },
      { phase: "3", title: "Hydrate and extract", description: "Read full email content and extract entities" },
      { phase: "4", title: "Store with provenance", description: "Persist entities with per-email data_source" },
    ],
  },
  {
    slug: "remember-conversations",
    namingTier: "generic",
    name: "Remember Conversations",
    tagline: "Import chat history into persistent memory",
    description:
      "Import conversation history from ChatGPT JSON exports, Claude history files, Slack archives, or shared conversation URLs. Reconstructs a timeline of decisions, commitments, and context with full provenance.",
    tier: 1,
    harnesses: ALL_HARNESSES,
    dataSources: ["ChatGPT JSON export", "Claude history", "Slack archive", "Shared URLs"],
    entityTypes: ["conversation", "conversation_message", "decision", "task", "contact"],
    externalTools: [
      {
        name: "Web scraper MCP",
        type: "mcp",
        description: "For scraping shared conversation URLs",
        url: "https://github.com/microsoft/playwright-mcp",
      },
    ],
    relatedSkills: ["remember-meetings", "store-data", "ensure-neotoma"],
    relatedUseCases: ["personal-data"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "0", title: "Verify Neotoma", description: "Confirm MCP connectivity" },
      { phase: "1", title: "Identify source", description: "Detect file format (ChatGPT JSON, Slack export, etc.)" },
      { phase: "2", title: "Parse and preview", description: "List conversations with dates and message counts" },
      { phase: "3", title: "Extract entities", description: "Pull out decisions, tasks, contacts, events" },
      { phase: "4", title: "Reconstruct timeline", description: "Build a provenance-traced timeline of key events" },
    ],
  },
  {
    slug: "store-data",
    namingTier: "generic",
    name: "Store Data",
    tagline: "Persist any structured data into memory",
    description:
      "Generic skill for storing structured entities or files in Neotoma memory with proper provenance and relationship linking. Works with any entity type — contacts, tasks, events, transactions, notes, and more.",
    tier: 1,
    harnesses: ALL_HARNESSES,
    dataSources: ["Chat context", "Files", "API responses"],
    entityTypes: ["contact", "task", "event", "transaction", "note", "receipt"],
    externalTools: [],
    relatedSkills: ["query-memory", "ensure-neotoma"],
    relatedUseCases: ["personal-data", "crm", "compliance", "contracts"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "1", title: "Check for duplicates", description: "Search for existing records before storing" },
      { phase: "2", title: "Extract entities", description: "Parse structured data from the user's input" },
      { phase: "3", title: "Store with provenance", description: "Persist with idempotency key and relationships" },
      { phase: "4", title: "Confirm", description: "Report what was stored using memory-related language" },
    ],
  },
  {
    slug: "query-memory",
    namingTier: "generic",
    name: "Query Memory",
    tagline: "Retrieve what your agent knows about anything",
    description:
      "Generic retrieval skill for querying Neotoma memory. Supports identifier lookups, type-scoped searches, temporal queries, relationship traversal, and field provenance tracing.",
    tier: 1,
    harnesses: ALL_HARNESSES,
    dataSources: ["Neotoma memory"],
    entityTypes: [],
    externalTools: [],
    relatedSkills: ["store-data", "ensure-neotoma"],
    relatedUseCases: ["personal-data", "crm", "compliance"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "1", title: "Identify query type", description: "Identifier lookup, type search, or temporal query" },
      { phase: "2", title: "Retrieve entities", description: "Use the appropriate Neotoma retrieval tool" },
      { phase: "3", title: "Expand context", description: "Follow relationships and provenance as needed" },
      { phase: "4", title: "Present results", description: "Format findings with source attribution" },
    ],
  },
  {
    slug: "remember-meetings",
    namingTier: "generic",
    name: "Remember Meetings",
    tagline: "Extract decisions and action items from meeting transcripts",
    description:
      "Ingest meeting transcripts from Zoom, Otter, Google Meet, or manual notes. Extracts decisions, action items, attendees, and commitments into structured entities with provenance tracing back to specific transcript passages.",
    tier: 2,
    harnesses: ALL_HARNESSES,
    dataSources: ["VTT files", "SRT files", "TXT transcripts", "Markdown notes"],
    entityTypes: ["event", "decision", "task", "contact", "note"],
    externalTools: [
      {
        name: "Google Calendar MCP",
        type: "mcp",
        description: "Optional enrichment with event metadata",
        url: "https://github.com/googleworkspace/mcp-google-calendar",
      },
    ],
    relatedSkills: ["remember-calendar", "remember-contacts", "ensure-neotoma"],
    relatedUseCases: ["personal-data", "crm"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "0", title: "Verify Neotoma", description: "Confirm MCP connectivity" },
      { phase: "1", title: "Identify transcripts", description: "Locate and detect transcript format" },
      { phase: "2", title: "Parse and preview", description: "Show meeting date, participants, key topics" },
      { phase: "3", title: "Extract entities", description: "Pull decisions, tasks, attendees from content" },
      { phase: "4", title: "Store with provenance", description: "Preserve raw transcript as source" },
    ],
  },
  {
    slug: "remember-finances",
    namingTier: "generic",
    name: "Remember Finances",
    tagline: "Import bank statements, receipts, and invoices",
    description:
      "Import financial documents — CSV/PDF bank statements, receipt images, invoice PDFs — and extract structured transactions with amounts, dates, merchants, and categories. Preserves the original document as a source for audit provenance.",
    tier: 2,
    harnesses: ALL_HARNESSES,
    dataSources: ["CSV bank statements", "PDF statements", "Receipt images", "Invoice PDFs", "Plaid API"],
    entityTypes: ["transaction", "receipt", "invoice", "contact"],
    externalTools: [
      {
        name: "Plaid MCP",
        type: "mcp",
        description: "Optional live bank data access",
        url: "https://plaid.com/docs/",
      },
    ],
    relatedSkills: ["store-data", "ensure-neotoma"],
    relatedUseCases: ["financial-ops", "personal-data"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "0", title: "Verify Neotoma", description: "Confirm MCP connectivity" },
      { phase: "1", title: "Identify documents", description: "Locate financial files and detect format" },
      { phase: "2", title: "Parse and preview", description: "Show transaction count, date range, totals" },
      { phase: "3", title: "Extract transactions", description: "Structured extraction with consistent entity_type" },
      { phase: "4", title: "Store with provenance", description: "Preserve raw document as source" },
    ],
  },
  {
    slug: "remember-contacts",
    namingTier: "generic",
    name: "Remember Contacts",
    tagline: "Consolidate contacts from all your data sources",
    description:
      "Build a unified, deduplicated contact list from email headers, calendar attendees, chat participants, vCard files, and LinkedIn exports. Merges duplicates by email and name to create a comprehensive contact graph.",
    tier: 2,
    harnesses: ALL_HARNESSES,
    dataSources: ["Email MCP", "Calendar MCP", "vCard files", "LinkedIn CSV", "Chat exports"],
    entityTypes: ["contact"],
    externalTools: [
      {
        name: "Gmail MCP",
        type: "mcp",
        description: "Extract contacts from email headers",
        url: "https://github.com/googleworkspace/mcp-gmail",
      },
      {
        name: "Google Calendar MCP",
        type: "mcp",
        description: "Extract attendees from events",
        url: "https://github.com/googleworkspace/mcp-google-calendar",
      },
    ],
    relatedSkills: ["remember-email", "remember-calendar", "ensure-neotoma"],
    relatedUseCases: ["crm", "personal-data"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "0", title: "Verify Neotoma", description: "Confirm MCP connectivity" },
      { phase: "1", title: "Identify sources", description: "Determine which contact sources are available" },
      { phase: "2", title: "Collect and deduplicate", description: "Gather contacts and merge by email/name" },
      { phase: "3", title: "Preview and confirm", description: "Show new vs existing contacts" },
      { phase: "4", title: "Store contacts", description: "Persist with deduplication and provenance" },
    ],
  },
  {
    slug: "remember-calendar",
    namingTier: "generic",
    name: "Remember Calendar",
    tagline: "Import calendar events and scheduling commitments",
    description:
      "Import calendar events from a live calendar MCP or ICS file exports. Extracts scheduling commitments, attendees, and recurring patterns into structured entities.",
    tier: 2,
    harnesses: ALL_HARNESSES,
    dataSources: ["Google Calendar MCP", "Apple Calendar (ICS)", "Outlook (ICS)"],
    entityTypes: ["event", "contact", "task", "place"],
    externalTools: [
      {
        name: "Google Calendar MCP",
        type: "mcp",
        description: "Live calendar event access",
        url: "https://github.com/googleworkspace/mcp-google-calendar",
      },
    ],
    relatedSkills: ["remember-contacts", "remember-meetings", "ensure-neotoma"],
    relatedUseCases: ["personal-data"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "0", title: "Verify Neotoma", description: "Confirm MCP connectivity" },
      { phase: "1", title: "Identify source", description: "Check for calendar MCP or ICS file" },
      { phase: "2", title: "Retrieve and preview", description: "List events in the specified date range" },
      { phase: "3", title: "Extract entities", description: "Create events, contacts, tasks, places" },
      { phase: "4", title: "Store with provenance", description: "Link events to attendees and sources" },
    ],
  },
  {
    slug: "remember-codebase",
    namingTier: "generic",
    name: "Remember Codebase",
    tagline: "Persistent developer context for your repositories",
    description:
      "Build a persistent inventory of your development context — repositories, architecture decisions, key dependencies, and team knowledge — so your agent understands your codebase across sessions without re-prompting.",
    tier: 3,
    harnesses: ALL_HARNESSES,
    dataSources: ["Git metadata", "package.json", "README", "Architecture docs", "ADR files"],
    entityTypes: ["repository", "decision", "note", "contact"],
    externalTools: [],
    relatedSkills: ["store-data", "ensure-neotoma"],
    relatedUseCases: ["crypto-engineering"],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "0", title: "Verify Neotoma", description: "Confirm MCP connectivity" },
      { phase: "1", title: "Inventory repo", description: "Read project metadata and structure" },
      { phase: "2", title: "Extract entities", description: "Create repository, decision, and convention entities" },
      { phase: "3", title: "Store with provenance", description: "Link entities to source files" },
      { phase: "4", title: "Wire MCP", description: "Verify project-level MCP configuration" },
    ],
  },
  {
    slug: "recover-sqlite-database",
    namingTier: "neotoma_branded",
    name: "Recover SQLite Database",
    tagline: "Check integrity and recover a corrupted Neotoma database",
    description:
      "Troubleshooting skill for when Neotoma's local SQLite database becomes corrupted. Checks integrity, runs `.recover`, and guides the user through swapping the recovered database file.",
    tier: 3,
    harnesses: ALL_HARNESSES,
    dataSources: ["Neotoma SQLite database"],
    entityTypes: [],
    externalTools: [
      {
        name: "sqlite3",
        type: "cli",
        description: "SQLite CLI for integrity checks and recovery",
        url: "https://www.sqlite.org/cli.html",
      },
    ],
    relatedSkills: ["ensure-neotoma"],
    relatedUseCases: [],
    installCommands: NEOTOMA_SETUP_INSTALL,
    workflowSteps: [
      { phase: "1", title: "Check integrity", description: "Run `PRAGMA integrity_check` on the database" },
      { phase: "2", title: "Run recovery", description: "Execute `.recover` to extract data from corrupted pages" },
      { phase: "3", title: "Swap database", description: "Guide user through replacing the corrupted file" },
    ],
  },
];

export function getSkillBySlug(slug: string): SkillCatalogEntry | undefined {
  return SKILLS_CATALOG.find((s) => s.slug === slug);
}

export function getSkillsByTier(tier: 1 | 2 | 3): SkillCatalogEntry[] {
  return SKILLS_CATALOG.filter((s) => s.tier === tier);
}
