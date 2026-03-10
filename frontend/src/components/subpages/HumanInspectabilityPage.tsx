import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function HumanInspectabilityPage() {
  return (
    <DetailPage title="Human inspectability">
      <p className="text-[15px] leading-7 mb-4">
        Human inspectability means a person can diff two versions, inspect lineage, and trace each fact to its
        source. Trust comes from verification, not hidden model behavior.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: a value changes and operators only see "current state." After: operators can inspect field-level
        diffs and provenance to validate or correct the update.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Inspect snapshot lineage
neotoma entities get <entity_id>
neotoma observations list --entity-id <entity_id>`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Inspectability depends on{" "}
        <Link to="/versioned-history" className="text-foreground underline hover:text-foreground">
          versioned history
        </Link>
        ,{" "}
        <Link to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
          auditable change log
        </Link>
        , and{" "}
        <Link to="/replayable-timeline" className="text-foreground underline hover:text-foreground">
          replayable timeline
        </Link>
        .
      </p>
    </DetailPage>
  );
}
