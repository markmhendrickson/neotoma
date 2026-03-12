import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
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
};

export function CopyableCodeBlock({ code, className = "mb-4" }: CopyableCodeBlockProps) {
  const [copied, markCopied] = useCopyFeedback(`copyable:${code}`);

  const onCopy = async () => {
    markCopied();
    await copyTextToClipboard(sanitizeCodeForCopy(code));
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 z-10 min-w-[88px] h-8 justify-center gap-1.5 shrink-0 border-emerald-600 bg-emerald-600 px-2.5 text-white shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 after:text-[11px] after:font-semibold after:tracking-wide after:content-[attr(aria-label)]"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={onCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre
        className={`rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words ${className}`}
      >
        <span className="float-right h-8 w-20 shrink-0" aria-hidden />
        <code>{code}</code>
      </pre>
    </div>
  );
}
