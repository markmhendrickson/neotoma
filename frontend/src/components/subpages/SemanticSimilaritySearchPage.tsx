import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function SemanticSimilaritySearchPage() {
  return (
    <DetailPage title="Semantic similarity search">
      <p className="text-[15px] leading-7 mb-4">
        Semantic similarity search finds relevant prior context by meaning rather than exact text match.
        Retrieval / RAG systems pioneered this by searching over unstructured documents using vector embeddings.
        Neotoma applies the same technique to structured entity snapshots, scoped by entity type and structural
        filters.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">How it works</h2>
      <p className="text-[15px] leading-7 mb-4">
        When an agent or user queries Neotoma, the system embeds the query and compares it against entity
        snapshots. Because entities are structured and typed, search can be narrowed by entity type, time range,
        or relationship before similarity ranking is applied.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Search by meaning across all entities
neotoma entities search --query "upcoming meetings with the design team"

# Narrow by entity type
neotoma entities search --query "design review" --type event`}</pre>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Structured vs unstructured</h2>
      <p className="text-[15px] leading-7 mb-4">
        Pure retrieval systems search over raw documents and rely on the model to extract relevant facts from
        returned chunks. Neotoma searches over snapshots that already conform to{" "}
        <Link to="/schema-constraints" className="text-foreground underline hover:text-foreground">
          schema constraints
        </Link>
        , so results are typed and immediately usable. This combines the flexibility of semantic search with the
        reliability of{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>
        .
      </p>
      <p className="text-[15px] leading-7 mb-4">
        See{" "}
        <Link to="/memory-models" className="text-foreground underline hover:text-foreground">
          memory models
        </Link>{" "}
        for a full comparison, and the{" "}
        <Link to="/mcp" className="text-foreground underline hover:text-foreground">
          MCP reference
        </Link>{" "}
        for retrieval actions.
      </p>
    </DetailPage>
  );
}
