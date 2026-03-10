import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function NeotomaWithClaudePage() {
  return (
    <DetailPage title="Neotoma with Claude (web / mobile / desktop)">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Claude's platform apps — claude.ai on web, the iOS/Android apps, and the desktop
          app — offer conversation memory and project-scoped files within Anthropic's
          ecosystem. Neotoma adds structured, deterministic memory that persists across all
          your tools and sessions.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for Claude Code (the local CLI)? See{" "}
          <Link to="/neotoma-with-claude-code" className="text-foreground underline underline-offset-2 hover:no-underline">
            Neotoma with Claude Code
          </Link>.
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Claude's platform provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Conversation memory within Claude's context window",
          "Project files scoped to Claude Projects",
          "Artifacts for generated documents and code",
          "MCP server connections via Claude Desktop and claude.ai (remote MCP)",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What the platform doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Structured entity resolution across conversations and projects",
          "Persistent memory that survives session resets and model updates",
          "Cross-tool access — data stays inside Claude's ecosystem",
          "Deterministic state reconstruction from recorded observations",
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
          "Structured entities with canonical IDs that persist across all sessions",
          "Deterministic state evolution — same observations always produce the same result",
          "Full provenance and audit trail for every stored fact",
          "Cross-tool continuity — memory is shared with Claude Code, Cursor, Codex, and ChatGPT",
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
        Claude Desktop supports local MCP servers. Same Neotoma install and server block as
        Claude Code — only the config file location differs. Add Neotoma in your Claude
        Desktop config and the agent stores every conversation turn and extracted entities
        before responding.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">
{`// Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "neotoma": {
      "command": "neotoma",
      "args": ["mcp", "stdio"]
    }
  }
}`}
      </pre>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        For claude.ai on the web, remote MCP support is being rolled out. Once available,
        you can connect Neotoma as a remote MCP server from your account settings.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        {" "}for full setup and{" "}
        <Link to="/agent-instructions" className="text-foreground underline underline-offset-2 hover:no-underline">
          agent instructions
        </Link>
        {" "}for behavioral details.
      </p>
    </DetailPage>
  );
}
