import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { GLOSSARY_ROWS } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { StateFlowDiagram } from "../illustrations/StateFlowDiagram";
import { SectionDivider } from "../ui/section_divider";

const FOUNDATIONS = [
  {
    name: "Privacy-first",
    detail:
      "User-controlled memory, end-to-end encryption and row-level security, never used for training. Your data remains yours.",
  },
  {
    name: "Deterministic",
    detail:
      "Same input always produces same output. Schema-first extraction, hash-based entity IDs, full provenance. No hallucinations or probabilistic behavior.",
  },
  {
    name: "Cross-platform",
    detail:
      "Works with ChatGPT, Claude, Cursor, and Claude Code via MCP. One memory system across tools; no platform lock-in.",
  },
];

const PROBLEMS_SOLVED = [
  {
    problem: "Personal data is fragmented",
    solution:
      "Dual-path storing from file uploads and agent interactions into one source of truth.",
  },
  {
    problem: "Provider memory is conversation-only",
    solution:
      "Structured data memory with entity resolution and timelines across documents and agent-created data.",
  },
  {
    problem: "No trust when agents act",
    solution:
      "Explicit, named operations; visible inputs; reconstructable history. Replay and audit trail.",
  },
  {
    problem: "No cross-data reasoning",
    solution: "One graph: sources, entities, events, typed relationships.",
  },
  {
    problem: "Entity fragmentation",
    solution: 'Hash-based canonical IDs unify "Acme Corp" across all stored data.',
  },
  {
    problem: "No temporal reasoning",
    solution: "Automatic timeline generation from date fields.",
  },
  {
    problem: "Platform lock-in",
    solution: "MCP-based access; works with any compatible AI tool.",
  },
];

const GUARANTEES = [
  {
    name: "Deterministic reduction",
    detail:
      "Same observations always produce the same entity snapshot. No ordering sensitivity, no hidden state.",
  },
  {
    name: "Full provenance",
    detail:
      'Every field traces to a source, timestamp, and interpretation. You can always answer "where did this value come from?"',
  },
  {
    name: "Immutable history",
    detail:
      "Observations are append-only. Corrections add new observations; they do not erase previous ones.",
  },
  {
    name: "Timeline replay",
    detail:
      "Reconstruct entity state at any past point. Diff versions. Audit what changed and why.",
  },
  {
    name: "Schema-bound storage",
    detail:
      "Entity types have schemas. New fields extend the schema incrementally; nothing is untyped at rest.",
  },
];

const PREVIEW_GUARANTEED = [
  "No silent data loss: operations either succeed and are recorded or fail with explicit errors.",
  "Explicit, inspectable state mutations: every change is a named operation with visible inputs; state is reconstructable from the audit trail.",
  "Auditable operations: full provenance; CLI and MCP map to the same underlying contract.",
  "Same contract for CLI and MCP: both use the same OpenAPI-backed operations.",
];

const PREVIEW_NOT_GUARANTEED = [
  "Stable schemas",
  "Deterministic extraction across versions",
  "Long-term replay compatibility",
  "Backward compatibility",
];

const CORE_PRINCIPLES = [
  {
    name: "Deterministic",
    detail: "Same input, same output. No probabilistic behavior at the data layer.",
  },
  {
    name: "Schema-first",
    detail: "Entity types have schemas; extraction is structured, not freeform.",
  },
  {
    name: "Explainable",
    detail: "Every value traces to a source and operation. No opaque transformations.",
  },
  {
    name: "Entity-unified",
    detail: "Hash-based canonical IDs resolve duplicates across all data.",
  },
  { name: "Timeline-aware", detail: "Date fields generate timeline events automatically." },
  { name: "Cross-platform", detail: "MCP, CLI, and REST API expose the same contract." },
  {
    name: "Privacy-first",
    detail: "User-controlled. Never used for training. Encryption at rest.",
  },
  { name: "Immutable", detail: "Observations are append-only. History is never rewritten." },
  { name: "Provenance", detail: "Every fact links to its source, timestamp, and interpretation." },
  {
    name: "Explicit control",
    detail: "Nothing updates memory implicitly. The user decides what goes in.",
  },
  { name: "Four-layer model", detail: "Source → Interpretation → Observation → Entity Snapshot." },
];

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="group scroll-mt-6 text-[20px] font-medium tracking-[-0.02em] mt-14 mb-3">
      {children}
      <a
        href={`#${id}`}
        className="ml-2 inline-flex items-center text-muted-foreground no-underline border-none opacity-40 group-hover:opacity-70 hover:!opacity-100 hover:text-foreground transition"
        aria-label="Link to section"
      >
        #
      </a>
    </h2>
  );
}

