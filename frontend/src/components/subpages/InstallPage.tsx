import { Link } from "react-router-dom";
import { Clock, RotateCcw } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { CodeBlock } from "../InstallCodeBlock";
import { DetailPage } from "../DetailPage";
import { PermissionsPreflight } from "../PermissionsPreflight";
import { Card, CardContent } from "../ui/card";
import { CodexIcon } from "../icons/CodexIcon";
import { CursorIcon } from "../icons/CursorIcon";
import { IronClawIcon } from "../icons/IronClawIcon";
import { OpenCodeIcon } from "../icons/OpenCodeIcon";
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
    label: "OpenCode",
    href: "/neotoma-with-opencode",
    desc: "Lifecycle hooks and MCP memory for OpenCode",
    Icon: OpenCodeIcon,
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
  {
    label: "IronClaw",
    href: "/neotoma-with-ironclaw",
    desc: "Structured MCP memory for IronClaw agents",
    Icon: IronClawIcon,
  },
] as const;

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
      <h2 className="text-[20px] font-medium tracking-[-0.01em]">What changes on your system</h2>
      <p className="text-[14px] leading-6 text-muted-foreground mt-2 mb-3">
        <code className="text-[13px] bg-muted px-1.5 py-0.5 rounded">npm install -g neotoma</code>{" "}
        adds a CLI binary.{" "}
        <code className="text-[13px] bg-muted px-1.5 py-0.5 rounded">neotoma init</code> creates a
        config directory, a local SQLite database, and an env file. Optional prompts during init can
        add MCP config entries and CLI instruction files; you choose at each step. Nothing runs in
        the background unless you start it. No telemetry, no phone-home.
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
        <code className="text-[12px] bg-muted px-1 py-0.5 rounded">neotoma reset</code> backs up
        every item to a timestamped directory before removing it, then runs{" "}
        <code className="text-[12px] bg-muted px-1 py-0.5 rounded">npm uninstall -g neotoma</code>.
        If your <code className="text-[12px] bg-muted px-1 py-0.5 rounded">.env</code> sets{" "}
        <code className="text-[12px] bg-muted px-1 py-0.5 rounded">NEOTOMA_DATA_DIR</code>, that
        directory is protected and not removed.
      </p>
    </div>
  );
}

export function InstallPage() {
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
          Want the full agent-driven sequence? Start with evaluation, then let the agent install if
          needed, activate Neotoma with your data, and configure the tool you are in.
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
        If you want to skip the initial evaluation page and proceed directly from install, paste
        this prompt into Claude, Codex, Cursor, or a similar agent. The prompt stays intentionally
        short; this page documents the full install-first sequence it should follow.
      </p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.agentInstallPrompt}
        copyFeedbackId="install-copy-agent-assisted"
        installBlock="agent_assisted"
      />

      <div className="mb-6 rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
        <p className="text-[14px] leading-6 text-sky-900 dark:text-sky-50 mb-2">
          <strong>This page expands the prompt.</strong> The copied prompt omits detail for
          readability; the full install-first flow here includes:
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-[14px] leading-6 text-sky-900 dark:text-sky-50">
          <li>
            Confirming the user wants the install-first path and identifying the current tool.
          </li>
          <li>
            Installing only if needed, then verifying state with{" "}
            <code className="bg-sky-500/10 px-1 py-0.5 rounded">neotoma doctor --json</code>.
          </li>
          <li>Choosing the first data to store and the onboarding mode.</li>
          <li>Running activation, then configuring the current tool for ongoing use.</li>
        </ol>
      </div>

      <h3 className="text-[17px] font-medium tracking-[-0.01em] mt-6 mb-3">
        Expanded install-first sequence
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Use this path only when the user already wants to proceed with Neotoma and does not need the
        broader fit-assessment flow on{" "}
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
          <strong className="text-foreground">Confirm the install-first path</strong> - verify that
          the user wants to proceed now, identify their current tool, and note any major tool
          constraints that affect setup quality.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Install only if needed</strong> - check whether
          Neotoma is already installed. If not, branch by tool: for OpenClaw, prefer{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
            openclaw plugins install clawhub:neotoma
          </code>
          ; for other local tools, run{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">npm install -g neotoma</code>.
          Then collapse the rest of setup into two calls:{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">neotoma doctor --json</code> to
          inspect consolidated state and{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
            neotoma setup --tool &lt;tool&gt; --yes
          </code>{" "}
          to apply init + MCP + CLI instructions + permission files idempotently. If Neotoma is
          already installed, just run{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">neotoma doctor --json</code> to
          verify.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Do not improvise shell introspection.</strong> Do not
          run <code className="text-sm bg-muted px-1.5 py-0.5 rounded">python3 -c</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">grep -r</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">ls</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">cat</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">jq</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">find</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">which</code>, or{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">node -e</code> to introspect
          Neotoma, and do not run arbitrary{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">npm run</code> scripts from the
          user's repositories. If a permission prompt appears for anything other than{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">neotoma *</code> or{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">npm install -g neotoma</code>,
          stop and ask the user to widen the allowlist (see the Permissions pre-flight block above)
          rather than substituting another command.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Set the first data target</strong> - determine what
          data should be stored first and, if needed, ask the user which onboarding mode they want:
          quick win, guided, or power user.
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
          : discover candidates, preview them, ingest confirmed sources, reconstruct a timeline,
          then query and correct.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Configure the current tool</strong> - after first
          value is visible, set up the strongest ongoing Neotoma workflow for the tool in use. For
          OpenClaw, keep the native plugin path as the default and use manual MCP wiring only as
          fallback. If that tool is too constrained, say so explicitly and recommend a
          better-supported primary environment.
        </li>
      </ol>
      <div className="mb-6 rounded-lg border border-border/60 bg-muted/30 p-4">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          If your agent requires command allowlists, use the pre-flight snippets before running the
          prompt.
        </p>
        <PermissionsPreflight />
      </div>
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
        <Link
          to="/install/manual"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          Manual install
        </Link>
        {" · "}
        <Link
          to="/install/docker"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          Docker
        </Link>
        {" · "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
      </p>

      <WhatChangesSection />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-4">
        Direct integration docs
      </h2>
      <p className="text-[13px] leading-6 text-muted-foreground mb-3">
        Connecting an agent to a hosted Neotoma instead of installing locally? Hosted Neotoma
        instances expose harness-specific connect snippets at their own root URL (with the host
        pre-filled) - see{" "}
        <Link
          to="/connect"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          Connect remotely
        </Link>{" "}
        or try the{" "}
        <Link
          to="/sandbox"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          public sandbox
        </Link>
        .
      </p>
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
                      <span className="font-medium text-[15px] text-foreground block">{label}</span>
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

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Manual install and Docker</h2>
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Link
          to="/install/manual"
          className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            Manual install
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">
            npm install, post-install verification, start the API server, and connect MCP.
          </p>
        </Link>
        <Link
          to="/install/docker"
          className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            Docker install
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Run Neotoma in Docker with docker-compose or standalone containers.
          </p>
        </Link>
      </div>

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
