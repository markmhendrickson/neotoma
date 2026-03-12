import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function MemoryModelsPage() {
  return (
    <DetailPage title="Memory models">
      <p className="text-[15px] leading-7 mb-4">
        Compare memory models first, then evaluate representative tools inside each model. This keeps the focus
        on guarantees and failure modes rather than brand checklists.
      </p>

      <nav className="rounded-lg border toc-panel p-4 mb-8">
        <p className="text-[14px] font-medium mb-2">On this page</p>
        <ul className="list-none pl-0 space-y-1 text-[14px]">
          <li>
            <a href="#platform-memory" className="text-foreground underline hover:text-foreground">
              Platform memory
            </a>
          </li>
          <li>
            <a href="#retrieval-memory" className="text-foreground underline hover:text-foreground">
              Retrieval memory
            </a>
          </li>
          <li>
            <a href="#file-based-memory" className="text-foreground underline hover:text-foreground">
              File-based memory
            </a>
          </li>
          <li>
            <a href="#deterministic-memory" className="text-foreground underline hover:text-foreground">
              Deterministic memory
            </a>
          </li>
          <li>
            <a href="#memory-model-comparison" className="text-foreground underline hover:text-foreground">
              Memory model comparison
            </a>
          </li>
        </ul>
      </nav>

      {/* Platform memory */}
      <section id="platform-memory" className="scroll-mt-20 mb-12">
        <h2 className="text-[22px] font-medium tracking-[-0.01em] mb-4">Platform memory</h2>
        <p className="text-[15px] leading-7 mb-4">
          Platform memory is the built-in memory provided by model vendors (
          <Link to="/neotoma-with-claude" className="text-foreground underline hover:text-foreground">
            Claude
          </Link>
          ,{" "}
          <Link to="/neotoma-with-chatgpt" className="text-foreground underline hover:text-foreground">
            ChatGPT
          </Link>
          , Gemini, Copilot). It is convenient but opaque: storage and eviction policies are controlled by the
          provider.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Typical behavior: you ask a model to remember a preference, and future sessions may include it. There is
          rarely an append-only log, typed schema enforcement, or deterministic replay capability.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`User: "Remember I prefer morning meetings."
Model platform: stores preference internally
Operator: cannot inspect full lineage, replay state transitions, or export a deterministic log`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          For production agent workflows, this model typically fails key guarantees in the comparison table
          (versioning, replay, audit, and deterministic resolution). Compare with{" "}
          <a href="#retrieval-memory" className="text-foreground underline hover:text-foreground">
            retrieval memory
          </a>{" "}
          and{" "}
          <a href="#deterministic-memory" className="text-foreground underline hover:text-foreground">
            deterministic memory
          </a>
          .
        </p>
      </section>

      {/* Retrieval memory */}
      <section id="retrieval-memory" className="scroll-mt-20 mb-12">
        <h2 className="text-[22px] font-medium tracking-[-0.01em] mb-4">Retrieval memory</h2>
        <p className="text-[15px] leading-7 mb-4">
          Retrieval memory reconstructs context at query time (RAG/vector search). It excels at relevance search,
          but does not guarantee deterministic or complete state reconstruction.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Similarity ranking is sensitive to embeddings, chunking, and index updates. The same intent can return
          different top-k items over time.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`Query A: "How should I schedule with Ana?"
-> top-k returns preference "morning meetings"

Query B: "Summarize Ana's profile"
-> top-k may omit that same preference`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          This model can satisfy semantic search needs but not core state-integrity guarantees. See{" "}
          <a href="#platform-memory" className="text-foreground underline hover:text-foreground">
            platform memory
          </a>
          ,{" "}
          <a href="#deterministic-memory" className="text-foreground underline hover:text-foreground">
            deterministic memory
          </a>
          ,{" "}
          <Link to="/memory-guarantees#conflicting-facts-risk" className="text-foreground underline hover:text-foreground">
            conflicting facts risk
          </Link>
          , and the{" "}
          <a href="#memory-model-comparison" className="text-foreground underline hover:text-foreground">
            comparison table
          </a>
          .
        </p>
      </section>

      {/* File-based memory */}
      <section id="file-based-memory" className="scroll-mt-20 mb-12">
        <h2 className="text-[22px] font-medium tracking-[-0.01em] mb-4">File-based memory</h2>
        <p className="text-[15px] leading-7 mb-4">
          File-based memory stores state in Markdown, JSON, or similar artifacts. It is portable and easy to edit
          directly, but integrity guarantees are manual.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Typical implementations append notes or overwrite JSON blobs. Without a deterministic reducer and
          observation lineage, teams rely on ad-hoc conventions for conflict handling.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "contact": "Ana Rivera",
  "city": "Barcelona"
}

# Later overwrite
{
  "contact": "Ana Rivera",
  "city": "San Francisco"
}`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          This model can work for lightweight workflows but usually fails deterministic guarantees at scale. See{" "}
          <a href="#platform-memory" className="text-foreground underline hover:text-foreground">
            platform memory
          </a>
          ,{" "}
          <a href="#deterministic-memory" className="text-foreground underline hover:text-foreground">
            deterministic memory
          </a>
          ,{" "}
          <Link to="/memory-guarantees#schema-constraints" className="text-foreground underline hover:text-foreground">
            schema constraints
          </Link>
          , and the{" "}
          <a href="#memory-model-comparison" className="text-foreground underline hover:text-foreground">
            comparison table
          </a>
          .
        </p>
      </section>

      {/* Deterministic memory */}
      <section id="deterministic-memory" className="scroll-mt-20 mb-12">
        <h2 className="text-[22px] font-medium tracking-[-0.01em] mb-4">Deterministic memory</h2>
        <p className="text-[15px] leading-7 mb-4">
          Deterministic memory enforces state integrity through deterministic reduction, immutable history, schema
          validation, and provenance. Neotoma is the reference implementation.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Invariant stack: versioning, replay, auditability, and schema constraints. Together these guarantees
          make memory reproducible under load, across tools, and across time.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Store from one interface
neotoma store --json='[{"entity_type":"task","title":"Finalize architecture review","status":"open"}]'

# Retrieve from another interface (MCP/CLI/API) and get identical canonical snapshot
neotoma entities list --type task --limit 5`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Compared with platform, retrieval, and file-based models, deterministic memory prioritizes guarantees
          over convenience defaults. See{" "}
          <a href="#platform-memory" className="text-foreground underline hover:text-foreground">
            platform memory
          </a>
          ,{" "}
          <a href="#retrieval-memory" className="text-foreground underline hover:text-foreground">
            retrieval memory
          </a>
          ,{" "}
          <a href="#file-based-memory" className="text-foreground underline hover:text-foreground">
            file-based memory
          </a>
          , and{" "}
          <Link to="/memory-guarantees#deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
            deterministic state evolution
          </Link>
          .
        </p>
      </section>

      {/* Memory model comparison */}
      <section id="memory-model-comparison" className="scroll-mt-20 mb-12">
        <h2 className="text-[22px] font-medium tracking-[-0.01em] mb-4">Memory model comparison</h2>

        <h3 className="text-[18px] font-medium mb-3 mt-6">
          <a href="#platform-memory" className="hover:text-foreground/80">
            Platform memory
          </a>
        </h3>
        <p className="text-[15px] leading-7 mb-4">
          <strong>
            <Link to="/neotoma-with-claude" className="text-foreground underline hover:text-foreground">
              Claude
            </Link>
            ,{" "}
            <Link to="/neotoma-with-chatgpt" className="text-foreground underline hover:text-foreground">
              ChatGPT
            </Link>
            , Gemini, Copilot.
          </strong>{" "}
          These are the built-in memory features offered directly by model providers. They manage memory behind the
          scenes, typically as convenience layers tied to a specific product. Platform memory is the easiest to adopt
          but the hardest to audit, version, or port between providers.
        </p>

        <h3 className="text-[18px] font-medium mb-3 mt-6">
          <a href="#retrieval-memory" className="hover:text-foreground/80">
            Retrieval memory
          </a>
        </h3>
        <p className="text-[15px] leading-7 mb-4">
          <strong>Mem0, Zep, LangChain Memory.</strong> These systems reconstruct
          context at query time by embedding past interactions and retrieving
          the most similar results. They excel at surfacing relevant context but
          introduce non-determinism: the same question asked twice may surface
          different facts depending on index state and re-ranking.
        </p>

        <h3 className="text-[18px] font-medium mb-3 mt-6">
          <a href="#file-based-memory" className="hover:text-foreground/80">
            File-based memory
          </a>
        </h3>
        <p className="text-[15px] leading-7 mb-4">
          <strong>Markdown files, JSON stores, CRDT docs.</strong> File-based
          approaches store memory as plain artifacts on disk or in collaborative
          documents. They are simple and human-readable, but lack schema
          enforcement, conflict detection, and audit trails unless those are
          layered on manually.
        </p>

        <h3 className="text-[18px] font-medium mb-3 mt-6">
          <a href="#deterministic-memory" className="hover:text-foreground/80">
            Deterministic memory
          </a>
        </h3>
        <p className="text-[15px] leading-7 mb-4">
          <strong>Neotoma.</strong> Deterministic memory systems guarantee that
          the same observations always produce the same entity state. Every fact
          traces to provenance, every state transition is versioned, and the
          full history is replayable. Neotoma is the reference implementation
          of this model, providing the{" "}
          <Link to="/memory-guarantees#deterministic-state-evolution">deterministic state evolution</Link>,{" "}
          <Link to="/memory-guarantees#versioned-history">versioned history</Link>, and{" "}
          <Link to="/memory-guarantees#auditable-change-log">auditable change log</Link>{" "}
          guarantees that production agents require.
        </p>
      </section>
    </DetailPage>
  );
}
