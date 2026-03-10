import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function PlatformMemoryPage() {
  return (
    <DetailPage title="Platform memory">
      <p className="text-[15px] leading-7 mb-4">
        Platform memory is the built-in memory provided by model vendors (Claude, ChatGPT, Gemini, Copilot).
        It is convenient but opaque: storage and eviction policies are controlled by the provider.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Typical behavior: you ask a model to remember a preference, and future sessions may include it. There is
        rarely an append-only log, typed schema enforcement, or deterministic replay capability.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`User: "Remember I prefer morning meetings."
Model platform: stores preference internally
Operator: cannot inspect full lineage, replay state transitions, or export a deterministic log`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        For production agent workflows, this model typically fails key guarantees in the comparison table
        (versioning, replay, audit, and deterministic resolution). Compare with{" "}
        <Link to="/retrieval-memory" className="text-foreground underline hover:text-foreground">
          retrieval memory
        </Link>{" "}
        and{" "}
        <Link to="/deterministic-memory" className="text-foreground underline hover:text-foreground">
          deterministic memory
        </Link>
        . See also{" "}
        <Link to="/memory-vendors" className="text-foreground underline hover:text-foreground">
          memory model comparison
        </Link>
        .
      </p>
    </DetailPage>
  );
}
