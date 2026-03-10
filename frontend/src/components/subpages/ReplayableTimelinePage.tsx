import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function ReplayableTimelinePage() {
  return (
    <DetailPage title="Replayable timeline">
      <p className="text-[15px] leading-7 mb-4">
        The full sequence of observations can be replayed to reconstruct state at any timestamp. This enables
        deterministic debugging and incident analysis.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: after an incident, you only have current snapshots and partial logs. After: replay from
        observations reproduces the exact state transition path that led to failure.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# List timeline events
neotoma timeline list

# Get one event and inspect linked entities
neotoma timeline get <event_id>
neotoma relationships list --entity-id <entity_id>`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Replay depends on{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>{" "}
        and supports{" "}
        <Link to="/reproducible-state-reconstruction" className="text-foreground underline hover:text-foreground">
          reproducible state reconstruction
        </Link>
        . See{" "}
        <Link to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
          auditable change log
        </Link>{" "}
        for provenance.
      </p>
    </DetailPage>
  );
}
