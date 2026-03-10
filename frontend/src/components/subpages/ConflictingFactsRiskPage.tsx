import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function ConflictingFactsRiskPage() {
  return (
    <DetailPage title="Conflicting facts risk">
      <p className="text-[15px] leading-7 mb-4">
        Conflicting facts risk is the likelihood that contradictory statements coexist without deterministic
        resolution. In production this causes unpredictable agent behavior.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: both "office is in New York" and "office is in London" remain active with no canonical winner.
        After: merge rules choose one canonical value and preserve conflicting history for audit.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Store two conflicting facts
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","office_city":"New York"}]'
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","office_city":"London"}]'

# Query canonical resolved state
neotoma entities search --query "Ana Rivera" --type contact`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Deterministic merge logic resolves conflicts reproducibly.{" "}
        <Link to="/schema-constraints" className="text-foreground underline hover:text-foreground">
          Schema constraints
        </Link>{" "}
        support typed conflict handling, and{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>{" "}
        guarantees the same result on replay. See{" "}
        <Link to="/silent-mutation-risk" className="text-foreground underline hover:text-foreground">
          silent mutation risk
        </Link>
        .
      </p>
    </DetailPage>
  );
}
