import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function DeterministicMemoryPage() {
  return (
    <DetailPage title="Deterministic memory">
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
        <Link to="/platform-memory" className="text-foreground underline hover:text-foreground">
          platform memory
        </Link>
        ,{" "}
        <Link to="/retrieval-memory" className="text-foreground underline hover:text-foreground">
          retrieval memory
        </Link>
        ,{" "}
        <Link to="/file-based-memory" className="text-foreground underline hover:text-foreground">
          file-based memory
        </Link>
        ,{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
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
