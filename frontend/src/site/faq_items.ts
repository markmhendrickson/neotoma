/**
 * FAQ content only — imported by FaqPage, SeoHead metadata, and site search.
 * Kept out of FaqPage.tsx to avoid a circular import: seo_metadata → FaqPage → DetailPage → SeoHead → seo_metadata.
 */

export interface FaqItem {
  question: string;
  answer: string;
  detail?: string;
  link?: { href: string; label: string };
}

/** Stable fragment id for `/faq#...` (site search, deep links). */
export function faqQuestionToSectionId(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return slug || "faq";
}

/** Shared with MemoryGuaranteesPage and site search slug derivation. */
export const FAQ_QUESTION_GIT_LIKE_AGENT_MEMORY =
  "How does Neotoma compare to tools that offer Git-like version control for agent memory?";

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is a deterministic state layer for AI agents?",
    answer:
      "A deterministic state layer guarantees that the same observations always produce the same entity state. Neotoma uses append-only observation logs, hash-based entity IDs, and schema constraints to give agents versioned, reproducible, auditable memory that never silently mutates.",
    detail:
      "Unlike retrieval memory (Mem0, Zep) or platform memory (Claude, ChatGPT), a deterministic state layer provides formal guarantees: versioned history, replayable timelines, auditable change logs, and reproducible state reconstruction from raw inputs alone.",
    link: { href: "/architecture", label: "Architecture" },
  },
  {
    question: "How does Neotoma compare to Mem0 and Zep?",
    answer:
      "Mem0 and Zep use retrieval-augmented memory: vector embeddings, semantic search, and probabilistic matching. Neotoma uses deterministic state: append-only logs, schema-bound entities, and reducers that always produce the same snapshot from the same observations.",
    detail:
      "Retrieval memory is useful for context injection into prompts. Deterministic memory is necessary when you need to reconstruct the exact state of an entity at a past point in time, resolve multi-writer conflicts consistently, or prove provenance for audits.",
    link: { href: "/memory-models", label: "Memory models comparison" },
  },
  {
    question: "What's the difference between RAG memory and deterministic memory?",
    answer:
      "RAG memory stores text chunks and retrieves them by semantic similarity. Deterministic memory stores structured observations and composes entity state via reducers. RAG answers 'what is relevant?'; deterministic memory answers 'what was true?'",
    detail:
      "RAG is optimized for prompt augmentation. Deterministic memory is optimized for state integrity: temporal queries, multi-writer consistency, schema validation, and reproducible reconstruction.",
    link: { href: "/memory-models", label: "Memory models" },
  },
  {
    question: "Why can't I just use markdown files for agent memory?",
    answer:
      "Markdown files are maximally portable and human-editable, but they conflate observations with snapshots. When two agents write conflicting values, both edits land silently. There is no schema validation, no conflict detection, and no way to reconstruct entity state at a past moment. Git provides file-level versioning but not field-level provenance or deterministic merge logic.",
    link: { href: "/neotoma-vs-files", label: "Neotoma vs file-based memory" },
  },
  {
    question: FAQ_QUESTION_GIT_LIKE_AGENT_MEMORY,
    answer:
      "Those products usually version a shared context tree, rules pack, or prompt bundle so teams can sync what coding agents read. Neotoma is a structured state layer: append-only observations, schema-bound entities, reducers, and field-level provenance, with replay and diff on entity state across MCP-connected tools—not Git operations on a single vendor context package.",
    detail:
      "Git-style workflows address collaboration and drift for agent-facing files. Neotoma answers a different core question: what was true at time T, from which source, and how did state change? The two can complement (synced context plus Neotoma as system of record) or substitute when you need cross-tool structured memory beyond one codebase context.",
    link: { href: "/memory-guarantees", label: "Memory guarantees" },
  },
  {
    question: "Why can't I just use SQLite or Postgres for agent memory?",
    answer:
      "A relational database provides strong consistency and column types, but standard CRUD (UPDATE in place) overwrites previous state. Without an observation log, reducers, and provenance tracking layered on top, you get last-write-wins semantics with no audit trail, no conflict detection, and no ability to reconstruct historical entity state. Neotoma uses a database as its storage backend but adds the architecture that delivers memory guarantees.",
    link: { href: "/neotoma-vs-database", label: "Neotoma vs database memory" },
  },
  {
    question: "What does Neotoma add on top of a database?",
    answer:
      "Neotoma adds an append-only observation log, deterministic reducers, a schema registry with write-time validation, field-level provenance tracking, content-addressed entity identity, and idempotent observation handling. The database stores the data; these architectural patterns deliver the guarantees.",
    link: { href: "/architecture", label: "Architecture" },
  },
  {
    question: "Should I use Neotoma alongside Claude Code's built-in memory?",
    answer:
      "Yes - they are complementary. Claude Code's auto-memory stores conversational preferences and project-specific notes within that platform. Neotoma stores durable structured state - contacts, tasks, decisions, financial data - with versioning, entity resolution, and cross-tool access via MCP. Platform memory is scoped to one tool; Neotoma persists across all your AI tools and survives session resets.",
    detail:
      'Think of platform memory as short-term context ("I prefer TypeScript") and Neotoma as long-term structured state ("Clayton owes us $5,000 since March 15, last contacted via the Q1 deal thread"). Both run simultaneously without conflict.',
    link: { href: "/neotoma-with-claude-code", label: "Neotoma with Claude Code" },
  },
  {
    question: "If Neotoma relies on LLMs to decide what to store, how is it deterministic?",
    answer:
      "Neotoma's determinism is a property of the data layer, not the agent layer. The LLM deciding which tool to call and what payload to send is stochastic - two runs may produce different observations. But everything below that boundary is deterministic: the same observations always produce the same entity snapshot, the same merge rules always resolve the same way, and the same inputs always generate the same IDs.",
    detail:
      "The architecture targets bounded convergence rather than strict replay determinism. Canonicalization collapses syntactically different but semantically equivalent LLM outputs to the same observation hash. Immutability ensures stochastic variance accumulates as history rather than corrupting truth. Reducers arbitrate conflicts deterministically regardless of write order. And entity merge repairs duplicates created by divergent agent runs. The result: the system converges toward a consistent entity graph over time, even when individual agent decisions vary.",
    link: { href: "/architecture", label: "Architecture" },
  },
  {
    question: "How does ingestion work - does Neotoma extract data automatically?",
    answer:
      "Neotoma is a store, not an extractor. Your agent decides what to observe, fills the parameters, and Neotoma versions it. There is no background scanning, no regex extraction, and no passive data collection. The agent drives every write.",
    detail:
      "This is a deliberate design choice: the agent has the context to know what matters. Neotoma provides the structured, versioned storage layer. The agent calls store with entities and observations; Neotoma handles entity resolution, schema validation, snapshot computation, and provenance tracking.",
    link: { href: "/architecture", label: "Architecture" },
  },
  {
    question: "What should my agent remember? How do I get started?",
    answer:
      "Start with what your agent already produces: conversations, contacts mentioned in chat, tasks and commitments (\"I need to\", \"remind me\"), and decisions. These store automatically with zero configuration once the agent rules are active. Within the first week, add financial data, calendar events, and project context as your personal OS grows.",
    detail:
      "Priority 1 (day one): conversations, contacts, tasks, decisions - lowest friction, highest compound value. Priority 2 (first week): financial data, calendar, email, health. Priority 3 (as the OS matures): content pipeline, project context, agent session state. The heuristic: if it benefits from recall, audit, replay, or linking to other entities, store it.",
    link: { href: "/docs", label: "Documentation" },
  },
  {
    question: "How do I install Neotoma?",
    answer:
      "Run 'npm install -g neotoma', then 'neotoma init' to choose your AI client and configure MCP. Start the API server with 'neotoma api start'. The full process takes under 5 minutes.",
    link: { href: "/install", label: "Install guide" },
  },
  {
    question: "Does Neotoma send my data to the cloud?",
    answer:
      "No. Neotoma runs locally by default. Your data stays on your machine in a local SQLite database. There is no cloud sync, no telemetry, and no training on your data. You can optionally expose the API via a tunnel for remote MCP clients.",
    link: { href: "/foundations", label: "Privacy-first architecture" },
  },
  {
    question: "What AI tools does Neotoma work with?",
    answer:
      "Neotoma works with any MCP-compatible AI tool: Cursor, Claude (Desktop and claude.ai), Claude Code, ChatGPT, Codex, and OpenClaw. It also provides a REST API and CLI for direct programmatic access.",
    link: { href: "/docs", label: "Integration guides" },
  },
  {
    question: "Is Neotoma free and open source?",
    answer:
      "Yes. Neotoma is MIT-licensed and fully open source. The npm package, CLI, API server, and MCP server are all free. The source code is on GitHub.",
  },
  {
    question: "What are Neotoma's memory guarantees?",
    answer:
      "Neotoma provides nine guarantees: deterministic state evolution, versioned history, replayable timeline, auditable change log, schema constraints, silent mutation prevention, conflicting facts detection, reproducible state reconstruction, and human inspectability.",
    link: { href: "/memory-guarantees", label: "Memory guarantees" },
  },
  {
    question: "What is an entity in Neotoma?",
    answer:
      "An entity is the canonical representation of a person, company, task, event, or other object. Each entity has a deterministic ID derived from its type and identifying fields, so the same real-world thing always resolves to the same entity.",
    link: { href: "/terminology", label: "Terminology" },
  },
  {
    question: "What is an observation in Neotoma?",
    answer:
      "An observation is an immutable, timestamped fact about an entity. Observations are never modified or deleted. Reducers merge all observations about an entity into a single snapshot representing current truth.",
    link: { href: "/terminology", label: "Terminology" },
  },
];
