import { Check, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
import { SITE_CODE_SNIPPETS } from "../site/site_data";
import { cn } from "@/lib/utils";
import {
  sendCtaClick,
  sendFunnelEvaluatePromptCopy,
  type EvaluatePromptCopySurface,
} from "@/utils/analytics";
import { detailPageCtaLinkProps } from "./DetailPage";
import {
  EVALUATE_PROMPT_CARD_SHELL_CLASS,
  EVALUATE_PROMPT_PILL_CLASS,
  HOME_EVALUATE_CTA_CLASS,
} from "./code_block_copy_button_classes";

type HomeEvaluatePromptBlockProps = {
  /** Distinct id when multiple copy blocks exist on one page. */
  copyFeedbackId?: string;
  className?: string;
  /**
   * Completes "Copy this prompt into …". Home uses the default ("any AI agent");
   * integration pages pass the specific agent or surface (e.g. "Claude Code", "a Cursor agent chat").
   */
  agentTargetPhrase?: string;
  /** Funnel analytics: marketing home evaluate section vs integration doc pages. */
  evaluatePromptCopySurface?: EvaluatePromptCopySurface;
  /** Hide the intro paragraph above the prompt card (e.g. when context is provided by a sibling column). */
  hideIntro?: boolean;
};

/**
 * Home-style evaluate prompt: intro line + neutral prompt card + copy action.
 */
export function HomeEvaluatePromptBlock({
  copyFeedbackId = "evaluate-section-prompt",
  className = "",
  agentTargetPhrase,
  evaluatePromptCopySurface = "home",
  hideIntro = false,
}: HomeEvaluatePromptBlockProps) {
  const [copied, markCopied] = useCopyFeedback(copyFeedbackId, 0);
  const prompt = SITE_CODE_SNIPPETS.homeEvaluatePrompt;
  const target = agentTargetPhrase ?? "any AI agent";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!hideIntro && (
        <p className="text-[15px] leading-7 text-muted-foreground">
          Copy this prompt into {target} to have it read the{" "}
          <Link
            to="/evaluate"
            {...detailPageCtaLinkProps}
            className="font-medium text-foreground underline underline-offset-2 decoration-muted-foreground/50 hover:decoration-foreground/70 transition-colors"
            onClick={() => sendCtaClick("section_evaluate")}
          >
            evaluation page
          </Link>
          , inspect your tool, workspace, and configuration context, then judge
          whether Neotoma fits your real workflow and what to persist first.
        </p>
      )}
      <div className={cn("w-full", hideIntro ? "" : "my-4", EVALUATE_PROMPT_CARD_SHELL_CLASS)}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2 px-1 text-left">
            <div className={EVALUATE_PROMPT_PILL_CLASS}>
              <span className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80" aria-hidden />
              Evaluation prompt
            </div>
            {!hideIntro && (
              <div className="text-[12px] leading-5 text-muted-foreground">
                Reads the page, then evaluates fit against your real workflow.
              </div>
            )}
          </div>
          <button
            type="button"
            className={`${HOME_EVALUATE_CTA_CLASS} hidden sm:inline-flex h-8 shrink-0 !px-3 !py-1.5 text-xs`}
            onClick={async () => {
              const ok = await copyTextToClipboard(prompt);
              if (!ok) return;
              markCopied();
              sendCtaClick("evaluate_copy_prompt");
              sendFunnelEvaluatePromptCopy(evaluatePromptCopySurface);
            }}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Copy
              </>
            )}
          </button>
        </div>
        <code
          className="block w-full rounded-xl border border-border/80 bg-muted/35 px-4 py-4 text-left font-mono text-[13px] leading-6 text-foreground whitespace-pre-wrap break-words shadow-inner shadow-black/5"
        >
          {prompt}
        </code>
        <button
          type="button"
          className={`${HOME_EVALUATE_CTA_CLASS} sm:hidden mt-3 w-full h-10 !py-2 text-sm`}
          onClick={async () => {
            const ok = await copyTextToClipboard(prompt);
            if (!ok) return;
            markCopied();
            sendCtaClick("evaluate_copy_prompt");
            sendFunnelEvaluatePromptCopy(evaluatePromptCopySurface);
          }}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 shrink-0" aria-hidden />
              Copy prompt
            </>
          )}
        </button>
      </div>
    </div>
  );
}
