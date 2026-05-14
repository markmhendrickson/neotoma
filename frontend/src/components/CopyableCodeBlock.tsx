import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useState } from "react";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
import { useLocale } from "@/i18n/LocaleContext";
import { cn } from "@/lib/utils";
import {
  CODE_BLOCK_CARD_INNER_CLASS,
  CODE_BLOCK_CARD_SHELL_CLASS,
  CODE_BLOCK_CHROME_STACK_CLASS,
  CODE_BLOCK_CHROME_SUBTITLE_CLASS,
  CODE_BLOCK_COPY_BUTTON_INLINE,
  EVALUATE_PROMPT_CARD_SHELL_CLASS,
  EVALUATE_PROMPT_PILL_CLASS,
  HOME_EVALUATE_CTA_CLASS,
} from "./code_block_copy_button_classes";
import { Button } from "./ui/button";

function sanitizeCodeForCopy(rawCode: string): string {
  return rawCode
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) return "";
      const commentIndex = line.indexOf("#");
      if (commentIndex >= 0 && !line.trimStart().startsWith('"'))
        return line.slice(0, commentIndex).trimEnd();
      return line;
    })
    .filter((line) => line !== "")
    .join("\n");
}

type CopyableCodeBlockProps = {
  code: string;
  className?: string;
  previewLineCount?: number;
  /** Emerald evaluate card: shell + pill + subtitle + header copy + neutral code (matches `HomeEvaluatePromptBlock`). */
  variant?: "default" | "emerald";
  /** Fires after a successful clipboard write (not on failure). */
  onAfterCopy?: () => void;
  /** Only when `variant="emerald"`. Defaults match the home evaluate section. */
  evaluateChromeTitle?: string;
  evaluateChromeSubtitle?: string;
};

export function CopyableCodeBlock({
  code,
  className = "mb-4",
  previewLineCount,
  variant = "default",
  onAfterCopy,
  evaluateChromeTitle = "Evaluation prompt",
  evaluateChromeSubtitle = "Reads the page, then evaluates fit against your real workflow.",
}: CopyableCodeBlockProps) {
  const { dict } = useLocale();
  const [copied, markCopied] = useCopyFeedback(`copyable:${code}`);
  const [showFullCode, setShowFullCode] = useState(false);
  const lines = code.split("\n");
  const canExpand =
    typeof previewLineCount === "number" && previewLineCount > 0 && lines.length > previewLineCount;
  const displayCode =
    canExpand && !showFullCode ? `${lines.slice(0, previewLineCount).join("\n")}\n...` : code;
  const defaultChromeTitle = "Code snippet";
  const defaultChromeSubtitle = "Copy the exact snippet shown below.";

  const onCopy = async () => {
    const ok = await copyTextToClipboard(sanitizeCodeForCopy(code));
    if (!ok) return;
    markCopied();
    onAfterCopy?.();
  };

  if (variant === "emerald") {
    const copyButtonClass = cn(
      HOME_EVALUATE_CTA_CLASS,
      "order-3 w-full min-h-11 shrink-0 justify-center px-5 py-3.5 text-sm sm:order-none sm:h-8 sm:w-auto sm:min-h-0 sm:justify-center sm:!px-3 sm:!py-1.5 sm:text-xs",
    );
    return (
      <div className={cn("relative w-full text-left", EVALUATE_PROMPT_CARD_SHELL_CLASS)}>
        <div className="mb-3 flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-3">
          <div className="order-1 w-full min-w-0 space-y-2 px-1 sm:order-none sm:col-start-1 sm:row-start-1">
            <div className={EVALUATE_PROMPT_PILL_CLASS}>
              <span className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80" aria-hidden />
              {evaluateChromeTitle}
            </div>
            <div className="text-fine leading-5 text-muted-foreground">{evaluateChromeSubtitle}</div>
          </div>
          <button type="button" className={copyButtonClass} onClick={onCopy}>
            {copied ? (
              <>
                <Check className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                {dict.copied}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                {dict.copy}
              </>
            )}
          </button>
          <pre
            className={cn(
              "order-2 mb-0 rounded-xl border border-border/80 bg-muted/35 text-foreground shadow-inner shadow-black/5 code-block-shell p-4 overflow-x-auto overflow-y-auto font-mono text-ui leading-6 whitespace-pre-wrap break-words sm:order-none sm:col-span-2 sm:row-start-2",
              canExpand && !showFullCode && "max-h-60 md:max-h-none",
              className,
            )}
          >
            <code>{displayCode}</code>
          </pre>
          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="order-4 mt-0 px-2 h-10 w-full justify-center text-fine text-muted-foreground hover:text-foreground sm:order-none sm:col-span-2 sm:row-start-3 sm:mt-2 sm:h-8 sm:w-auto sm:justify-start"
              onClick={() => setShowFullCode((prev) => !prev)}
              aria-label={showFullCode ? dict.showLess : dict.showMore}
            >
              {showFullCode ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-1" />
                  {dict.showLess}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                  {dict.showMore}
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full text-left", CODE_BLOCK_CARD_SHELL_CLASS)}>
      <div className="mb-3 flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-3">
        <div className={CODE_BLOCK_CHROME_STACK_CLASS}>
          <div className={EVALUATE_PROMPT_PILL_CLASS}>
            <span className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80" aria-hidden />
            {defaultChromeTitle}
          </div>
          <div className={CODE_BLOCK_CHROME_SUBTITLE_CLASS}>{defaultChromeSubtitle}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={CODE_BLOCK_COPY_BUTTON_INLINE}
          aria-label={copied ? dict.copied : dict.copy}
          onClick={onCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre
        className={cn(
          CODE_BLOCK_CARD_INNER_CLASS,
          "p-4 overflow-x-auto overflow-y-auto font-mono text-ui leading-6 whitespace-pre-wrap break-words",
          canExpand && !showFullCode && "max-h-60 md:max-h-none",
          "sm:col-span-2 sm:row-start-2",
          className,
        )}
      >
        <code>{displayCode}</code>
      </pre>
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 px-2 h-8 text-fine text-muted-foreground hover:text-foreground"
          onClick={() => setShowFullCode((prev) => !prev)}
          aria-label={showFullCode ? dict.showLess : dict.showMore}
        >
          {showFullCode ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" />
              {dict.showLess}
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              {dict.showMore}
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
