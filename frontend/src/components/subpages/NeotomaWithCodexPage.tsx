import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function NeotomaWithCodexPage() {
  return (
    <DetailPage title="Neotoma with Codex">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Codex runs tasks in sandboxed environments with session-scoped context. Neotoma adds
          persistent memory that survives across sessions, tasks, and tools. The CLI provides
          a fallback when MCP is not available.
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Codex provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Sandbox environment with project access for each task",
          "Session-scoped context within the current task execution",
          "MCP server support via .codex/config.toml",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Codex doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Memory that persists across task executions",
          "Entity resolution or structured data storage",
          "Cross-tool access — sandbox state is isolated per task",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
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
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        How they connect
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Configure Neotoma as an MCP server in <code>.codex/config.toml</code>. When MCP is
        not available, agents can use the <code>neotoma</code> CLI directly from the terminal.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">
{`# .codex/config.toml
[mcp_servers.neotoma]
command = "neotoma"
args = ["mcp", "stdio"]`}
      </pre>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        {" "}for MCP setup and{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        {" "}for terminal usage.
      </p>
    </DetailPage>
  );
}
