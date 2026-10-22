import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/i18n/LocaleContext";
import { SiteSnippet } from "./SiteSnippet";

type CopyableCodeBlockProps = {
  code: string;
  className?: string;
  previewLineCount?: number;
  /** Legacy callers retain the prop; all public snippets now share the editorial presentation. */
  variant?: "default" | "emerald";
  onAfterCopy?: () => void;
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
  const [showFullCode, setShowFullCode] = useState(false);
  const lines = code.split("\n");
  const canExpand =
    typeof previewLineCount === "number" && previewLineCount > 0 && lines.length > previewLineCount;
  const displayCode =
    canExpand && !showFullCode ? `${lines.slice(0, previewLineCount).join("\n")}\n...` : code;
  return (
    <>
      <SiteSnippet
        text={code}
        title={variant === "emerald" ? evaluateChromeTitle : "Code snippet"}
        subtitle={variant === "emerald" ? evaluateChromeSubtitle : undefined}
        copyFeedbackId={`copyable:${code}`}
        className={className}
        copyLabel={dict.copy}
        copiedLabel={dict.copied}
        onAfterCopy={onAfterCopy}
      >
        {displayCode}
      </SiteSnippet>
      {canExpand && (
        <button
          type="button"
          className="site-snippet-copy mb-4"
          onClick={() => setShowFullCode((v) => !v)}
        >
          {showFullCode ? (
            <ChevronUp size={15} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
          {showFullCode ? dict.showLess : dict.showMore}
        </button>
      )}
    </>
  );
}
