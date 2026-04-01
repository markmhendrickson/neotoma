import { Link } from "react-router-dom";
import { Check, X, Minus } from "lucide-react";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";
import { MEMORY_GUARANTEE_ROWS, type GuaranteeLevel } from "../../site/site_data";

type ComparisonColumn = "platform" | "retrieval" | "file" | "database" | "neotoma";

interface ComparisonPageProps {
  title: string;
  answerBlock: string;
  question: string;
  competitorLabel: string;
  competitorColumn: ComparisonColumn;
  intro: string;
  competitorDescription: string;
  neotomaDescription: string;
  whenToUse: { competitor: string; neotoma: string };
  faqItems: { question: string; answer: string }[];
}

function GuaranteeBadge({ level }: { level: GuaranteeLevel }) {
  switch (level) {
    case "guaranteed":
      return <Check className="h-4 w-4 text-emerald-500" />;
    case "prevented":
      return <Check className="h-4 w-4 text-emerald-500" />;
    case "not-provided":
      return <X className="h-4 w-4 text-rose-400" />;
    case "common":
      return <X className="h-4 w-4 text-rose-400" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

function levelLabel(level: GuaranteeLevel): string {
  switch (level) {
    case "guaranteed": return "Guaranteed";
    case "prevented": return "Prevented";
    case "not-provided": return "Not provided";
    case "common": return "Common risk";
    case "manual": return "Manual";
    case "partial": return "Partial";
    case "possible": return "Possible risk";
  }
}

export function ComparisonPage({
  title,
  answerBlock,
  question,
  competitorLabel,
  competitorColumn,
  intro,
  competitorDescription,
  neotomaDescription,
  whenToUse,
  faqItems,
}: ComparisonPageProps) {
  return (
    <DetailPage title={title}>
      <p className="text-[16px] leading-7 font-medium text-foreground mb-6">
        {answerBlock}
      </p>

      <p className="text-[15px] leading-7 text-muted-foreground mb-8">
        {intro}
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-4">{question}</h2>

      <div className="grid gap-6 md:grid-cols-2 mb-10">
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <p className="text-[14px] font-medium text-foreground">{competitorLabel}</p>
          <p className="text-[14px] leading-6 text-muted-foreground">{competitorDescription}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-5 space-y-3">
          <p className="text-[14px] font-medium text-foreground">Neotoma</p>
          <p className="text-[14px] leading-6 text-muted-foreground">{neotomaDescription}</p>
        </div>
      </div>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-4">Guarantee comparison</h2>

      <TableScrollWrapper className="mb-10 w-full max-w-full md:rounded-lg md:bg-white dark:md:bg-transparent">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3.5 pl-4 pr-5 font-medium text-foreground align-middle">
                Property
              </th>
              <th className="text-center py-3.5 px-4 font-medium text-foreground align-middle">
                {competitorLabel}
              </th>
              <th className="text-center py-3.5 pl-4 pr-4 font-medium text-foreground align-middle">
                Neotoma
              </th>
            </tr>
          </thead>
          <tbody>
            {MEMORY_GUARANTEE_ROWS.map((row) => (
              <tr key={row.slug} className="border-b border-border/50">
                <td className="py-4 pl-4 pr-5 align-top text-muted-foreground leading-snug">
                  {row.property}
                </td>
                <td className="py-4 px-4 text-center align-middle">
                  <div className="flex min-h-8 items-center justify-center gap-1.5">
                    <GuaranteeBadge level={row[competitorColumn]} />
                    <span className="text-[12px] text-muted-foreground hidden sm:inline">
                      {levelLabel(row[competitorColumn])}
                    </span>
                  </div>
                </td>
                <td className="py-4 pl-4 pr-4 text-center align-middle">
                  <div className="flex min-h-8 items-center justify-center gap-1.5">
                    <GuaranteeBadge level={row.neotoma} />
                    <span className="text-[12px] text-muted-foreground hidden sm:inline">
                      {levelLabel(row.neotoma)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollWrapper>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-4">When to use which</h2>

      <div className="grid gap-6 md:grid-cols-2 mb-10">
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <p className="text-[14px] font-medium text-foreground">Use {competitorLabel} when</p>
          <p className="text-[14px] leading-6 text-muted-foreground">{whenToUse.competitor}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-5 space-y-2">
          <p className="text-[14px] font-medium text-foreground">Use Neotoma when</p>
          <p className="text-[14px] leading-6 text-muted-foreground">{whenToUse.neotoma}</p>
        </div>
      </div>

      {faqItems.length > 0 && (
        <>
          <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-4">Common questions</h2>
          {faqItems.map((item) => (
            <section key={item.question} className="mb-6">
              <h3 className="text-[16px] font-medium tracking-[-0.01em] mb-1">
                {item.question}
              </h3>
              <p className="text-[14px] leading-6 text-muted-foreground">{item.answer}</p>
            </section>
          ))}
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-10 pt-6 border-t border-border">
        <Link
          {...detailPageCtaLinkProps}
          to="/install"
          className="inline-flex justify-center items-center rounded-md border border-foreground bg-foreground px-5 py-2 text-[14px] font-medium text-background no-underline transition-colors hover:bg-foreground/90"
        >
          Install Neotoma
        </Link>
        <Link
          {...detailPageCtaLinkProps}
          to="/memory-models"
          className="inline-flex justify-center items-center rounded-md border border-border bg-card px-5 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
        >
          All memory models
        </Link>
        <Link
          {...detailPageCtaLinkProps}
          to="/faq"
          className="inline-flex justify-center items-center rounded-md border border-border bg-card px-5 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
        >
          FAQ
        </Link>
      </div>
    </DetailPage>
  );
}

export function NeotomaVsMem0Page() {
  return (
    <ComparisonPage
      title="Neotoma vs Mem0"
      answerBlock="Mem0 is a retrieval memory layer that stores text chunks and retrieves them by semantic similarity. Neotoma is a deterministic state layer that stores structured observations and composes entity state via reducers. Mem0 answers 'what is relevant?'; Neotoma answers 'what was true?'"
      question="How does Neotoma compare to Mem0?"
      competitorLabel="Mem0"
      competitorColumn="retrieval"
      intro="Both Mem0 and Neotoma give AI agents persistent memory across sessions. They solve different problems and make different guarantees."
      competitorDescription="Mem0 stores memories as text chunks with vector embeddings. It retrieves relevant context by semantic similarity search. Memory is optimized for prompt augmentation: finding relevant past context to inject into the current conversation."
      neotomaDescription="Neotoma stores structured observations about entities. Deterministic reducers compose all observations into a single entity snapshot. Memory is optimized for state integrity: knowing the exact composed state of an entity at any point in time."
      whenToUse={{
        competitor: "You need semantic retrieval to inject relevant past context into prompts. Your primary concern is making conversations feel continuous, and approximate recall is sufficient.",
        neotoma: "You need to reconstruct entity state at a specific point in time, resolve multi-writer conflicts deterministically, enforce schema validation, or prove provenance for audits.",
      }}
      faqItems={[
        {
          question: "Can I use Mem0 and Neotoma together?",
          answer: "Yes. Mem0 handles semantic retrieval for prompt augmentation while Neotoma handles structured state integrity. They address different layers of the memory problem.",
        },
        {
          question: "Does Mem0 provide deterministic state guarantees?",
          answer: "No. Mem0 uses probabilistic retrieval and does not guarantee deterministic state evolution, versioned history, or reproducible state reconstruction.",
        },
      ]}
    />
  );
}

export function NeotomaVsZepPage() {
  return (
    <ComparisonPage
      title="Neotoma vs Zep"
      answerBlock="Zep is a retrieval memory system that combines vector search with knowledge graphs for AI assistant context. Neotoma is a deterministic state layer that provides versioned, schema-bound, auditable entity state. Zep optimizes for retrieval relevance; Neotoma optimizes for state integrity."
      question="How does Neotoma compare to Zep?"
      competitorLabel="Zep"
      competitorColumn="retrieval"
      intro="Both Zep and Neotoma provide persistent memory for AI agents. They take fundamentally different approaches to the memory problem."
      competitorDescription="Zep combines vector similarity search with a knowledge graph extracted from conversations. It auto-summarizes sessions, extracts entities, and builds a temporal knowledge graph. Memory is optimized for retrieving relevant context with business-data enrichment."
      neotomaDescription="Neotoma stores append-only observations and composes them into entity snapshots via deterministic reducers. Every state change is versioned with full provenance. Memory is optimized for knowing exactly what was true at any point in time."
      whenToUse={{
        competitor: "You need enriched retrieval with automatic knowledge graph extraction from conversations. Your primary concern is injecting the most relevant context into prompts with minimal configuration.",
        neotoma: "You need formal state integrity guarantees: deterministic reconstruction, multi-writer conflict resolution, schema validation, auditable provenance, and temporal state queries.",
      }}
      faqItems={[
        {
          question: "Does Zep provide deterministic state reconstruction?",
          answer: "No. Zep's knowledge graph is built via extraction and summarization, which are non-deterministic processes. The same inputs may produce different graph states across runs.",
        },
        {
          question: "Can I use Zep and Neotoma together?",
          answer: "Yes. Zep handles retrieval-augmented context for prompts while Neotoma handles structured state integrity for entities that need formal guarantees.",
        },
      ]}
    />
  );
}

export function NeotomaVsRagPage() {
  return (
    <ComparisonPage
      title="Neotoma vs RAG memory"
      answerBlock="RAG (Retrieval-Augmented Generation) memory stores text as vector embeddings and retrieves relevant chunks by semantic similarity. Deterministic memory stores structured observations and composes entity state via reducers. RAG answers 'what is relevant to this query?'; deterministic memory answers 'what was true at this moment?'"
      question="What's the difference between RAG memory and deterministic memory?"
      competitorLabel="RAG memory"
      competitorColumn="retrieval"
      intro="RAG and deterministic memory solve different problems in the AI agent stack. Understanding the difference matters for choosing the right architecture."
      competitorDescription="RAG systems chunk documents, embed them as vectors, and retrieve the most semantically similar chunks at query time. The retrieved chunks are injected into the prompt to give the model relevant context. The system is optimized for recall relevance."
      neotomaDescription="Deterministic memory systems record structured observations about entities and compose them into snapshots using deterministic reducers. The same observations always produce the same state. The system is optimized for state integrity and auditability."
      whenToUse={{
        competitor: "You need to augment LLM prompts with relevant context from a document corpus. Approximate retrieval is sufficient, and you don't need to reconstruct historical entity state.",
        neotoma: "You need to know the exact state of an entity at any past moment, resolve conflicts between multiple writers deterministically, enforce schemas, or provide auditable provenance chains.",
      }}
      faqItems={[
        {
          question: "Is Neotoma a RAG system?",
          answer: "No. Neotoma provides semantic search over structured entity snapshots, but it is not a RAG system. It does not chunk documents or inject retrieved text into prompts. It provides deterministic state composition with formal guarantees.",
        },
        {
          question: "Can I use RAG alongside Neotoma?",
          answer: "Yes. RAG handles document retrieval for prompt augmentation. Neotoma handles structured entity state with deterministic guarantees. They are complementary.",
        },
        {
          question: "Does RAG provide versioned history?",
          answer: "No. Standard RAG systems store the latest version of document chunks. They do not maintain version history, temporal state queries, or auditable change logs for individual entities.",
        },
      ]}
    />
  );
}

export function NeotomaVsPlatformMemoryPage() {
  return (
    <ComparisonPage
      title="Neotoma vs platform memory"
      answerBlock="Platform memory is the built-in memory layer inside products like Claude, ChatGPT, Gemini, and Copilot. It is optimized for convenience inside one vendor surface. Neotoma is a deterministic state layer optimized for portability, auditability, and exact state reconstruction across tools."
      question="How does Neotoma compare to platform memory?"
      competitorLabel="Platform memory"
      competitorColumn="platform"
      intro="Both platform memory and Neotoma help agents remember across sessions. They target very different reliability and control requirements."
      competitorDescription="Platform memory is controlled by the model provider. It may remember preferences, summaries, or user details inside that product, but the storage model is opaque. Users typically cannot inspect lineage, replay state transitions, or export a deterministic observation log."
      neotomaDescription="Neotoma stores append-only structured observations with deterministic reducers, schema validation, and provenance. Memory remains user-controlled, cross-tool, and reconstructable at any point in time."
      whenToUse={{
        competitor: "You want the fastest possible setup inside a single AI product, and convenience matters more than portability, versioning, or auditability.",
        neotoma: "You need memory that survives tool changes, supports exact historical reconstruction, exposes provenance, and gives multiple agents a shared state layer with formal guarantees.",
      }}
      faqItems={[
        {
          question: "Can I use platform memory and Neotoma together?",
          answer: "Yes. Platform memory can hold lightweight in-product preferences or convenience context, while Neotoma stores durable structured state that must persist across tools and sessions.",
        },
        {
          question: "Does platform memory provide auditable history?",
          answer: "Not in the way production agent systems usually require. Platform products may expose some editable memory UI, but they generally do not provide append-only observation logs, deterministic replay, or field-level provenance.",
        },
      ]}
    />
  );
}

export function NeotomaVsFilePage() {
  return (
    <ComparisonPage
      title="Neotoma vs file-based memory"
      answerBlock="File-based memory stores state in Markdown, JSON, or similar artifacts. It is portable and human-editable, but provides no schema enforcement, conflict detection, or auditable provenance unless layered on manually. Neotoma stores structured observations and composes entity state via deterministic reducers with formal guarantees."
      question="Why not just use markdown files for agent memory?"
      competitorLabel="File-based memory"
      competitorColumn="file"
      intro="Markdown and JSON files are the simplest possible memory store for AI agents. They work well for lightweight, single-writer workflows. The question is what happens when requirements grow."
      competitorDescription="File-based memory stores facts as plain text artifacts on disk. Agents read and write files directly, or commit them to git. The format is maximally portable and human-readable. Versioning comes from git, but conflict detection, schema validation, and provenance are not built in."
      neotomaDescription="Neotoma stores append-only observations about entities. Deterministic reducers compose all observations into a single entity snapshot. Every field traces to its source observation, schema validation rejects malformed writes, and conflicting facts are resolved deterministically."
      whenToUse={{
        competitor: "You have a single agent, simple state, and value being able to open memory in a text editor. Git-based versioning is sufficient for your audit needs, and you do not need conflict resolution or schema enforcement.",
        neotoma: "Multiple agents or tools write to the same entities. You need schema validation, conflict detection, reproducible state reconstruction, or auditable provenance that goes beyond git commit history.",
      }}
      faqItems={[
        {
          question: "Can git replace versioned history?",
          answer: "Git versions file snapshots, not entity observations. It can tell you what a file looked like at a commit, but not which observation changed which field, or how conflicting writes from different agents were resolved. Git versions the output; Neotoma versions the inputs.",
        },
        {
          question: "What about structured formats like JSON or YAML?",
          answer: "Structured file formats give you parseable data but not memory guarantees. A malformed edit, an accidental deletion, or two agents writing different values to the same key are all accepted silently. Neotoma validates writes against schemas and rejects invalid data at store time.",
        },
        {
          question: "Can I use file-based memory alongside Neotoma?",
          answer: "Yes. You can use files for human-editable configuration and notes while using Neotoma for entity state that needs formal guarantees. They address different layers of the problem.",
        },
      ]}
    />
  );
}

export function NeotomaVsDatabasePage() {
  return (
    <ComparisonPage
      title="Neotoma vs database memory"
      answerBlock="A relational database (SQLite, Postgres) provides strong consistency, column types, and fast queries. But standard CRUD usage overwrites previous state on every UPDATE, losing history, provenance, and the ability to reconstruct past entity state. Neotoma uses a database as its storage backend but adds the observation/reducer architecture that delivers memory guarantees."
      question="Why not just use SQLite or Postgres for agent memory?"
      competitorLabel="Database (CRUD)"
      competitorColumn="database"
      intro="Relational databases are the default tool for structured data. The question is not whether a database can store agent state - it can. The question is whether standard CRUD patterns deliver the guarantees that production agent memory requires."
      competitorDescription="A database with standard CRUD operations stores the current state of each entity as a row. UPDATEs overwrite previous values. There is no built-in audit trail, no observation log, and no mechanism to reconstruct historical state or detect conflicting writes from multiple agents."
      neotomaDescription="Neotoma uses SQLite (or Postgres) as its storage backend but imposes an append-only observation log, deterministic reducers, schema validation, and field-level provenance on top. The database stores the data; the architecture delivers the guarantees."
      whenToUse={{
        competitor: "You have a single writer, do not need historical state reconstruction, and are comfortable with last-write-wins semantics. Standard application development patterns are sufficient for your use case.",
        neotoma: "Multiple agents write to the same entities. You need to know what was true at any past moment, resolve conflicts deterministically, enforce schemas across writers, or prove provenance for audits. You want the guarantees without building the architecture yourself.",
      }}
      faqItems={[
        {
          question: "Doesn't Neotoma use a database internally?",
          answer: "Yes. Neotoma uses SQLite locally and Postgres when configured. The guarantees do not come from the storage engine - they come from the architectural pattern on top: immutable observation log, deterministic reducers, schema registry, and field-level provenance tracking.",
        },
        {
          question: "Can I add audit tables to get the same guarantees?",
          answer: "You can build audit triggers, history tables, and event logs on a database. If you also add deterministic merge logic, schema validation, provenance tracking, and idempotent observation handling, you will have rebuilt Neotoma's architecture. The question is whether that is the best use of your engineering time.",
        },
        {
          question: "What about temporal databases or event-sourced schemas?",
          answer: "Temporal extensions (e.g. Postgres temporal tables) and event-sourced patterns move in the right direction. Neotoma's contribution is the complete stack: content-addressed identity, deterministic reducers, schema-bound observations, and field-level provenance - integrated and tested as a single system.",
        },
      ]}
    />
  );
}
