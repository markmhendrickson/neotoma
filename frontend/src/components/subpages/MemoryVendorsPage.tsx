import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function MemoryVendorsPage() {
  return (
    <DetailPage title="Memory model comparison">
      <p className="text-[15px] leading-7 mb-4">
        Compare memory models first, then evaluate representative tools inside each model. This keeps the focus
        on guarantees and failure modes rather than brand checklists.
      </p>

      <h2 className="text-[18px] font-medium mb-3 mt-8">
        <Link to="/platform-memory" className="hover:text-foreground/80">
          Platform memory
        </Link>
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        <strong>Claude, ChatGPT, Gemini, Copilot.</strong> These are the
        built-in memory features offered directly by model providers. They
        manage memory behind the scenes, typically as convenience layers tied
        to a specific product. Platform memory is the easiest to adopt but the
        hardest to audit, version, or port between providers.
      </p>

      <h2 className="text-[18px] font-medium mb-3 mt-8">
        <Link to="/retrieval-memory" className="hover:text-foreground/80">
          Retrieval memory
        </Link>
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        <strong>Mem0, Zep, LangChain Memory.</strong> These systems reconstruct
        context at query time by embedding past interactions and retrieving
        the most similar results. They excel at surfacing relevant context but
        introduce non-determinism: the same question asked twice may surface
        different facts depending on index state and re-ranking.
      </p>

      <h2 className="text-[18px] font-medium mb-3 mt-8">
        <Link to="/file-based-memory" className="hover:text-foreground/80">
          File-based memory
        </Link>
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        <strong>Markdown files, JSON stores, CRDT docs.</strong> File-based
        approaches store memory as plain artifacts on disk or in collaborative
        documents. They are simple and human-readable, but lack schema
        enforcement, conflict detection, and audit trails unless those are
        layered on manually.
      </p>

      <h2 className="text-[18px] font-medium mb-3 mt-8">
        <Link to="/deterministic-memory" className="hover:text-foreground/80">
          Deterministic memory
        </Link>
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        <strong>Neotoma.</strong> Deterministic memory systems guarantee that
        the same observations always produce the same entity state. Every fact
        traces to provenance, every state transition is versioned, and the
        full history is replayable. Neotoma is the reference implementation
        of this model, providing the{" "}
        <Link to="/deterministic-state-evolution">deterministic state evolution</Link>,{" "}
        <Link to="/versioned-history">versioned history</Link>, and{" "}
        <Link to="/auditable-change-log">auditable change log</Link>{" "}
        guarantees that production agents require.
      </p>
    </DetailPage>
  );
}
