import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

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
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            Project-scoped context from open files, workspace, and{" "}
            <a href="https://docs.cursor.com/context/@-symbols/@-notepads" target="_blank" rel="noopener noreferrer" className={extLink}>
              Notepads
            </a>
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Session memory within the current conversation
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            Persistent instructions via{" "}
            <a href="https://docs.cursor.com/context/rules" target="_blank" rel="noopener noreferrer" className={extLink}>
              .cursor/rules/
            </a>{" "}
            — always-apply, glob-scoped, or agent-invoked rule files
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            Native{" "}
            <a href="https://docs.cursor.com/context/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP integration
            </a>{" "}
            — 30+ built-in servers and support for custom stdio, SSE, and HTTP servers
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Cursor doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Memory that persists across projects or after session ends — rules carry forward
            instructions, not data
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Entity resolution across different conversations and data sources
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Versioned state with audit trail and provenance
          </span>
        </li>
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
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">How they connect</h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Neotoma runs as an{" "}
        <a href="https://docs.cursor.com/context/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
          MCP server
        </a>
        . Add it to <code>.cursor/mcp.json</code> (project-level) or{" "}
        <code>~/.cursor/mcp.json</code> (global) and Cursor agents gain read/write access to your
        persistent memory graph. The agent stores conversations and extracted entities automatically;
        retrieval happens before every response.
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Cursor documentation
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.cursor.com/context/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP integrations
          </a>
          <span className="text-muted-foreground">— connecting external tools via MCP</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.cursor.com/context/rules" target="_blank" rel="noopener noreferrer" className={extLink}>
            Rules
          </a>
          <span className="text-muted-foreground">— persistent AI instructions via .cursor/rules/</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.cursor.com/context/@-symbols/@-notepads" target="_blank" rel="noopener noreferrer" className={extLink}>
            Notepads
          </a>
          <span className="text-muted-foreground">— reusable context shared across sessions</span>
        </li>
      </ul>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>{" "}
        for full setup and{" "}
        <Link to="/cli" className={extLink}>
          CLI reference
        </Link>{" "}
        for terminal access.
      </p>
    </DetailPage>
  );
}
