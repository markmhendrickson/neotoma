import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function ReproducibleStateReconstructionPage() {
  return (
    <DetailPage title="Reproducible state reconstruction">
      <p className="text-[15px] leading-7 mb-4">
        Reproducible state reconstruction means rebuilding complete state from raw observations alone. If the
        database is lost, replay reconstructs the same state deterministically.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: restoring requires uncertain backups and manual reconciliation. After: replay up to timestamp T
        recreates state at T exactly, then replay to present restores current state.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Verify timeline events are available
neotoma timeline list

# Recompute and verify snapshots
neotoma entities list --type task --limit 20`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        This depends on{" "}
        <Link to="/replayable-timeline" className="text-foreground underline hover:text-foreground">
          replayable timeline
        </Link>
        ,{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>
        , and{" "}
        <Link to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
          auditable change log
        </Link>
        .
      </p>
    </DetailPage>
  );
}
