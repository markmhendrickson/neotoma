import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function NeotomaWithClaudeCodePage() {
  return (
    <DetailPage title="Neotoma with Claude Code">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Claude Code is Anthropic's local CLI agent for development tasks. It runs in your
          terminal with direct filesystem access. Neotoma adds persistent structured memory
          that survives across sessions and tools via MCP or CLI fallback.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for Claude's web, mobile, or desktop apps? See{" "}
          <Link to="/neotoma-with-claude" className="text-foreground underline underline-offset-2 hover:no-underline">
            Neotoma with Claude
          </Link>.
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Claude Code provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Local terminal agent with direct filesystem and shell access",
          "Session memory within the current Claude Code session",
          "MCP server support via .mcp.json at your project root",
          "CLAUDE.md project context files for persistent instructions",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Claude Code doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Memory that persists across sessions after terminal closes",
          "Structured entity resolution or typed data storage",
          "Cross-tool access — session context is local to Claude Code",
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
          "Persistent memory graph accessible across all Claude Code sessions",
          "Deterministic state — same observations always produce the same entity snapshots",
          "Full provenance trail for every stored fact",
          "CLI fallback for direct terminal access when MCP is not configured",
          "Cross-tool continuity — memory shared with Claude, Cursor, Codex, and ChatGPT",
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
        Add Neotoma as an MCP server in <code>.mcp.json</code> at your project root. Claude
        Code picks it up automatically. The same install and server block work for{" "}
        <Link to="/neotoma-with-claude" className="text-foreground underline underline-offset-2 hover:no-underline">Claude Desktop</Link>;
        only the config file location differs (Desktop uses a user-level config file). When
        MCP is not available, agents can use the <code>neotoma</code> CLI directly from the
        terminal.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">
{`// .mcp.json (project root)
{
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
        {" "}for MCP setup,{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        {" "}for terminal usage, and{" "}
        <Link to="/agent-instructions" className="text-foreground underline underline-offset-2 hover:no-underline">
          agent instructions
        </Link>
        {" "}for behavioral details.
      </p>
    </DetailPage>
  );
}
