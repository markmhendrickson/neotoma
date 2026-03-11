import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Clock, Copy, RotateCcw } from "lucide-react";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { Button } from "../ui/button";

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const cleaned = code
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) return "";
        const commentIndex = line.indexOf("#");
        if (commentIndex >= 0 && !line.trimStart().startsWith('"'))
          return line.slice(0, commentIndex).trimEnd();
        return line;
      })
      .filter((l) => l !== "")
      .join("\n");
    await navigator.clipboard.writeText(cleaned);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative mb-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 h-8 gap-1.5 shrink-0 border-emerald-600 bg-emerald-600 px-2.5 text-white shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950"
        aria-label={copied ? "Copied" : "Copy code"}
        onClick={onCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="text-[11px] font-semibold tracking-wide">{copied ? "Copied" : "Copy"}</span>
      </Button>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words">
        <span className="float-right h-8 w-20 shrink-0" aria-hidden />
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function QuickStartPage() {
  return (
    <DetailPage title="Quick start">
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 dark:text-sky-400">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          5-minute integration
        </span>
        <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 dark:text-sky-400">
          <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Fully reversible
        </span>
      </div>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-3">Agent-assisted install</h2>
      <p className="text-[15px] leading-7 mb-4">
        Paste this prompt into Claude, Codex, or Cursor. The agent handles npm install, init,
        and MCP configuration.
      </p>
      <CodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Manual install</h2>
      <p className="text-[15px] leading-7 mb-4">
        If you prefer to run the commands yourself:
      </p>
      <CodeBlock code={SITE_CODE_SNIPPETS.installCommands} />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">After installation</h2>
      <ol className="list-decimal pl-5 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Run <code className="text-foreground">neotoma init</code>, choose your client, and
          restart your tool.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          The agent gathers records from your session context and project metadata.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Review and approve. Nothing is stored until you confirm.
        </li>
      </ol>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Start the API server</h2>
      <p className="text-[15px] leading-7 mb-4">
        The API server provides the HTTP interface that MCP and the CLI communicate through.
      </p>
      <CodeBlock code={SITE_CODE_SNIPPETS.postInstallCommands} />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Connect MCP</h2>
      <p className="text-[15px] leading-7 mb-4">
        Add Neotoma to your MCP client configuration (Cursor, Claude, or Codex):
      </p>
      <CodeBlock code={SITE_CODE_SNIPPETS.stdioConfigJson} />

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          to="/docker"
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
        >
          Docker setup →
        </Link>
        <Link
          to="/cli"
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
        >
          CLI reference →
        </Link>
        <a
          href="https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#install"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
        >
          Full README →
        </a>
      </div>
    </DetailPage>
  );
}
