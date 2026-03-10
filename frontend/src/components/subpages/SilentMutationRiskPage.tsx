import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function SilentMutationRiskPage() {
  return (
    <DetailPage title="Silent mutation risk">
      <p className="text-[15px] leading-7 mb-4">
        Silent mutation risk is the chance that state changes without an explicit, inspectable trail. High-risk
        systems can overwrite or drop facts without leaving evidence.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: a contact field changes after an agent run and nobody can tell when or why. After: every field
        change is an observation, and lineage can be queried by entity and timestamp.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Inspect mutation trail for one entity
neotoma observations list --entity-id <entity_id>

# Verify relationship links for source context
neotoma relationships list --entity-id <entity_id>`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Deterministic systems prevent silent mutation by design through{" "}
        <Link to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
          auditable change logs
        </Link>{" "}
        and{" "}
        <Link to="/versioned-history" className="text-foreground underline hover:text-foreground">
          versioned history
        </Link>
        . See{" "}
        <Link to="/conflicting-facts-risk" className="text-foreground underline hover:text-foreground">
          conflicting facts risk
        </Link>{" "}
        and{" "}
        <Link to="/deterministic-memory" className="text-foreground underline hover:text-foreground">
          deterministic memory
        </Link>
        .
      </p>
    </DetailPage>
  );
}
