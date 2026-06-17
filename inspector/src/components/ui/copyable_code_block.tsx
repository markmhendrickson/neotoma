import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyableCodeBlockProps {
  /** The text that is rendered inside the block AND copied to the clipboard. */
  code: string;
  /**
   * `code` — monospace shell/config snippets (CLI, JSON, MCP config).
   * `prompt` — multi-line agent instructions (prose + numbered steps); app body
   * typography, no mid-token breaks.
   */
  variant?: "code" | "prompt";
  /** Optional accessible label for the copy button (defaults to "Copy to clipboard"). */
  copyAriaLabel?: string;
  /** Optional className appended to the wrapper `<div>` (e.g. for spacing). */
  className?: string;
  /** Optional className appended to the inner block (e.g. `max-h-64` for tall code). */
  preClassName?: string;
  /** Optional secondary content rendered below the code block (e.g. doc links). */
  footer?: ReactNode;
}

/**
 * Canonical copy-to-clipboard code block for Inspector product UI.
 *
 * Aesthetic source of truth: the agent activation prompt on the home page.
 * One reusable primitive — do not re-implement copy-block chrome ad hoc per
 * feature. If a callsite needs a different visual treatment, evolve this
 * component (e.g. add a `variant` prop) rather than forking.
 *
 * Tokens used (all from `inspector/src/index.css`):
 *   surface  — `bg-muted/40` for code, `bg-accent/35` for prompts
 *   border   — `border-border` for code, `border-primary/25` + subtle ring for prompts
 *   text     — `code`: inherited mono; `prompt`: `font-sans text-base text-foreground`
 *   action   — `Button` size="sm" variant="outline"
 *
 * Showcased on `/design?tab=code`.
 */
export function CopyableCodeBlock({
  code,
  variant = "code",
  copyAriaLabel = "Copy to clipboard",
  className,
  preClassName,
  footer,
}: CopyableCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard write can fail in non-secure contexts; silently no-op
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <pre
          className={cn(
            "mb-0 overflow-auto rounded-md border pr-12",
            variant === "prompt"
              ? [
                  "border-primary/25 bg-accent/35 p-4 font-sans text-base leading-7 text-foreground whitespace-pre-wrap",
                  "shadow-sm ring-1 ring-primary/10 ring-inset",
                  "border-l-4 border-l-primary/55",
                ]
              : "border-border bg-muted/40 p-3 font-mono leading-[inherit] whitespace-pre-wrap break-words",
            preClassName,
          )}
        >
          {code}
        </pre>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCopy}
          aria-label={copyAriaLabel}
          className="absolute top-2 right-2 h-7 gap-1 px-2 text-sm"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy
            </>
          )}
        </Button>
      </div>
      {footer ?? null}
    </div>
  );
}
