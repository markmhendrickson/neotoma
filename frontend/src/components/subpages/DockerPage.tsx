import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { useCopyFeedback } from "../../lib/copy_feedback";
import { copyTextToClipboard } from "../../lib/copy_to_clipboard";
import { DetailPage } from "../DetailPage";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

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

function CodeBlock({ code }: { code: string }) {
  const [copied, markCopied] = useCopyFeedback(`docker:${code}`);

  const onCopy = async () => {
    markCopied();
    await copyTextToClipboard(sanitizeCodeForCopy(code));
  };

  return (
    <div className="relative mb-4">
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
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words">
        <span className="float-right h-8 w-20 shrink-0" aria-hidden />
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DockerPage() {
  return (
    <DetailPage title="Run with Docker">
      <Tabs defaultValue="agent" className="mb-4">
        <TabsList className="mb-3">
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="human">Human</TabsTrigger>
        </TabsList>
        <TabsContent value="agent">
          <p className="text-[15px] leading-7 mb-4">
            If you want your assistant to handle Docker setup, use a prompt like this:
          </p>
          <CodeBlock code={SITE_CODE_SNIPPETS.dockerAgentPrompt} />
        </TabsContent>
        <TabsContent value="human">
          <p className="text-[15px] leading-7 mb-4">
            If you prefer not to install directly on your host machine, you can run the full
            Neotoma stack&mdash;API server, CLI, and MCP server&mdash;inside a Docker
            container. Clone the Neotoma repository and build the image:
          </p>
          <CodeBlock code={SITE_CODE_SNIPPETS.dockerBuild} />
          <p className="text-[15px] leading-7 mb-4">
            Start a container with a persistent volume so your data survives restarts:
          </p>
          <CodeBlock code={SITE_CODE_SNIPPETS.dockerRun} />
          <p className="text-[15px] leading-7 mb-4">
            Initialize the data directory inside the container:
          </p>
          <CodeBlock code={SITE_CODE_SNIPPETS.dockerInit} />
          <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
            Connect MCP from Docker
          </h3>
          <p className="text-[15px] leading-7 mb-4">
            To connect an MCP client (Cursor, Claude, Codex) to the containerized server,
            add this to your MCP configuration:
          </p>
          <CodeBlock code={SITE_CODE_SNIPPETS.dockerMcpConfig} />
          <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
            Use the CLI from Docker
          </h3>
          <p className="text-[15px] leading-7 mb-4">
            The <code>neotoma</code> CLI is available inside the container. Prefix commands
            with <code>docker exec</code>:
          </p>
          <CodeBlock code={SITE_CODE_SNIPPETS.dockerCliExample} />
          <p className="text-[15px] leading-7 mb-4">
            The API is also available at <code>http://localhost:3080</code> for direct HTTP
            access.
          </p>
        </TabsContent>
      </Tabs>
    </DetailPage>
  );
}
