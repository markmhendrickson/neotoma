import { Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useCopyFeedback } from "@/lib/copy_feedback";
import { copyTextToClipboard } from "@/lib/copy_to_clipboard";
import { useOptionalLocale } from "@/i18n/LocaleContext";
import { refractor } from "refractor/core";
import bash from "refractor/bash";
import type { RootContent } from "hast";
import "./site_snippet.css";

refractor.register(bash);
function highlightedNodes(nodes: RootContent[]): ReactNode {
  return nodes.map((node, index) =>
    node.type === "text" ? (
      node.value
    ) : node.type === "element" ? (
      <span
        key={index}
        className={
          Array.isArray(node.properties.className) ? node.properties.className.join(" ") : undefined
        }
      >
        {highlightedNodes(node.children)}
      </span>
    ) : null
  );
}

type SiteSnippetProps = {
  text: string;
  title: ReactNode;
  chrome?: boolean;
  highlight?: boolean;
  subtitle?: string;
  copyFeedbackId: string;
  label?: string;
  className?: string;
  prose?: boolean;
  copyInBody?: boolean;
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
  chrome = true,
  highlight = false,
  copyFeedbackId,
  label,
  className = "",
  prose = false,
  copyInBody = false,
  children,
  onAfterCopy,
  copyLabel,
  copiedLabel,
  successMessage,
}: SiteSnippetProps) {
  const spanish = useOptionalLocale()?.locale === "es";
  const idleLabel = copyLabel ?? (spanish ? "Copiar" : "Copy");
  const doneLabel = copiedLabel ?? (spanish ? "Copiado" : "Copied");
  const doneMessage =
    successMessage ?? (spanish ? "Copiado al portapapeles" : "Copied to clipboard");
  const accessibleTitle =
    typeof title === "string" ? title : (label ?? (spanish ? "fragmento" : "snippet"));
  const [copied, markCopied] = useCopyFeedback(`${copyFeedbackId}:${text}`);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => setCopyFailed(false), [text, copyFeedbackId]);
  const copyButton = (
    <button
      type="button"
      className="site-snippet-copy"
      aria-label={`${copied && !copyFailed ? doneLabel : idleLabel} ${accessibleTitle}`}
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
      {copied && !copyFailed ? doneLabel : idleLabel}
    </button>
  );
  const status = (
    <p
      className={copyFailed ? "site-snippet-status site-snippet-error plan-copy-error" : "sr-only"}
      role="status"
      aria-live="polite"
    >
      {copyFailed
        ? spanish
          ? "No se pudo copiar. Inténtalo de nuevo o selecciona el texto y cópialo manualmente."
          : "Copy failed. Try again, or select the text below and copy manually."
        : copied
          ? doneMessage
          : ""}
    </p>
  );
  const codeBlock = (
    <pre
      className="site-snippet-code plan-pre"
      tabIndex={0}
      role="region"
      aria-label={label ?? (typeof title === "string" ? title : spanish ? "Comandos" : "Commands")}
    >
      <code>
        {children ??
          (highlight ? highlightedNodes(refractor.highlight(text, "bash").children) : text)}
      </code>
    </pre>
  );
  return (
    <div className={`site-snippet ${chrome ? "" : "site-snippet-no-chrome"} ${className}`}>
      {copyButton}
      {prose ? (
        <div className="site-snippet-prose-flow">
          <p className="site-snippet-title">{title}</p>
          {subtitle && <p className="site-snippet-subtitle">{subtitle}</p>}
          {status}
          <div
            className={
              copyInBody ? "site-snippet-body site-snippet-body-prose" : "site-snippet-body-prose"
            }
          >
            <p className="site-snippet-prose">{text}</p>
          </div>
        </div>
      ) : (
        <>
          {chrome && (
            <div className="site-snippet-header">
              <div className="site-snippet-heading">
                <p className="site-snippet-title">{title}</p>
              </div>
              {subtitle && <p className="site-snippet-subtitle">{subtitle}</p>}
            </div>
          )}
          {status}
          {copyInBody ? <div className="site-snippet-body">{codeBlock}</div> : codeBlock}
        </>
      )}
    </div>
  );
}
