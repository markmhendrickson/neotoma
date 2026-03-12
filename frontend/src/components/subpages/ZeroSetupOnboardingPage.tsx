import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function ZeroSetupOnboardingPage() {
  return (
    <DetailPage title="Zero-setup onboarding">
      <p className="text-[15px] leading-7 mb-4">
        Zero-setup onboarding means memory works from the first message with no installation, configuration,
        or infrastructure required. Platform memory products like ChatGPT and Claude provide this by embedding
        memory into the chat product itself.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Trade-offs</h2>
      <p className="text-[15px] leading-7 mb-4">
        The convenience of zero-setup comes at a cost: the vendor controls where data lives, how it is
        structured, and what guarantees it provides. Users cannot export, version, or audit memory independently.
        Retrieval systems and file-based approaches require setup but offer more control. Neotoma requires
        installation but provides{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>
        ,{" "}
        <Link to="/versioned-history" className="text-foreground underline hover:text-foreground">
          versioned history
        </Link>
        , and{" "}
        <Link to="/human-inspectability" className="text-foreground underline hover:text-foreground">
          human inspectability
        </Link>{" "}
        in exchange.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Getting started with Neotoma</h2>
      <p className="text-[15px] leading-7 mb-4">
        While Neotoma is not zero-setup, the install process is minimal. See the{" "}
        <Link to="/install" className="text-foreground underline hover:text-foreground">
          install guide
        </Link>{" "}
        for step-by-step instructions.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`npm install -g neotoma
neotoma api start --env prod`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Compare memory approaches on the{" "}
        <Link to="/memory-models" className="text-foreground underline hover:text-foreground">
          memory models
        </Link>{" "}
        page.
      </p>
    </DetailPage>
  );
}
