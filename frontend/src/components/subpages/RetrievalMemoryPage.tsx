import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function RetrievalMemoryPage() {
  return (
    <DetailPage title="Retrieval memory">
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
        <Link to="/platform-memory" className="text-foreground underline hover:text-foreground">
          platform memory
        </Link>
        ,{" "}
        <Link to="/deterministic-memory" className="text-foreground underline hover:text-foreground">
          deterministic memory
        </Link>
        ,{" "}
        <Link to="/conflicting-facts-risk" className="text-foreground underline hover:text-foreground">
          conflicting facts risk
        </Link>
        , and{" "}
        <Link to="/memory-vendors" className="text-foreground underline hover:text-foreground">
          memory model comparison
        </Link>
        .
      </p>
    </DetailPage>
  );
}
