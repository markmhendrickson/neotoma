import { Check, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
import { SITE_CODE_SNIPPETS } from "../site/site_data";
import { cn } from "@/lib/utils";
import { sendCtaClick } from "@/utils/analytics";
import { detailPageCtaLinkProps } from "./DetailPage";
import {
  CODE_BLOCK_EMERALD_PANEL,
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
};

/**
 * Home-style evaluate prompt: intro line + emerald panel + copy (matches SitePage evaluate section).
 */
export function HomeEvaluatePromptBlock({
  copyFeedbackId = "evaluate-section-prompt",
  className = "",
  agentTargetPhrase,
}: HomeEvaluatePromptBlockProps) {
  const [copied, markCopied] = useCopyFeedback(copyFeedbackId, 0);
  const prompt = SITE_CODE_SNIPPETS.homeEvaluatePrompt;
  const target = agentTargetPhrase ?? "any AI agent";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-[15px] leading-7 text-muted-foreground">
        Copy this prompt into {target} and let it evaluate Neotoma, then install the integration
        you&apos;re viewing if it fits your workflow.
      </p>
      <div className="relative w-full">
        <code
          className={`block text-sm px-4 py-3 pr-20 rounded-md text-left w-full ${CODE_BLOCK_EMERALD_PANEL}`}
        >
          {prompt}
        </code>
        <button
          type="button"
          className={`${HOME_EVALUATE_CTA_CLASS} absolute right-2 top-2 !px-3 !py-1.5 text-xs`}
          onClick={() => {
            copyTextToClipboard(prompt);
            markCopied();
            sendCtaClick("evaluate_copy_prompt");
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
      <p className="text-[13px] leading-5 text-muted-foreground">
        <Link
          to="/evaluate"
          {...detailPageCtaLinkProps}
          className="font-medium text-foreground underline underline-offset-2 decoration-muted-foreground/50 hover:decoration-foreground/70 transition-colors"
          onClick={() => sendCtaClick("section_evaluate")}
        >
          Evaluation page
        </Link>
        <span className="mx-2 select-none text-border" aria-hidden>
          ·
        </span>
        <Link
          to="/install"
          {...detailPageCtaLinkProps}
          className="font-medium text-foreground underline underline-offset-2 decoration-muted-foreground/50 hover:decoration-foreground/70 transition-colors"
          onClick={() => sendCtaClick("evaluate_prompt_install")}
        >
          Install
        </Link>
      </p>
    </div>
  );
}
