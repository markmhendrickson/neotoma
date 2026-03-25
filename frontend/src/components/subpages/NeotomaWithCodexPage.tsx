import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { IntegrationLinkCard } from "../IntegrationLinkCard";
import { IntegrationSection } from "../IntegrationSection";

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
        <table className="w-full text-[14px] leading-6 mb-2 border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-foreground">Concern</th>
            <th className="text-left py-2 pr-4 font-medium text-foreground">Codex</th>
            <th className="text-left py-2 font-medium text-foreground">Neotoma</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Task execution environment</td>
            <td className="py-2 pr-4">Sandbox</td>
            <td className="py-2">&mdash;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Session context</td>
            <td className="py-2 pr-4">Within current task</td>
            <td className="py-2">&mdash;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Persistent state across tasks</td>
            <td className="py-2 pr-4">&mdash;</td>
            <td className="py-2">Store via MCP or CLI</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Structured entities (people, tasks, decisions)</td>
            <td className="py-2 pr-4">&mdash;</td>
            <td className="py-2">Store via MCP or CLI</td>
          </tr>
          <tr>
            <td className="py-2 pr-4">Cross-tool state &amp; audit trail</td>
            <td className="py-2 pr-4">&mdash;</td>
            <td className="py-2">Shared memory graph</td>
          </tr>
        </tbody>
        </table>
      </IntegrationSection>

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">Choose an integration path:</p>
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

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/install" className={extLink}>
          install guide
        </Link>{" "}
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
