import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import {
  sendCtaClick,
  sendFunnelEvaluatePromptCopy,
  type EvaluatePromptCopySurface,
} from "@/utils/analytics";
import { detailPageCtaLinkProps } from "./DetailPage";
import { SiteSnippet } from "./SiteSnippet";

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
  const { locale, pack } = useLocale();
  const ev = pack.homeBody.evaluate;
  const prompt = ev.homeEvaluatePrompt;
  const target = agentTargetPhrase ?? ev.evaluatePromptDefaultAgentTarget;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!hideIntro && (
        <p className="text-[15px] leading-7 text-muted-foreground">
          {ev.evaluatePromptIntroBeforeTarget}
          {target}
          {ev.evaluatePromptIntroBetweenTargetAndLink}
          <Link
            to={localizePath("/evaluate", locale)}
            {...detailPageCtaLinkProps}
            className="font-medium text-foreground underline underline-offset-2 decoration-muted-foreground/50 hover:decoration-foreground/70 transition-colors"
            onClick={() => sendCtaClick("section_evaluate")}
          >
            {ev.evaluatePromptIntroLink}
          </Link>
          {ev.evaluatePromptIntroAfterLink}
        </p>
      )}
      <SiteSnippet
        text={prompt}
        title={ev.evaluatePromptPill}
        prose
        copyFeedbackId={copyFeedbackId}
        subtitle={hideIntro ? undefined : ev.evaluatePromptCardSubtitle}
        copyLabel={ev.evaluatePromptCopy}
        copiedLabel={ev.evaluatePromptCopied}
        onAfterCopy={() => {
          sendCtaClick("evaluate_copy_prompt");
          sendFunnelEvaluatePromptCopy(evaluatePromptCopySurface);
        }}
      />
    </div>
  );
}
