import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactPrefixedId } from "@/lib/humanize";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CopyIdButtonProps {
  id: string;
  className?: string;
  /** When provided, overrides the default short-id label. */
  label?: string;
}

export function CopyIdButton({ id, className, label }: CopyIdButtonProps) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy full ID: ${id}`}
          className={cn(
            "inline-flex items-center gap-1 rounded border border-transparent bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted",
            className,
          )}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3 opacity-60" aria-hidden="true" />
          )}
          <span>{label ?? compactPrefixedId(id)}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-[min(100vw-2rem,28rem)] font-mono text-xs break-all"
      >
        {id}
      </TooltipContent>
    </Tooltip>
  );
}
