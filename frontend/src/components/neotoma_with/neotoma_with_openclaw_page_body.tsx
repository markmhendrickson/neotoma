import { Check, Copy } from "lucide-react";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { cn } from "@/lib/utils";
import { useCopyFeedback } from "@/lib/copy_feedback";
import { copyTextToClipboard } from "@/lib/copy_to_clipboard";
import { TrackedProductLink } from "@/components/TrackedProductNav";
import {
  CODE_BLOCK_CHROME_STACK_CLASS,
  CODE_BLOCK_CHROME_SUBTITLE_CLASS,
  INTEGRATION_SNIPPET_CARD_SHELL_CLASS,
  INTEGRATION_SNIPPET_COPY_BUTTON_INLINE,
  INTEGRATION_SNIPPET_INNER_CLASS,
  INTEGRATION_SNIPPET_PILL_CLASS,
} from "@/components/code_block_copy_button_classes";
import { GettingStartedEvaluateInstallLinks } from "@/components/GettingStartedEvaluateInstallLinks";
import { IntegrationLinkCard } from "@/components/IntegrationLinkCard";
import { IntegrationSection } from "@/components/IntegrationSection";
import { IntegrationBeforeAfter, IntegrationActivation } from "@/components/IntegrationExtras";
import { Button } from "@/components/ui/button";
import { TableScrollWrapper } from "@/components/ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const OPENCLAW_NATIVE_PLUGIN_INSTALL_CMD = "openclaw plugins install clawhub:neotoma";
const OPENCLAW_MEMORY_SLOT_YAML = `plugins:
  slots:
    memory: neotoma
  entries:
    neotoma:
      enabled: true
      config:
        dataDir: ~/.local/share/neotoma
        environment: production`;

