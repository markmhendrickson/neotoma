import { useState } from "react";
import { Link } from "react-router-dom";
import { useHashSyncedTab } from "@/hooks/use_hash_synced_tab";
import { Check, Clock, Copy, RotateCcw } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { useCopyFeedback } from "../../lib/copy_feedback";
import { copyTextToClipboard } from "../../lib/copy_to_clipboard";
import {
  PRODUCT_NAV_SOURCES,
  sendFunnelInstallPromptCopy,
  type InstallPromptCopyBlock,
} from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { CODE_BLOCK_COPY_BUTTON_ABSOLUTE } from "../code_block_copy_button_classes";
import { DetailPage } from "../DetailPage";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { CodexIcon } from "../icons/CodexIcon";
import { CursorIcon } from "../icons/CursorIcon";
import { OpenClawIcon } from "../icons/OpenClawIcon";

const INTEGRATIONS = [
  {
    label: "Claude Code",
    href: "/neotoma-with-claude-code",
    desc: "Persistent memory for Claude Code's local CLI agent",
    Icon: SiClaude,
  },
  {
    label: "Claude",
    href: "/neotoma-with-claude",
    desc: "Structured state alongside Claude platform memory",
    Icon: SiClaude,
  },
  {
    label: "ChatGPT",
    href: "/neotoma-with-chatgpt",
    desc: "Deterministic memory for ChatGPT conversations",
    Icon: SiOpenai,
  },
  {
    label: "Codex",
    href: "/neotoma-with-codex",
    desc: "Cross-task memory and CLI fallback",
    Icon: CodexIcon,
  },
  {
    label: "Cursor",
    href: "/neotoma-with-cursor",
    desc: "Persistent memory alongside Cursor context",
    Icon: CursorIcon,
  },
  {
    label: "OpenClaw",
    href: "/neotoma-with-openclaw",
    desc: "User-owned memory for OpenClaw agents",
    Icon: OpenClawIcon,
  },
] as const;

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

