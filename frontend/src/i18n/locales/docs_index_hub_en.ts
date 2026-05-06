/** Documentation hub (`/docs`) card grid — English source with stable `id` per category for CTA + locale merges. */

export interface DocHubCard {
  label: string;
  href: string;
  desc: string;
}

export interface DocHubCategory {
  id: string;
  title: string;
  items: DocHubCard[];
}

export const DOC_INDEX_HUB_EN: DocHubCategory[] = [
  {
    id: "getting_started",
    title: "Getting started",
    items: [
      {
        label: "Evaluate",
        href: "/evaluate",
        desc: "Have your agent read this page to decide whether Neotoma fits your workflow",
      },
      { label: "Install", href: "/install", desc: "Install and initialize Neotoma locally" },
      {
        label: "What to store first",
        href: "/what-to-store",
        desc: "Pick the first durable facts, commitments, and source-backed records to persist",
      },
      {
        label: "Backup and restore",
        href: "/backup",
        desc: "Protect the SQLite database, source files, and reconstruction history",
      },
      {
        label: "Expose tunnel",
        href: "/tunnel",
        desc: "Use HTTPS tunnels when remote MCP clients cannot launch local stdio",
      },
      {
        label: "Walkthrough",
        href: "/walkthrough",
        desc: "End-to-end example across operating, building, and debugging",
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    items: [
      {
        label: "ChatGPT",
        href: "/neotoma-with-chatgpt",
        desc: "Deterministic memory for ChatGPT conversations",
      },
      {
        label: "Claude",
        href: "/neotoma-with-claude",
        desc: "Structured state alongside Claude platform memory",
      },
      {
        label: "Claude Code",
        href: "/neotoma-with-claude-code",
        desc: "Persistent memory for Claude Code's local CLI agent",
      },
      {
        label: "Codex",
        href: "/neotoma-with-codex",
        desc: "Cross-task memory and CLI fallback",
      },
      {
        label: "Cursor",
        href: "/neotoma-with-cursor",
        desc: "Persistent memory alongside Cursor context",
      },
      {
        label: "IronClaw",
        href: "/neotoma-with-ironclaw",
        desc: "Structured MCP memory for IronClaw agents",
      },
      {
        label: "OpenClaw",
        href: "/neotoma-with-openclaw",
        desc: "User-owned memory for OpenClaw agents",
      },
      {
        label: "OpenCode",
        href: "/neotoma-with-opencode",
        desc: "Lifecycle hooks and MCP memory for OpenCode",
      },
    ],
  },
  {
    id: "reference",
    title: "Reference",
    items: [
      { label: "Install", href: "/install", desc: "Install and initialize Neotoma locally" },
      { label: "REST API", href: "/api", desc: "OpenAPI endpoints and parameters" },
      { label: "MCP server", href: "/mcp", desc: "Model Context Protocol actions" },
      { label: "CLI", href: "/cli", desc: "Commands, flags, and REPL" },
      {
        label: "Memory guarantees",
        href: "/memory-guarantees",
        desc: "All memory properties on one page",
      },
      {
        label: "Memory models",
        href: "/memory-models",
        desc: "Platform, retrieval, file-based, and deterministic memory compared",
      },
      {
        label: "Foundations",
        href: "/foundations",
        desc: "Privacy-first architecture and cross-platform design",
      },
      {
        label: "Agent instructions",
        href: "/agent-instructions",
        desc: "Mandatory behavioral rules for agents using Neotoma",
      },
      {
        label: "Architecture",
        href: "/architecture",
        desc: "State flow, guarantees, and principles",
      },
      { label: "Terminology", href: "/terminology", desc: "Glossary of key concepts" },
      {
        label: "Troubleshooting",
        href: "/troubleshooting",
        desc: "Common failure modes and practical fixes",
      },
      {
        label: "Changelog",
        href: "/changelog",
        desc: "Release history and documentation updates",
      },
      {
        label: "All pages (Markdown)",
        href: "/site-markdown",
        desc: "Every indexable route as Markdown (SEO summaries)",
      },
    ],
  },
  {
    id: "skills",
    title: "Skills",
    items: [
      {
        label: "All skills",
        href: "/skills",
        desc: "Guided workflows that teach your agent to import and remember data",
      },
      {
        label: "Remember Email",
        href: "/skills/remember-email",
        desc: "Import emails and extract contacts, tasks, and events",
      },
      {
        label: "Remember Conversations",
        href: "/skills/remember-conversations",
        desc: "Import ChatGPT, Claude, and Slack history into memory",
      },
    ],
  },
  {
    id: "primitive_record_types",
    title: "Primitive record types",
    items: [
      {
        label: "Overview",
        href: "/primitives",
        desc: "The seven system-level building blocks behind every entity, snapshot, and audit trail",
      },
      {
        label: "Entities",
        href: "/primitives/entities",
        desc: "Canonical row for every person, company, or thing, deterministic ID, aliases, and merge tracking",
      },
      {
        label: "Entity snapshots",
        href: "/primitives/entity-snapshots",
        desc: "Reducer output with per-field provenance back to observations and an optional embedding column",
      },
      {
        label: "Sources",
        href: "/primitives/sources",
        desc: "Content-addressed raw storage with SHA-256 deduplication per user",
      },
      {
        label: "Interpretations",
        href: "/primitives/interpretations",
        desc: "Versioned, audited extraction attempts with full interpretation_config provenance",
      },
      {
        label: "Observations",
        href: "/primitives/observations",
        desc: "Granular, immutable facts that the reducer composes into entity snapshots",
      },
      {
        label: "Relationships",
        href: "/primitives/relationships",
        desc: "First-class typed graph edges that follow the same observation-snapshot pattern",
      },
      {
        label: "Timeline events",
        href: "/primitives/timeline-events",
        desc: "Source-anchored temporal records derived deterministically from extracted dates",
      },
    ],
  },
  {
    id: "schemas",
    title: "Schemas",
    items: [
      {
        label: "Overview",
        href: "/schemas",
        desc: "Versioned, config-driven definitions that give the immutable primitives their domain shape",
      },
      {
        label: "Schema registry",
        href: "/schemas/registry",
        desc: "The table that holds every versioned schema_definition + reducer_config, global or per-user",
      },
      {
        label: "Merge policies",
        href: "/schemas/merge-policies",
        desc: "Per-field declarative rules, last_write, highest_priority, most_specific, merge_array",
      },
      {
        label: "Storage layers",
        href: "/schemas/storage-layers",
        desc: "raw_text, properties, and raw_fragments, the three places extracted data can land",
      },
      {
        label: "Versioning & evolution",
        href: "/schemas/versioning",
        desc: "Semver, additive minor bumps, breaking major bumps, and the public schema snapshots dump",
      },
      {
        label: "Schema management (CLI)",
        href: "/schema-management",
        desc: "CLI workflows for listing, validating, evolving, and registering schemas at runtime",
      },
    ],
  },
  {
    id: "where_tax",
    title: "Where the tax shows up",
    items: [
      {
        label: "Context janitor",
        href: "/operating",
        desc: "You re-explain context every session. State that persists across tools.",
      },
      {
        label: "Inference variance",
        href: "/building-pipelines",
        desc: "Corrections don\u2019t stick. Deterministic state for agent pipelines.",
      },
      {
        label: "Log archaeology",
        href: "/debugging-infrastructure",
        desc: "Same inputs, different state. Replayable timelines and diffs.",
      },
    ],
  },
  {
    id: "compare",
    title: "Compare",
    items: [
      {
        label: "Build vs buy",
        href: "/build-vs-buy",
        desc: "When to adopt a state-integrity layer instead of building around observability alone",
      },
      {
        label: "Neotoma vs platform memory",
        href: "/neotoma-vs-platform-memory",
        desc: "Convenience inside one AI product versus portable, auditable state across tools",
      },
      {
        label: "Neotoma vs Mem0",
        href: "/neotoma-vs-mem0",
        desc: "Retrieval memory for prompt augmentation versus deterministic entity state",
      },
      {
        label: "Neotoma vs Zep",
        href: "/neotoma-vs-zep",
        desc: "Knowledge-graph retrieval versus versioned, schema-bound state",
      },
      {
        label: "Neotoma vs RAG",
        href: "/neotoma-vs-rag",
        desc: "Relevant chunk retrieval versus exact state reconstruction",
      },
      {
        label: "Neotoma vs file-based memory",
        href: "/neotoma-vs-files",
        desc: "Markdown and JSON portability versus structured guarantees and provenance",
      },
      {
        label: "Neotoma vs database memory",
        href: "/neotoma-vs-database",
        desc: "CRUD rows versus append-only observations and deterministic reducers",
      },
    ],
  },
  {
    id: "external",
    title: "External",
    items: [
      {
        label: "GitHub repository",
        href: "https://github.com/markmhendrickson/neotoma",
        desc: "Source code, README, and issues",
      },
      {
        label: "npm package",
        href: "https://www.npmjs.com/package/neotoma",
        desc: "Install via npm",
      },
    ],
  },
];
