import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">What Codex provides</h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
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
            via <code>.codex/config.toml</code> — stdio and HTTP transports with OAuth
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Codex doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Memory that persists across task executions — each sandbox starts fresh
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
            Cross-tool access — sandbox state is isolated per task
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Deterministic guarantees Neotoma provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Persistent memory graph accessible across all Codex tasks",
          "Deterministic state — same observations always produce the same entity snapshots",
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">How they connect</h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Configure Neotoma as an MCP server in{" "}
        <a href="https://developers.openai.com/codex/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
          <code>.codex/config.toml</code>
        </a>{" "}
        (user-level at <code>~/.codex/config.toml</code> or project-scoped). You can also add
        servers via <code>codex mcp add</code>. When MCP is not available, agents can use the{" "}
        <code>neotoma</code> CLI directly from the terminal.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">
        {`# .codex/config.toml
[mcp_servers.neotoma]
command = "neotoma"
args = ["mcp", "stdio"]`}
      </pre>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Codex documentation
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://developers.openai.com/codex/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP in Codex
          </a>
          <span className="text-muted-foreground">— connecting tools via config.toml</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://developers.openai.com/codex/config-basic/" target="_blank" rel="noopener noreferrer" className={extLink}>
            Config basics
          </a>
          <span className="text-muted-foreground">— configuration fundamentals</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://developers.openai.com/codex/cli/reference/" target="_blank" rel="noopener noreferrer" className={extLink}>
            CLI reference
          </a>
          <span className="text-muted-foreground">— command line options</span>
        </li>
      </ul>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>{" "}
        for MCP setup and{" "}
        <Link to="/cli" className={extLink}>
          CLI reference
        </Link>{" "}
        for terminal usage.
      </p>
    </DetailPage>
  );
}
