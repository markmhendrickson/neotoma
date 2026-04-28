import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function VersionedHistoryPage() {
  return (
    <DetailPage title="Versioned history">
      <p className="text-[15px] leading-7 mb-4">
        Every change creates a new version instead of overwriting prior state. Earlier snapshots remain
        queryable, so you can answer what the system believed at any point.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: a row update erases the old value unless you added custom history tables. After: each correction
        is appended as a new observation, so historical state is preserved by default.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Current snapshot
neotoma entities search --query "Ana Rivera" --entity-type contact

# Historical lineage
neotoma observations list --entity-id <entity_id>`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        This aligns with event-sourcing principles: the observation log is authoritative, snapshots are derived
        views. See{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>
        ,{" "}
        <Link to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
          auditable change log
        </Link>
        , and{" "}
        <Link to="/human-inspectability" className="text-foreground underline hover:text-foreground">
          human inspectability
        </Link>
        .
      </p>
    </DetailPage>
  );
}
