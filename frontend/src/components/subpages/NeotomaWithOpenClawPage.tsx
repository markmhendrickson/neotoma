import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { DetailPage } from "../DetailPage";
import { GettingStartedEvaluateInstallLinks } from "../GettingStartedEvaluateInstallLinks";
import { IntegrationLinkCard } from "../IntegrationLinkCard";
import { IntegrationSection } from "../IntegrationSection";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithOpenClawPage() {
  return (
    <DetailPage title="Neotoma with OpenClaw">
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
          Once Neotoma has been evaluated, installed if needed, and activated
          with your first data, choose an integration path:
        </p>
        <IntegrationLinkCard
          title="Local setup (stdio)"
          preview="Install with an agent prompt and add Neotoma to OpenClaw local configuration."
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
        </ul>
      </IntegrationSection>

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
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>{" "}
        for full setup,{" "}
        <Link to="/cli" className={extLink}>
          CLI reference
        </Link>{" "}
        for terminal usage, and{" "}
        <Link to="/agent-instructions" className={extLink}>
          agent instructions
        </Link>{" "}
        for behavioral details.
      </p>
    </DetailPage>
  );
}
