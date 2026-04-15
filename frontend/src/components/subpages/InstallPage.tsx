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
import {
  CODE_BLOCK_CARD_INNER_CLASS,
  CODE_BLOCK_CARD_SHELL_CLASS,
  CODE_BLOCK_CHROME_STACK_CLASS,
  CODE_BLOCK_CHROME_SUBTITLE_CLASS,
  CODE_BLOCK_COPY_BUTTON_INLINE,
  EVALUATE_PROMPT_PILL_CLASS,
} from "../code_block_copy_button_classes";
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

const INSTALL_BLOCK_CHROME: Record<InstallPromptCopyBlock, { title: string; subtitle: string }> = {
  agent_assisted: {
    title: "Agent prompt",
    subtitle: "Paste this into an assistant to run the install-first Neotoma flow.",
  },
  manual_commands: {
    title: "Manual install",
    subtitle: "Run these commands yourself on the host machine.",
  },
  post_install_commands: {
    title: "Start API",
    subtitle: "Bring up the local API so MCP and CLI can connect.",
  },
  stdio_mcp: {
    title: "MCP config",
    subtitle: "Add this client config to connect Neotoma over stdio.",
  },
  docker_agent_prompt: {
    title: "Docker prompt",
    subtitle: "Use this when you want an assistant to handle the Docker path.",
  },
  docker_build: {
    title: "Docker build",
    subtitle: "Build the Neotoma image from the repository checkout.",
  },
  docker_run: {
    title: "Docker run",
    subtitle: "Start a persistent container with the data volume mounted.",
  },
  docker_init: {
    title: "Docker init",
    subtitle: "Initialize the Neotoma data directory inside the container.",
  },
  docker_mcp: {
    title: "Docker MCP",
    subtitle: "Point your MCP client at the containerized Neotoma server.",
  },
  docker_cli_example: {
    title: "Docker CLI",
    subtitle: "Run Neotoma commands inside the container with `docker exec`.",
  },
  doc_neotoma_with_cursor: {
    title: "Cursor doc",
    subtitle: "Cursor-specific install and connection example.",
  },
  doc_neotoma_with_claude_code: {
    title: "Claude Code doc",
    subtitle: "Claude Code-specific install and connection example.",
  },
  doc_claude_connect_desktop: {
    title: "Claude Desktop doc",
    subtitle: "Claude Desktop connection example for Neotoma.",
  },
  doc_codex_connect_local_stdio: {
    title: "Codex doc",
    subtitle: "Codex local stdio connection example for Neotoma.",
  },
  doc_openclaw_connect_local_stdio: {
    title: "OpenClaw doc",
    subtitle: "OpenClaw local stdio connection example for Neotoma.",
  },
};

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
  const chrome = INSTALL_BLOCK_CHROME[installBlock];

  const onCopy = async () => {
    const ok = await copyTextToClipboard(sanitizeCodeForCopy(code));
    if (!ok) return;
    markCopied();
    sendFunnelInstallPromptCopy(installBlock);
  };

  return (
    <div className={`relative mb-4 w-full text-left ${CODE_BLOCK_CARD_SHELL_CLASS}`}>
      <div className="mb-3 flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-3">
        <div className={CODE_BLOCK_CHROME_STACK_CLASS}>
          <div className={EVALUATE_PROMPT_PILL_CLASS}>
            <span className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80" aria-hidden />
            {chrome.title}
          </div>
          <div className={CODE_BLOCK_CHROME_SUBTITLE_CLASS}>{chrome.subtitle}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={CODE_BLOCK_COPY_BUTTON_INLINE}
          aria-label={copied ? "Copied" : "Copy"}
          onClick={onCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre
        className={`${CODE_BLOCK_CARD_INNER_CLASS} code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

const INSTALL_IMPACT_ROWS = [
  {
    what: "Global npm package",
    path: "neotoma (global node_modules)",
    scope: "Global",
    reset: "npm uninstall -g neotoma",
  },
  {
    what: "Config directory",
    path: "~/.config/neotoma/",
    scope: "User",
    reset: "Backed up, then removed",
  },
  {
    what: "Environment file",
    path: "~/.config/neotoma/.env or <project>/.env",
    scope: "User / Project",
    reset: "Backed up, then removed",
  },
  {
    what: "SQLite databases",
    path: "<data-dir>/neotoma.db, neotoma.prod.db",
    scope: "Local",
    reset: "Backed up, then removed",
  },
  {
    what: "Data directories",
    path: "<data-dir>/sources/, <data-dir>/logs/",
    scope: "Local",
    reset: "Backed up, then removed",
  },
  {
    what: "MCP config entries (optional)",
    path: ".cursor/mcp.json, claude.json, etc.",
    scope: "User / Project",
    reset: "Entries stripped from configs",
  },
  {
    what: "CLI instruction rules (optional)",
    path: ".cursor/rules/, .claude/rules/",
    scope: "User / Project",
    reset: "Backed up, then removed",
  },
] as const;

function WhatChangesSection() {
  return (
    <div className="mb-8">
      <hr className="mb-6 border-border" />
      <h2 className="text-[20px] font-medium tracking-[-0.01em]">
        What changes on your system
      </h2>
      <p className="text-[14px] leading-6 text-muted-foreground mt-2 mb-3">
        <code className="text-[13px] bg-muted px-1.5 py-0.5 rounded">npm install -g neotoma</code>{" "}
        adds a CLI binary.{" "}
        <code className="text-[13px] bg-muted px-1.5 py-0.5 rounded">neotoma init</code>{" "}
        creates a config directory, a local SQLite database, and an env file.
        Optional prompts during init can add MCP config entries and CLI
        instruction files; you choose at each step. Nothing runs in the
        background unless you start it. No telemetry, no phone-home.
      </p>

      <div className="rounded-lg border border-border overflow-x-auto mb-3">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-medium text-foreground">Created</th>
              <th className="px-3 py-2 text-left font-medium text-foreground">Path</th>
              <th className="px-3 py-2 text-left font-medium text-foreground">Scope</th>
              <th className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">
                <code className="text-[12px] bg-muted px-1 py-0.5 rounded">neotoma reset</code>
              </th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {INSTALL_IMPACT_ROWS.map((row) => (
              <tr key={row.what} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 text-foreground whitespace-nowrap">{row.what}</td>
                <td className="px-3 py-2 font-mono text-[12px]">{row.path}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.scope}</td>
                <td className="px-3 py-2">{row.reset}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[13px] leading-5 text-muted-foreground">
        <code className="text-[12px] bg-muted px-1 py-0.5 rounded">neotoma reset</code>{" "}
        backs up every item to a timestamped directory before removing it,
        then runs{" "}
        <code className="text-[12px] bg-muted px-1 py-0.5 rounded">npm uninstall -g neotoma</code>.
        If your <code className="text-[12px] bg-muted px-1 py-0.5 rounded">.env</code>{" "}
        sets <code className="text-[12px] bg-muted px-1 py-0.5 rounded">NEOTOMA_DATA_DIR</code>,
        that directory is protected and not removed.
      </p>
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
          check whether Neotoma is already installed. If not, branch by tool:
          for OpenClaw, prefer{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">openclaw plugins install clawhub:neotoma</code>;
          for other local tools, run{" "}
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
          workflow for the tool in use. For OpenClaw, keep the native plugin path
          as the default and use manual MCP wiring only as fallback. If that tool
          is too constrained, say so explicitly and recommend a better-supported
          primary environment.
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

      <WhatChangesSection />

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

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Try it now</h2>
      <p className="text-[15px] leading-7 mb-4">
        Once Neotoma is running, try these prompts in any connected tool to see
        it working:
      </p>
      <div className="space-y-3 mb-8">
        <div className="rounded-lg border border-border p-4">
          <p className="text-[14px] font-medium text-foreground mb-1">Store a contact</p>
          <p className="text-[13px] leading-6 text-muted-foreground mb-2">
            &ldquo;Remember that Sarah Chen&apos;s email is sarah@newstartup.io. She started there
            in March.&rdquo;
          </p>
          <p className="text-[12px] text-muted-foreground/70">
            Then in a different session or tool: &ldquo;What&apos;s Sarah Chen&apos;s email?&rdquo;
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[14px] font-medium text-foreground mb-1">Track a commitment</p>
          <p className="text-[13px] leading-6 text-muted-foreground mb-2">
            &ldquo;I told Nick I&apos;d send the architecture doc by Friday.&rdquo;
          </p>
          <p className="text-[12px] text-muted-foreground/70">
            Later: &ldquo;What did I commit to this week?&rdquo;
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[14px] font-medium text-foreground mb-1">Test a correction</p>
          <p className="text-[13px] leading-6 text-muted-foreground mb-2">
            &ldquo;Actually, Sarah&apos;s email changed to sarah@acme.co.&rdquo;
          </p>
          <p className="text-[12px] text-muted-foreground/70">
            Then: &ldquo;What&apos;s Sarah&apos;s email? Show me the history.&rdquo;
            Both old and new are preserved with timestamps.
          </p>
        </div>
      </div>

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
      <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
        <p className="text-[14px] leading-6 mb-0">
          <strong>After adding MCP config:</strong> restart your AI tool
          (Claude Code, Cursor, Claude Desktop, etc.) so it picks up the new
          server. MCP servers are loaded at startup.
        </p>
      </div>

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
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
            <p className="text-[14px] leading-6 mb-0">
              <strong>After adding MCP config:</strong> restart your AI tool
              so it picks up the new server.
            </p>
          </div>
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
