import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { DetailPage } from "../DetailPage";
import { GettingStartedEvaluateInstallLinks } from "../GettingStartedEvaluateInstallLinks";
import { IntegrationLinkCard } from "../IntegrationLinkCard";
import { IntegrationSection } from "../IntegrationSection";
import { IntegrationBeforeAfter, IntegrationActivation } from "../IntegrationExtras";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithCodexPage() {
  return (
    <DetailPage title="Neotoma with Codex">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Codex runs tasks in sandboxed environments with session-scoped context. Neotoma adds
          persistent memory that survives across sessions, tasks, and tools. The CLI provides a
          fallback when MCP is not available.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for ChatGPT (conversations, custom GPTs, or developer-mode MCP)? See{" "}
          <Link to="/neotoma-with-chatgpt" className={extLink}>
            Neotoma with ChatGPT
          </Link>
          .
        </p>
      </section>

      <IntegrationSection sectionKey="what-codex-provides" title="What Codex provides" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Sandbox environment with project access for each task
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Session-scoped context within the current task execution
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://developers.openai.com/codex/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP server support
            </a>{" "}
            via <code>.codex/config.toml</code> (stdio and HTTP transports with OAuth)
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            Can itself run as an{" "}
            <a href="https://developers.openai.com/codex/guides/agents-sdk/" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP server
            </a>{" "}
            for integration with other MCP clients
          </span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="what-codex-does-not-handle" title="What Codex doesn't handle">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Memory that persists across task executions; each sandbox starts fresh
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Entity resolution or structured data storage
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Cross-tool access; sandbox state is isolated per task
          </span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="deterministic-guarantees" title="Deterministic guarantees Neotoma provides">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        {[
          "Persistent memory graph accessible across all Codex tasks",
          "Deterministic state: same observations always produce the same entity snapshots",
          "Provenance trail for every stored fact",
          "CLI fallback for direct terminal access when MCP is not configured",
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
        Codex provides the execution sandbox; Neotoma provides the persistent state layer.
        Each sandbox starts fresh, but Neotoma carries structured memory across every task.
        </p>
        <TableScrollWrapper className="mb-4 w-full max-w-full">
          <table className="w-full text-[14px] leading-6 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Concern</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Codex</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Neotoma</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Task execution environment</td>
                <td className="align-top px-4 py-3">Sandbox</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Session context</td>
                <td className="align-top px-4 py-3">Within current task</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Persistent state across tasks</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Store via MCP or CLI</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Structured entities (people, tasks, decisions)</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Store via MCP or CLI</td>
              </tr>
              <tr>
                <td className="align-top px-4 py-3">Cross-tool state &amp; audit trail</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Shared memory graph</td>
              </tr>
            </tbody>
          </table>
        </TableScrollWrapper>
      </IntegrationSection>

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <GettingStartedEvaluateInstallLinks agentTargetPhrase="Codex" />
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          Once Neotoma has been evaluated, installed if needed, and activated
          with your first data, choose an integration path:
        </p>
        <IntegrationLinkCard
          title="Local setup (stdio)"
          preview="Install and configure Neotoma directly in Codex using .codex/config.toml."
          to="/neotoma-with-codex-connect-local-stdio"
        />
        <IntegrationLinkCard
          title="Remote setup (HTTP with OAuth)"
          preview="Connect sandboxed Codex environments to a tunneled Neotoma MCP endpoint."
          to="/neotoma-with-codex-connect-remote-http-oauth"
        />
      </IntegrationSection>

      <IntegrationSection sectionKey="codex-documentation" title="Codex documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://developers.openai.com/codex/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP in Codex
          </a>
          <span className="text-muted-foreground"> (connecting tools via config.toml)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://developers.openai.com/codex/config-basic/" target="_blank" rel="noopener noreferrer" className={extLink}>
            Config basics
          </a>
          <span className="text-muted-foreground"> (configuration fundamentals)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://developers.openai.com/codex/cli/reference/" target="_blank" rel="noopener noreferrer" className={extLink}>
            CLI reference
          </a>
          <span className="text-muted-foreground"> (command line options)</span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationBeforeAfter toolName="Codex" />
      <IntegrationActivation toolName="Codex" />
      <p className="text-[14px] leading-6 text-muted-foreground">
        Start with{" "}
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithCodexTailEvaluate}
          className={extLink}
        >
          evaluation
        </TrackedProductLink>
        , see the{" "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithCodexTailInstall}
          className={extLink}
        >
          install guide
        </TrackedProductLink>{" "}
        for more options,{" "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>{" "}
        for MCP setup,{" "}
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
