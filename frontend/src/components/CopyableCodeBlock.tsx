import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useState } from "react";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
import { useLocale } from "@/i18n/LocaleContext";
import { CODE_BLOCK_COPY_BUTTON_ABSOLUTE, CODE_BLOCK_EMERALD_PANEL } from "./code_block_copy_button_classes";
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
  /** Emerald-tinted shell to match the home evaluate prompt. */
  variant?: "default" | "emerald";
};

export function CopyableCodeBlock({
  code,
  className = "mb-4",
  previewLineCount,
  variant = "default",
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
    markCopied();
    await copyTextToClipboard(sanitizeCodeForCopy(code));
  };

  const paletteClass = variant === "emerald" ? CODE_BLOCK_EMERALD_PANEL : "code-block-palette";

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
        className={`rounded-lg border code-block-shell ${paletteClass} p-4 overflow-x-auto overflow-y-auto font-mono text-[13px] leading-6 whitespace-pre-wrap break-words ${canExpand && !showFullCode ? "max-h-60 md:max-h-none" : ""} ${className}`}
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