function CodeBlock({
  code,
  copyFeedbackId,
  installBlock,
}: {
  code: string;
  copyFeedbackId: string;
  installBlock: InstallPromptCopyBlock;
}) {
  const [copied, markCopied] = useCopyFeedback(copyFeedbackId, 0);

  const onCopy = async () => {
    const ok = await copyTextToClipboard(sanitizeCodeForCopy(code));
    if (!ok) return;
    markCopied();
    sendFunnelInstallPromptCopy(installBlock);
  };

  return (
    <div className="relative mb-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={CODE_BLOCK_COPY_BUTTON_ABSOLUTE}
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

export function InstallPage() {
  const { tab: installDockerTab, setTab: setInstallDockerTab } = useHashSyncedTab("agent", ["agent", "human"]);

  return (
    <DetailPage title="Install options">
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

      <div className="mb-8 rounded-lg border border-border/60 bg-muted/30 p-4">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Want the full agent-driven sequence? Start with evaluation, then let the
          agent install if needed, activate Neotoma with your data, and configure
          the tool you are in.
        </p>
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.installPageEvaluateCta}
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground !no-underline hover:!no-underline hover:bg-muted transition-colors"
        >
          Start with evaluation →
        </TrackedProductLink>
      </div>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-3">Agent-assisted install</h2>
      <p className="text-[15px] leading-7 mb-4">
        If you want to skip the initial evaluation page and proceed directly from
        install, paste this prompt into Claude, Codex, Cursor, or a similar
        agent. The prompt is concise; this page contains the full install-first
        sequence the agent should follow.
      </p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.agentInstallPrompt}
        copyFeedbackId="install-copy-agent-assisted"
        installBlock="agent_assisted"
      />

      <h3 className="text-[17px] font-medium tracking-[-0.01em] mt-6 mb-3">
        Agent: install-first instructions
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Use this path only when the user already wants to proceed with Neotoma
        and does not need the broader fit-assessment flow on{" "}
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.installPageInlineEvaluate}
          className="underline underline-offset-2 hover:no-underline"
        >
          /evaluate
        </TrackedProductLink>
        .
      </p>
      <ol className="list-decimal pl-5 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Confirm the install-first path</strong>{" "}
          - verify that the user wants to proceed now, identify their current
          tool, and note any major tool constraints that affect setup quality.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Install only if needed</strong> -
          check whether Neotoma is already installed. If not, run{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">npm install -g neotoma</code>{" "}
          and{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">neotoma init</code>.
          If it is already installed, skip re-installation unless something is
          broken.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Set the first data target</strong>{" "}
          - determine what data should be stored first and, if needed, ask the
          user which onboarding mode they want: quick win, guided, or power
          user.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Run activation</strong> - execute{" "}
          <a
            href="https://github.com/markmhendrickson/neotoma/blob/main/install.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {SITE_CODE_SNIPPETS.activationSequence}
          </a>
          : discover candidates, preview them, ingest confirmed sources,
          reconstruct a timeline, then query and correct.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Configure the current tool</strong>{" "}
          - after first value is visible, set up the strongest ongoing Neotoma
          workflow for the tool in use. If that tool is too constrained, say so
          explicitly and recommend a better-supported primary environment.
        </li>
      </ol>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Canonical written reference:{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/install.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          install.md
        </a>
        . If the user wants the broader qualification flow first, send them to{" "}
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.installPageInlineEvaluate}
          className="underline underline-offset-2 hover:no-underline"
        >
          /evaluate
        </TrackedProductLink>
        .
      </p>

      <p className="text-[13px] leading-5 text-muted-foreground mb-4">
        More options:{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#install"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          Manual install
        </a>
        {" · "}
        <TrackedProductLink
          to="/install#docker"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.installPageDockerHash}
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          Docker
        </TrackedProductLink>
        {" · "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-4">Direct integration docs</h2>
      <ul className="list-none pl-0 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3 mb-10 [&_a]:!no-underline [&_a]:hover:!no-underline">
        {INTEGRATIONS.map(({ label, href, desc, Icon }) => (
          <li key={href} className="h-full">
            <Link
              to={href}
              className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
            >
              <Card className="h-full transition-colors hover:bg-muted/50 border border-border">
                <CardContent className="p-4 h-full">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                      aria-hidden
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-[15px] text-foreground block">
                        {label}
                      </span>
                      <span className="text-[13px] leading-snug text-muted-foreground block mt-0.5">
                        {desc}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Manual install</h2>
      <p className="text-[15px] leading-7 mb-4">
        If you prefer to run the commands yourself:
      </p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.installCommands}
        copyFeedbackId="install-copy-manual-commands"
        installBlock="manual_commands"
      />

      <h3 className="text-[17px] font-medium tracking-[-0.01em] mt-6 mb-3">After installation</h3>
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">
        Once installation is complete, activation follows. If evaluation already
        identified the first data to store, carry that forward. Otherwise determine
        it now, then run{" "}
        <strong className="text-foreground">
          {SITE_CODE_SNIPPETS.activationSequence}
        </strong>
        . After first value is visible, configure the current tool for robust
        ongoing usage.
      </p>
      <ol className="list-decimal pl-5 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Preference selection</strong> - if
          evaluation already established the priority data types and onboarding mode,
          carry them forward. Otherwise choose which data types matter most
          (project files, chat transcripts, meeting notes, financial docs, code
          context, custom paths) and pick a mode: quick win, guided, or power
          user.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Discovery</strong> - continue from any
          candidate data already identified during evaluation. If that work has not
          happened yet, the agent scans shallowly based on your preferences, groups
          results into domains (not file counts), and checks for chat transcript
          exports and platform memory.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Propose and confirm</strong> - for each
          domain the agent explains why it was selected, what entities it likely contains,
          and what timeline value it could unlock. You confirm per-folder or per-file
          before anything is stored.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Ingest and reconstruct</strong> -
          confirmed files are ingested and the agent reconstructs the strongest
          timeline with provenance - every event traced to a specific source file.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Query and correct</strong> - the agent
          surfaces a follow-up query against the reconstructed timeline and offers
          next actions, then asks whether the timeline is accurate and supports
          corrections (wrong merge, wrong date, source exclusion).
        </li>
      </ol>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Start the API server</h2>
      <p className="text-[15px] leading-7 mb-4">
        The API server provides the HTTP interface that MCP and the CLI communicate through.
      </p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.postInstallCommands}
        copyFeedbackId="install-copy-post-install"
        installBlock="post_install_commands"
      />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Connect MCP</h2>
      <p className="text-[15px] leading-7 mb-4">
        Add Neotoma to your MCP client configuration (Cursor, Claude, or Codex):
      </p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.stdioConfigJson}
        copyFeedbackId="install-copy-stdio-mcp"
        installBlock="stdio_mcp"
      />

      <h2 id="docker" className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">
        Docker
      </h2>
      <Tabs value={installDockerTab} onValueChange={setInstallDockerTab} className="mb-4">
        <TabsList className="mb-3">
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="human">Human</TabsTrigger>
        </TabsList>
        <TabsContent value="agent">
          <p className="text-[15px] leading-7 mb-4">
            If you want your assistant to handle Docker setup, use a prompt like this:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerAgentPrompt}
            copyFeedbackId="install-copy-docker-agent"
            installBlock="docker_agent_prompt"
          />
        </TabsContent>
        <TabsContent value="human">
          <p className="text-[15px] leading-7 mb-4">
            If you prefer not to install directly on your host machine, you can run the full
            Neotoma stack (API server, CLI, and MCP server) inside a Docker
            container. Clone the Neotoma repository and build the image:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerBuild}
            copyFeedbackId="install-copy-docker-build"
            installBlock="docker_build"
          />
          <p className="text-[15px] leading-7 mb-4">
            Start a container with a persistent volume so your data survives restarts:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerRun}
            copyFeedbackId="install-copy-docker-run"
            installBlock="docker_run"
          />
          <p className="text-[15px] leading-7 mb-4">
            Initialize the data directory inside the container:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerInit}
            copyFeedbackId="install-copy-docker-init"
            installBlock="docker_init"
          />
          <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
            Connect MCP from Docker
          </h3>
          <p className="text-[15px] leading-7 mb-4">
            To connect an MCP client (Cursor, Claude, Codex) to the containerized server,
            add this to your MCP configuration:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerMcpConfig}
            copyFeedbackId="install-copy-docker-mcp"
            installBlock="docker_mcp"
          />
          <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
            Use the CLI from Docker
          </h3>
          <p className="text-[15px] leading-7 mb-4">
            The <code>neotoma</code> CLI is available inside the container. Prefix commands
            with <code>docker exec</code>:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerCliExample}
            copyFeedbackId="install-copy-docker-cli"
            installBlock="docker_cli_example"
          />
          <p className="text-[15px] leading-7 mb-4">
            The API is also available at <code>http://localhost:3080</code> for direct HTTP
            access.
          </p>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-3">
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
