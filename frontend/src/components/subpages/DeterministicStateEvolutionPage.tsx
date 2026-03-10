import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function DeterministicStateEvolutionPage() {
  return (
    <DetailPage title="Deterministic state evolution">
      <p className="text-[15px] leading-7 mb-4">
        Given the same set of observations, the system always produces the same entity state regardless of when
        or in what order they are processed. This removes ordering bugs and makes agent state testable.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: two agents report conflicting values and whichever write arrives last wins. After: both
        observations are preserved and a deterministic merge rule resolves the canonical value reproducibly.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">CLI example</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Agent A writes one value
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","city":"Barcelona"}]'

# Agent B writes a conflicting value
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","city":"San Francisco"}]'

# Deterministic reducer computes one canonical snapshot
neotoma entities search --query "Ana Rivera" --type contact`}</pre>

      <p className="text-[15px] leading-7 mb-4">
        Late-arriving observations are folded in deterministically. If the merge rule prefers stronger
        provenance or recency, it behaves identically on replay, which is required for{" "}
        <Link to="/reproducible-state-reconstruction" className="text-foreground underline hover:text-foreground">
          reproducible state reconstruction
        </Link>
        . See{" "}
        <Link to="/versioned-history" className="text-foreground underline hover:text-foreground">
          versioned history
        </Link>
        ,{" "}
        <Link to="/replayable-timeline" className="text-foreground underline hover:text-foreground">
          replayable timeline
        </Link>
        , and{" "}
        <Link to="/architecture" className="text-foreground underline hover:text-foreground">
          architecture
        </Link>
        .
      </p>
    </DetailPage>
  );
}
