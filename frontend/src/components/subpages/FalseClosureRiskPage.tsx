import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function FalseClosureRiskPage() {
  return (
    <DetailPage title="False closure risk">
      <p className="text-[15px] leading-7 mb-4">
        False closure risk is the likelihood that an agent confidently answers from stale or
        superseded context because the system cannot distinguish resolved decisions from open
        questions. The agent retrieves a relevant-looking fact, treats it as current, and delivers
        it with full confidence, even when the decision was revised months ago.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: an ops team asks &ldquo;What is our contractor access policy?&rdquo; The agent
        retrieves the Q3 draft discussion, not the November board-approved version, and answers
        confidently. The team acts on an outdated policy. After: Neotoma&rsquo;s versioned
        observations preserve both the draft and the final decision with timestamps and provenance.
        The reducer surfaces the latest resolved state; the agent can trace that the Q3 draft was
        superseded.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# View the full observation history for a policy entity
neotoma observations list --entity-id <policy_entity_id>

# The snapshot reflects the latest resolved state
neotoma entities search --query "contractor access policy" --entity-type policy`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        False closure is prevented by the combination of{" "}
        <Link to="/versioned-history" className="text-foreground underline hover:text-foreground">
          versioned history
        </Link>
        ,{" "}
        <Link to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
          auditable change logs
        </Link>
        , and{" "}
        <Link to="/deterministic-memory" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>
        . Where{" "}
        <Link to="/silent-mutation-risk" className="text-foreground underline hover:text-foreground">
          silent mutation
        </Link>{" "}
        describes data changing without a trail, false closure describes stale data being served
        as if it were current. See also{" "}
        <Link to="/conflicting-facts-risk" className="text-foreground underline hover:text-foreground">
          conflicting facts risk
        </Link>
        .
      </p>
    </DetailPage>
  );
}
