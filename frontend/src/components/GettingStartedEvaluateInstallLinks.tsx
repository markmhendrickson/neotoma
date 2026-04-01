import { HomeEvaluatePromptBlock } from "./HomeEvaluatePromptBlock";

type GettingStartedEvaluateInstallLinksProps = {
  /** Completes "Copy this prompt into …" for this integration (e.g. "Claude Code", "ChatGPT"). */
  agentTargetPhrase: string;
};

/** Evaluate prompt block for integration DetailPage "Getting started" sections. */
export function GettingStartedEvaluateInstallLinks({ agentTargetPhrase }: GettingStartedEvaluateInstallLinksProps) {
  return (
    <HomeEvaluatePromptBlock
      copyFeedbackId="getting-started-evaluate-prompt"
      className="mb-4"
      agentTargetPhrase={agentTargetPhrase}
      evaluatePromptCopySurface="integration_doc"
    />
  );
}
