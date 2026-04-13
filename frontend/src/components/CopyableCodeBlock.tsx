import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useState } from "react";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
import { useLocale } from "@/i18n/LocaleContext";
import { cn } from "@/lib/utils";
import {
  CODE_BLOCK_COPY_BUTTON_ABSOLUTE,
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

  const onCopy = async () => {
    const ok = await copyTextToClipboard(sanitizeCodeForCopy(code));
    if (!ok) return;
    markCopied();
    onAfterCopy?.();
  };

  if (variant === "emerald") {
    return (
      <div className={cn("relative w-full text-left", EVALUATE_PROMPT_CARD_SHELL_CLASS)}>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full min-w-0 space-y-2 px-1">
            <div className={EVALUATE_PROMPT_PILL_CLASS}>
              <span className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80" aria-hidden />
              {evaluateChromeTitle}
            </div>
            <div className="text-[12px] leading-5 text-muted-foreground">{evaluateChromeSubtitle}</div>
          </div>
          <button
            type="button"
            className={cn(HOME_EVALUATE_CTA_CLASS, "h-8 shrink-0 !px-3 !py-1.5 text-xs")}
            onClick={onCopy}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {dict.copied}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {dict.copy}
              </>
            )}
          </button>
        </div>
        <pre
          className={cn(
            "rounded-xl border border-border/80 bg-muted/35 text-foreground shadow-inner shadow-black/5 code-block-shell p-4 overflow-x-auto overflow-y-auto font-mono text-[13px] leading-6 whitespace-pre-wrap break-words",
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
            className="mt-2 px-2 h-8 text-[12px] text-muted-foreground hover:text-foreground"
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

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={CODE_BLOCK_COPY_BUTTON_ABSOLUTE}
        aria-label={copied ? dict.copied : dict.copy}
        onClick={onCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre
        className={cn(
          "rounded-lg border code-block-shell code-block-palette p-4 overflow-x-auto overflow-y-auto font-mono text-[13px] leading-6 whitespace-pre-wrap break-words",
          canExpand && !showFullCode && "max-h-60 md:max-h-none",
          className,
        )}
      >
        <span className="float-right h-8 w-20 shrink-0" aria-hidden />
        <code>{displayCode}</code>
      </pre>
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 px-2 h-8 text-[12px] text-muted-foreground hover:text-foreground"
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
