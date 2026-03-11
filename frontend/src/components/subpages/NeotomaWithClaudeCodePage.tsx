import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithClaudeCodePage() {
  return (
    <DetailPage title="Neotoma with Claude Code">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Claude Code is Anthropic's local CLI agent for development tasks. It runs in your terminal
          with direct filesystem access. Neotoma adds persistent structured memory that survives
          across sessions and tools via MCP or CLI fallback.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for Claude's web, mobile, or desktop apps? See{" "}
          <Link to="/neotoma-with-claude" className={extLink}>
            Neotoma with Claude
          </Link>
          .
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Claude Code provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Local terminal agent with direct filesystem and shell access
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            Session memory plus{" "}
            <a href="https://docs.anthropic.com/en/docs/claude-code/memory" target="_blank" rel="noopener noreferrer" className={extLink}>
              auto memory
            </a>{" "}
            that records corrections and preferences across sessions
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.anthropic.com/en/docs/claude-code/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP server support
            </a>{" "}
            via <code>.mcp.json</code> at your project root — stdio, SSE, and HTTP transports
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.anthropic.com/en/docs/claude-code/memory" target="_blank" rel="noopener noreferrer" className={extLink}>
              CLAUDE.md
            </a>{" "}
            project context files for persistent instructions at project, user, or org scope
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Claude Code doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Memory that persists across sessions after terminal closes — auto memory stores
            preferences but not structured entity data
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Structured entity resolution or typed data storage
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Cross-tool access — session context is local to Claude Code
          </span>
        </li>
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
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">How they connect</h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Add Neotoma as an{" "}
        <a href="https://docs.anthropic.com/en/docs/claude-code/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
          MCP server
        </a>{" "}
        in <code>.mcp.json</code> at your project root. Claude Code picks it up automatically. The
        same install and server block work for{" "}
        <Link to="/neotoma-with-claude" className={extLink}>
          Claude Desktop
        </Link>
        ; only the config file location differs (Desktop uses a user-level config file). When MCP is
        not available, agents can use the <code>neotoma</code> CLI directly from the terminal.
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Claude Code documentation
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.anthropic.com/en/docs/claude-code/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP in Claude Code
          </a>
          <span className="text-muted-foreground">— connecting external tools via .mcp.json</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.anthropic.com/en/docs/claude-code/memory" target="_blank" rel="noopener noreferrer" className={extLink}>
            Memory in Claude Code
          </a>
          <span className="text-muted-foreground">— CLAUDE.md files and auto memory</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.anthropic.com/en/docs/claude-code/settings" target="_blank" rel="noopener noreferrer" className={extLink}>
            Settings
          </a>
          <span className="text-muted-foreground">— project and user-level configuration</span>
        </li>
      </ul>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
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