export function ArchitecturePage() {
  return (
    <DetailPage title="Architecture">
      {/* The invariant */}
      <section className="mb-6">
        <p className="text-[15px] leading-7 font-medium text-foreground mb-4">
          Memory evolves deterministically. Given the same observations, Neotoma produces the same
          entity snapshots. Every state change is versioned with full provenance. Nothing mutates
          silently; nothing overwrites implicitly.
        </p>
        <p className="text-[15px] leading-7 text-muted-foreground">
          This means you can inspect any entity at any point in time, diff two versions, and replay
          the full sequence of changes that produced the current state.
        </p>
      </section>

      <SectionDivider />

      {/* State flow */}
      <SectionHeading id="state-flow">How state flows</SectionHeading>
      <div className="mb-6 max-w-md">
        <StateFlowDiagram />
      </div>
      <div className="rounded-lg border code-block-palette p-4 md:p-5 font-mono text-[13px] leading-6 overflow-x-auto mb-6">
        <p className="mb-1">Source (file, text, structured JSON)</p>
        <p className="mb-1 text-muted-foreground pl-4">&darr; interpret</p>
        <p className="mb-1">Observations (granular facts with provenance)</p>
        <p className="mb-1 text-muted-foreground pl-4">&darr; reduce (deterministic)</p>
        <p className="mb-1">Entity snapshots (current truth, versioned)</p>
        <p className="mb-1 text-muted-foreground pl-4">&darr; relate</p>
        <p>Memory graph (entities + relationships + timeline)</p>
      </div>

      <SectionDivider />

      {/* How data enters */}
      <SectionHeading id="how-data-enters">How data enters Neotoma</SectionHeading>
      <p className="text-[15px] leading-7 mb-4">
        Data enters through two paths. Which path runs depends on what the caller sends.
      </p>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-lg border border-border bg-card p-4 md:p-5 space-y-3">
          <p className="text-[14px] font-medium text-foreground">Structured path</p>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Agent calls <code className="bg-muted px-1 py-0.5 rounded text-[12px]">store</code> with
            an <code className="bg-muted px-1 py-0.5 rounded text-[12px]">entities</code> array
            (typed JSON). Observations are created directly. No LLM calls. No interpretation pipeline.
          </p>
          <p className="text-[13px] leading-5 text-muted-foreground">
            The agent&apos;s own reasoning produces the structured data. Neotoma validates against schema,
            deduplicates, and records with full provenance.
          </p>
          <p className="text-[12px] font-mono text-emerald-600 dark:text-emerald-400">
            Chat, tool output, agent-extracted facts &rarr; this path.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 md:p-5 space-y-3">
          <p className="text-[14px] font-medium text-foreground">Unstructured path</p>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Caller sends a file (PDF, image, CSV, text). Neotoma stores the raw content
            (content-addressed, immutable), then runs interpretation: text extraction followed by
            schema-first entity extraction.
          </p>
          <p className="text-[13px] leading-5 text-muted-foreground">
            CSV files use deterministic row mapping (no LLM). Other files use LLM extraction
            with <code className="bg-muted px-1 py-0.5 rounded text-[12px]">temperature:&nbsp;0</code> and
            a fixed seed for reproducibility. Interpretation creates new observations without modifying the source.
          </p>
          <p className="text-[12px] font-mono text-emerald-600 dark:text-emerald-400">
            File uploads, document ingestion &rarr; this path.
          </p>
        </div>
      </div>

      <p className="text-[15px] leading-7 font-medium text-foreground mb-2">
        The agent is the author; Neotoma is the ledger.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        Most agent interactions use the structured path. The agent decides what to store; Neotoma
        ensures it is schema-valid, deduplicated, and provenance-tracked. There is no hidden LLM
        between the agent and the data layer.
      </p>

      <SectionDivider />

      {/* Guarantees */}
      <SectionHeading id="guarantees">Guarantees</SectionHeading>
      <ul className="list-none pl-0 space-y-3 mb-6">
        {GUARANTEES.map((g) => (
          <li key={g.name} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0 font-medium" aria-hidden="true">
              &rarr;
            </span>
            <span>
              <strong>{g.name}.</strong> {g.detail}
            </span>
          </li>
        ))}
      </ul>

      <SectionDivider />

      {/* Three foundations */}
      <SectionHeading id="foundations">Three foundations</SectionHeading>
      <table className={RESPONSIVE_TABLE_CLASS}>
        <thead>
          <tr>
            <th className="min-w-[14ch]">Foundation</th>
            <th className="min-w-[36ch]">What it means</th>
          </tr>
        </thead>
        <tbody>
          {FOUNDATIONS.map((f) => (
            <tr key={f.name}>
              <td data-label="Foundation" className="font-medium">
                {f.name}
              </td>
              <td data-label={f.name} className="align-top">
                {f.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[14px] leading-6 text-muted-foreground mt-4">
        These enable: immutable audit trail and time-travel queries, cryptographic integrity,
        event-sourced history, entity resolution across documents and agent data, timeline
        generation, dual-path storing (files + agent interactions), and persistent memory without
        context-window limits.
      </p>

      <SectionDivider />

      {/* How agents remember */}
      <SectionHeading id="agent-loop">How agents remember</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        Every agent follows a mandatory loop: retrieve context, store the conversation and entities,
        extract structured facts, then respond. Storage completes before any reply.
      </p>
      <div className="space-y-2 mb-4">
        {[
          { step: "Retrieve", desc: "Bounded query for entities implied by the message." },
          { step: "Store", desc: "Persist conversation and extracted entities in one call." },
          { step: "Extract", desc: "Facts become typed entities with relationships." },
          { step: "Respond", desc: "Reply only after storage completes." },
        ].map((s) => (
          <div key={s.step} className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0 font-medium font-mono text-[13px]">
              &rarr;
            </span>
            <span className="text-[15px] leading-7">
              <strong>{s.step}.</strong> <span className="text-muted-foreground">{s.desc}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-[14px] leading-6 font-mono text-rose-400 dark:text-rose-500 mb-2">
        Invariant: responding before storing is forbidden.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link
          to="/agent-instructions"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          agent instructions
        </Link>{" "}
        for full behavioral requirements.
      </p>

      <SectionDivider />

      {/* What this is not */}
      <SectionHeading id="what-this-is-not">What this is not</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        Neotoma is not a RAG pipeline or embedding-first retrieval layer. Its core is structured,
        schema-based, and deterministic. Optional similarity search is available when an embedding
        provider is configured (via{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-[13px]">OPENAI_API_KEY</code>), but
        retrieval falls back to keyword matching without it.
      </p>
      <p className="text-[15px] leading-7 mb-3">
        It is not an app, agent, or workflow engine. It is the lowest-level canonical source of
        truth for structured data (documents and agent-created data), exposed to AI tools via Model
        Context Protocol (MCP).
      </p>
      <p className="text-[15px] leading-7">
        Retrieval layers can read from Neotoma. Neotoma governs what they read.
      </p>

      <SectionDivider />

      {/* Problems solved */}
      <SectionHeading id="problems-solved">Problems solved</SectionHeading>
      <table className={RESPONSIVE_TABLE_CLASS}>
        <thead>
          <tr>
            <th className="min-w-[18ch]">Problem</th>
            <th className="min-w-[36ch]">How Neotoma addresses it</th>
          </tr>
        </thead>
        <tbody>
          {PROBLEMS_SOLVED.map((row) => (
            <tr key={row.problem}>
              <td data-label="Problem" className="font-medium">
                {row.problem}
              </td>
              <td data-label={row.problem} className="align-top">
                {row.solution}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionDivider />

      {/* Terminology */}
      <SectionHeading id="terminology">Core terminology</SectionHeading>
      <table className={RESPONSIVE_TABLE_CLASS}>
        <thead>
          <tr>
            <th className="min-w-[14ch]">Term</th>
            <th className="min-w-[36ch]">Definition</th>
          </tr>
        </thead>
        <tbody>
          {GLOSSARY_ROWS.map((row) => (
            <tr key={row.term}>
              <td data-label="Term" className="font-medium">
                {row.term}
              </td>
              <td data-label={row.term} className="align-top">
                {row.definition}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionDivider />

      {/* Interfaces */}
      <SectionHeading id="interfaces">Interfaces</SectionHeading>
      <p className="text-[15px] leading-7 mb-4">
        Neotoma exposes three interfaces. All three use the same OpenAPI-backed operations, so the
        same guarantees apply regardless of how you interact with the system.
      </p>
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        {[
          {
            label: "MCP Server",
            detail:
              "For AI agents (Claude, Cursor, Codex). Agents store and retrieve via tool calls.",
            link: "/mcp",
            linkLabel: "MCP reference",
          },
          {
            label: "CLI",
            detail: "For developers. Init, store, retrieve, inspect, and manage from the terminal.",
            link: "/cli",
            linkLabel: "CLI reference",
          },
          {
            label: "REST API",
            detail:
              "For apps and integrations. OpenAPI-first; every operation is an HTTP endpoint.",
            link: "/api",
            linkLabel: "API reference",
          },
        ].map((iface) => (
          <div key={iface.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-[14px] font-medium text-foreground mb-1">{iface.label}</p>
            <p className="text-[13px] leading-5 text-muted-foreground mb-2">{iface.detail}</p>
            <Link
              to={iface.link}
              className="text-[13px] text-foreground font-medium underline underline-offset-2 hover:no-underline"
            >
              {iface.linkLabel} &rarr;
            </Link>
          </div>
        ))}
      </div>

      <SectionDivider />

      {/* Core principles */}
      <SectionHeading id="principles">Core principles</SectionHeading>
      <ul className="list-none pl-0 space-y-2 mb-6">
        {CORE_PRINCIPLES.map((p) => (
          <li key={p.name} className="text-[15px] leading-7 flex items-start gap-2">
            <Check className="h-4 w-4 shrink-0 mt-1 text-emerald-500 stroke-[2.5]" aria-hidden />
            <span>
              <strong>{p.name}.</strong> {p.detail}
            </span>
          </li>
        ))}
      </ul>

      <SectionDivider />

      {/* Preview status */}
      <SectionHeading id="preview-status">Developer preview status</SectionHeading>
      <p className="text-[15px] leading-7 mb-4">
        The developer preview exposes the core contract only: CLI for humans, MCP for agents,
        OpenAPI as the single source of truth.
      </p>

      <h3 className="text-[16px] font-medium tracking-[-0.01em] mb-2">
        What is guaranteed (even in preview)
      </h3>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {PREVIEW_GUARANTEED.map((item) => (
          <li key={item} className="text-[14px] leading-6 text-foreground flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            {item}
          </li>
        ))}
      </ul>

      <h3 className="text-[16px] font-medium tracking-[-0.01em] mb-2">
        What is not guaranteed yet
      </h3>
      <ul className="list-none pl-0 space-y-1.5 mb-4">
        {PREVIEW_NOT_GUARANTEED.map((item) => (
          <li
            key={item}
            className="text-[14px] leading-6 text-muted-foreground flex items-start gap-2"
          >
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            {item}
          </li>
        ))}
      </ul>
      <p className="text-[14px] leading-6 text-muted-foreground">
        Breaking changes should be expected.
      </p>

      <SectionDivider />

      {/* Go deeper */}
      <SectionHeading id="go-deeper">Go deeper</SectionHeading>
      <ul className="list-none pl-0 space-y-2 text-[15px] leading-7">
        <li>
          <Link to="/" className="text-foreground underline underline-offset-2 hover:no-underline">
            Home
          </Link>
          {" \u2014 hero, install, use cases, and how agents remember"}
        </li>
        <li>
          <Link
            to="/terminology"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Terminology
          </Link>
          {" \u2014 full glossary"}
        </li>
        <li>
          <Link
            to="/install#docker"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Docker
          </Link>
          {" \u2014 run Neotoma in Docker"}
        </li>
        <li>
          <Link
            to="/cli"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            CLI reference
          </Link>
          {" \u2014 commands and flags"}
        </li>
        <li>
          <Link
            to="/mcp"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            MCP reference
          </Link>
          {" \u2014 Model Context Protocol actions"}
        </li>
        <li>
          <Link
            to="/api"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            API reference
          </Link>
          {" \u2014 REST endpoints"}
        </li>
        <li>
          <a
            href="https://github.com/markmhendrickson/neotoma"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            GitHub
          </a>
          {" \u2014 source and README"}
        </li>
        <li>
          <a
            href="https://markmhendrickson.com/posts/truth-layer-agent-memory"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Building a truth layer for persistent agent memory
          </a>
          {" \u2014 rationale essay"}
        </li>
      </ul>
    </DetailPage>
  );
}