function CopyableSnippetPre({
  title,
  subtitle,
  code,
  copyFeedbackId,
  className,
}: {
  title: string;
  subtitle: string;
  code: string;
  copyFeedbackId: string;
  className?: string;
}) {
  const [copied, markCopied] = useCopyFeedback(copyFeedbackId, 0);
  return (
    <div className={cn("relative w-full text-left", INTEGRATION_SNIPPET_CARD_SHELL_CLASS, className)}>
      <div className="mb-3 flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-3">
        <div className={CODE_BLOCK_CHROME_STACK_CLASS}>
          <div className={INTEGRATION_SNIPPET_PILL_CLASS}>
            <span className="h-2 w-2 rounded-full bg-stone-500/80 dark:bg-stone-400/75" aria-hidden />
            {title}
          </div>
          <div className={CODE_BLOCK_CHROME_SUBTITLE_CLASS}>{subtitle}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={INTEGRATION_SNIPPET_COPY_BUTTON_INLINE}
          aria-label={copied ? "Copied" : "Copy"}
          onClick={async () => {
            const ok = await copyTextToClipboard(code);
            if (!ok) return;
            markCopied();
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre
        className={`${INTEGRATION_SNIPPET_INNER_CLASS} m-0 p-4 overflow-x-auto font-mono text-[13px] leading-6 whitespace-pre-wrap break-words`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function NeotomaWithOpenClawPageBody() {
  return (
    <>
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          OpenClaw gives agents their own machine, long-term memory, and persistent execution.
          Neotoma adds user-owned, structured state that any agent can query across platforms,
          sessions, and tools.
        </p>
      </section>

      <IntegrationSection sectionKey="what-openclaw-provides" title="What OpenClaw provides" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.openclaw.ai/cli/agents" target="_blank" rel="noopener noreferrer" className={extLink}>
              Agent-scoped machines
            </a>{" "}
            with persistent execution, isolated sessions, and multi-agent routing
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.openclaw.ai/index" target="_blank" rel="noopener noreferrer" className={extLink}>
            Long-term conversational memory and reminders
          </a>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.openclaw.ai/index" target="_blank" rel="noopener noreferrer" className={extLink}>
              Multi-channel gateway
            </a>{" "}
            (WhatsApp, Telegram, Discord, iMessage via a single process)
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.openclaw.ai/skills" target="_blank" rel="noopener noreferrer" className={extLink}>
              Skills system
            </a>{" "}
            with ClawHub registry and{" "}
            <a href="https://openclaw-ai.com/en/docs/tools/index" target="_blank" rel="noopener noreferrer" className={extLink}>
              first-class agent tools
            </a>{" "}
            (browser, canvas, cron)
          </span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="what-openclaw-does-not-handle" title="What OpenClaw doesn't handle">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Cross-platform memory; data stays inside one agent instance
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Structured entity resolution across tools and data sources
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            User-owned state with provenance, versioning, and audit trail
          </span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="deterministic-guarantees" title="Deterministic guarantees Neotoma provides">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        {[
          "User-owned structured memory accessible from any tool or agent",
          "Deterministic entity resolution: contacts, tasks, and relationships unified by canonical IDs",
          "Versioned state with full provenance: every fact traces to its source",
          "Cross-tool continuity: data stored from OpenClaw is available in Cursor, Claude, and Codex",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            {item}
          </li>
        ))}
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="using-them-together" title="Using them together">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        OpenClaw is the execution layer: it gives the agent a machine and the ability to act.
        Neotoma is the state layer: it holds the user&apos;s structured memory that any agent
        can read and write. The two are complementary with no conflict.
        </p>
        <TableScrollWrapper className="mb-4 w-full max-w-full">
          <table className="w-full text-[14px] leading-6 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Concern</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">OpenClaw</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Neotoma</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Agent execution &amp; persistent machines</td>
                <td className="align-top px-4 py-3">Agent-scoped machines</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Conversational memory &amp; reminders</td>
                <td className="align-top px-4 py-3">Long-term memory</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Multi-channel gateway</td>
                <td className="align-top px-4 py-3">WhatsApp, Telegram, etc.</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Structured entities across tools</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Store via MCP</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Cross-platform state</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Shared memory graph</td>
              </tr>
              <tr>
                <td className="align-top px-4 py-3">Versioned history &amp; audit trail</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Observation history</td>
              </tr>
            </tbody>
          </table>
        </TableScrollWrapper>
      </IntegrationSection>

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <GettingStartedEvaluateInstallLinks agentTargetPhrase="an AI coding agent such as Claude Code, Cursor, or Codex" />
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          The evaluation flow handles install, activation, and OpenClaw
          connection (including the native plugin path) automatically. If you
          prefer to configure the connection yourself, use one of these options:
        </p>
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-[15px] leading-7 font-medium text-foreground mb-2">
            Native plugin
          </p>
          <p className="text-[14px] leading-6 text-muted-foreground mb-2">
            Neotoma is published on{" "}
            <a href="https://clawhub.ai" target="_blank" rel="noopener noreferrer" className={extLink}>
              ClawHub
            </a>{" "}
            as a native OpenClaw plugin with <code className="text-[13px]">kind: &quot;memory&quot;</code>.
            All 30+ MCP tools are registered as agent tools with zero extra configuration.
          </p>
          <CopyableSnippetPre
            title="ClawHub install"
            subtitle="Register Neotoma from ClawHub on the machine where OpenClaw runs."
            code={OPENCLAW_NATIVE_PLUGIN_INSTALL_CMD}
            copyFeedbackId="openclaw-native-plugin-install-cmd"
            className="mb-3"
          />
          <CopyableSnippetPre
            title="Memory slot"
            subtitle="Assign the plugin to the memory slot in your OpenClaw configuration."
            code={OPENCLAW_MEMORY_SLOT_YAML}
            copyFeedbackId="openclaw-native-plugin-memory-yaml"
            className="mb-0"
          />
          <p className="mt-4 text-[14px] leading-6 text-muted-foreground mb-0">
            Verify with <code className="text-[13px]">openclaw plugins inspect neotoma</code> to
            confirm <code className="text-[13px]">Format: native</code> and{" "}
            <code className="text-[13px]">Kind: memory</code>.
          </p>
        </div>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Or use manual MCP configuration:
        </p>
        <IntegrationLinkCard
          title="Local setup (stdio)"
          preview="Install Neotoma and add it to OpenClaw local configuration."
          to="/neotoma-with-openclaw-connect-local-stdio"
        />
        <IntegrationLinkCard
          title="Remote setup (HTTP)"
          preview="Expose Neotoma API with a tunnel and connect OpenClaw to remote MCP endpoints."
          to="/neotoma-with-openclaw-connect-remote-http"
        />
      </IntegrationSection>

      <IntegrationSection sectionKey="openclaw-documentation" title="OpenClaw documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.openclaw.ai/index" target="_blank" rel="noopener noreferrer" className={extLink}>
            Overview
          </a>
          <span className="text-muted-foreground"> (self-hosted agent gateway)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://www.getopenclaw.ai/docs/configuration" target="_blank" rel="noopener noreferrer" className={extLink}>
            Configuration
          </a>
          <span className="text-muted-foreground"> (setup wizard and settings reference)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://openclaw-ai.com/en/docs/tools/index" target="_blank" rel="noopener noreferrer" className={extLink}>
            Tools
          </a>
          <span className="text-muted-foreground"> (browser, canvas, cron, and access control)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.openclaw.ai/skills" target="_blank" rel="noopener noreferrer" className={extLink}>
            Skills
          </a>
          <span className="text-muted-foreground"> (extensible skill folders and ClawHub registry)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.openclaw.ai/tools/clawhub" target="_blank" rel="noopener noreferrer" className={extLink}>
            ClawHub
          </a>
          <span className="text-muted-foreground"> (plugin and skill registry where Neotoma is published)</span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationBeforeAfter toolName="OpenClaw" />
      <IntegrationActivation toolName="OpenClaw" />
      <p className="text-[14px] leading-6 text-muted-foreground">
        Start with{" "}
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithOpenclawTailEvaluate}
          className={extLink}
        >
          evaluation
        </TrackedProductLink>
        , see the{" "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithOpenclawTailInstall}
          className={extLink}
        >
          install guide
        </TrackedProductLink>{" "}
        for more options,{" "}
        <MdxI18nLink to="/mcp" className={extLink}>
          MCP reference
        </MdxI18nLink>{" "}
        for full setup,{" "}
        <MdxI18nLink to="/cli" className={extLink}>
          CLI reference
        </MdxI18nLink>{" "}
        for terminal usage, and{" "}
        <MdxI18nLink to="/agent-instructions" className={extLink}>
          agent instructions
        </MdxI18nLink>{" "}
        for behavioral details.
      </p>
    </>
  );
}
