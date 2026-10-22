import { Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useCopyFeedback } from "@/lib/copy_feedback";
import { copyTextToClipboard } from "@/lib/copy_to_clipboard";
import "./site_snippet.css";

type SiteSnippetProps = {
  text: string;
  title: string;
  subtitle?: string;
  copyFeedbackId: string;
  label?: string;
  className?: string;
  prose?: boolean;
  children?: ReactNode;
  onAfterCopy?: () => void;
  copyLabel?: string;
  copiedLabel?: string;
  successMessage?: string;
};

/** Public-site snippets share one presentation and copy the source text without rewriting it. */
export function SiteSnippet({
  text,
  title,
  subtitle,
  copyFeedbackId,
  label,
  className = "",
  prose = false,
  children,
  onAfterCopy,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  successMessage = "Copied to clipboard",
}: SiteSnippetProps) {
  const [copied, markCopied] = useCopyFeedback(`${copyFeedbackId}:${text}`);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => setCopyFailed(false), [text, copyFeedbackId]);
  return (
    <div className={`site-snippet ${className}`}>
      <div className="site-snippet-header">
        <div className="site-snippet-heading">
          <p className="site-snippet-title">{title}</p>
          {subtitle && <p className="site-snippet-subtitle">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="site-snippet-copy"
          onClick={async () => {
            const ok = await copyTextToClipboard(text);
            setCopyFailed(!ok);
            if (ok) {
              markCopied();
              onAfterCopy?.();
            }
          }}
        >
          {copied && !copyFailed ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Copy size={15} aria-hidden="true" />
          )}
          {copied && !copyFailed ? copiedLabel : copyLabel}
        </button>
      </div>
      <p
        className={
          copyFailed ? "site-snippet-status site-snippet-error plan-copy-error" : "sr-only"
        }
        role="status"
        aria-live="polite"
      >
        {copyFailed
          ? "Copy failed. Try again, or select the text below and copy manually."
          : copied
            ? successMessage
            : ""}
      </p>
      {prose ? (
        <p className="site-snippet-prose">{text}</p>
      ) : (
        <pre
          className="site-snippet-code plan-pre"
          tabIndex={0}
          role="region"
          aria-label={label ?? title}
        >
          <code>{children ?? text}</code>
        </pre>
      )}
    </div>
  );
}
