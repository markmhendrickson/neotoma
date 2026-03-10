import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function NeotomaWithCursorPage() {
  return (
    <DetailPage title="Neotoma with Cursor">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Cursor provides project-scoped context and session memory. Neotoma adds persistent,
          cross-project memory with entity resolution and versioned state. They complement each
          other without conflict.
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Cursor provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Project-scoped context from open files and workspace",
          "Session memory within the current conversation",
          "Rules and instructions via .cursor/rules/",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Cursor doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Memory that persists across projects or after session ends",
          "Entity resolution across different conversations and data sources",
          "Versioned state with audit trail and provenance",
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
          "Persistent memory across all projects, sessions, and tools",
          "Deterministic entity resolution — contacts, tasks, and relationships unified by canonical IDs",
          "Versioned state with full provenance — every fact traces to its source",
          "Cross-tool continuity — data stored from Cursor is available in Claude and Codex",
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
        Neotoma runs as an MCP server. Add it to <code>.cursor/mcp.json</code> and Cursor
        agents gain read/write access to your persistent memory graph. The agent stores
        conversations and extracted entities automatically; retrieval happens before every
        response.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">
{`{
  "mcpServers": {
    "neotoma": {
      "command": "neotoma",
      "args": ["mcp", "stdio"]
    }
  }
}`}
      </pre>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        {" "}for full setup and{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        {" "}for terminal access.
      </p>
    </DetailPage>
  );
}
