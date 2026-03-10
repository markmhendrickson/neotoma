import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function AuditableChangeLogPage() {
  return (
    <DetailPage title="Auditable change log">
      <p className="text-[15px] leading-7 mb-4">
        Every modification records who changed what, when, and from which source. This creates field-level
        lineage for every fact in state.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: state changes are visible but origin is unclear. After: every change maps back to a concrete
        tool call or source artifact with timestamped provenance.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Inspect provenance trail
neotoma observations list --entity-id <entity_id>

# Inspect relationships to source/message entities
neotoma relationships list --entity-id <entity_id>`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        This is required for trustworthy multi-agent systems. See{" "}
        <Link to="/human-inspectability" className="text-foreground underline hover:text-foreground">
          human inspectability
        </Link>
        ,{" "}
        <Link to="/versioned-history" className="text-foreground underline hover:text-foreground">
          versioned history
        </Link>
        , and{" "}
        <Link to="/silent-mutation-risk" className="text-foreground underline hover:text-foreground">
          silent mutation risk
        </Link>
        .
      </p>
    </DetailPage>
  );
}
