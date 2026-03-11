import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithClaudePage() {
  return (
    <DetailPage title="Neotoma with Claude (web / mobile / desktop)">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Claude's platform apps — claude.ai on web, the iOS/Android apps, and the desktop app —
          offer conversation memory and project-scoped files within Anthropic's ecosystem. Neotoma
          adds structured, deterministic memory that persists across all your tools and sessions.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for Claude Code (the local CLI)? See{" "}
          <Link to="/neotoma-with-claude-code" className={extLink}>
            Neotoma with Claude Code
          </Link>
          .
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What Claude's platform provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://support.anthropic.com/en/articles/11817273-how-does-claude-s-memory-work" target="_blank" rel="noopener noreferrer" className={extLink}>
              Conversation memory
            </a>{" "}
            — saved memories and chat history that persist across sessions on all plans
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://www.anthropic.com/news/projects" target="_blank" rel="noopener noreferrer" className={extLink}>
              Projects
            </a>{" "}
            — organize chats with scoped documents and custom instructions (200K context window)
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Artifacts for generated documents and code
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            MCP server connections via{" "}
            <a href="https://modelcontextprotocol.io/docs/develop/connect-local-servers" target="_blank" rel="noopener noreferrer" className={extLink}>
              Claude Desktop
            </a>{" "}
            and claude.ai (remote MCP)
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What the platform doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Structured entity resolution across conversations and projects
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Persistent memory that survives session resets and model updates — Claude's{" "}
            <a href="https://support.anthropic.com/en/articles/11817273-how-does-claude-s-memory-work" target="_blank" rel="noopener noreferrer" className={extLink}>
              memory
            </a>{" "}
            stores preferences but not structured, schema-bound entities
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Cross-tool access — data stays inside Claude's ecosystem
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Deterministic state reconstruction from recorded observations
          </span>
        </li>
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
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">How they connect</h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Claude Desktop supports{" "}
        <a href="https://modelcontextprotocol.io/docs/develop/connect-local-servers" target="_blank" rel="noopener noreferrer" className={extLink}>
          local MCP servers
        </a>
        . Same Neotoma install and server block as Claude Code — only the config file location
        differs. Add Neotoma in your Claude Desktop config and the agent stores every conversation
        turn and extracted entities before responding.
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
        For claude.ai on the web, remote MCP support is being rolled out. Once available, you can
        connect Neotoma as a remote MCP server from your account settings.
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Claude documentation
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://support.anthropic.com/en/articles/11817273-how-does-claude-s-memory-work" target="_blank" rel="noopener noreferrer" className={extLink}>
            Memory in Claude
          </a>
          <span className="text-muted-foreground">— saved memories and chat history</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://www.anthropic.com/news/projects" target="_blank" rel="noopener noreferrer" className={extLink}>
            Projects
          </a>
          <span className="text-muted-foreground">— scoped documents and custom instructions</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://modelcontextprotocol.io/docs/develop/connect-local-servers" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP in Claude Desktop
          </a>
          <span className="text-muted-foreground">— connecting local MCP servers</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://www.anthropic.com/news/context-management" target="_blank" rel="noopener noreferrer" className={extLink}>
            Context management
          </a>
          <span className="text-muted-foreground">— developer platform memory tool</span>
        </li>
      </ul>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>{" "}
        for full setup and{" "}
        <Link to="/agent-instructions" className={extLink}>
          agent instructions
        </Link>{" "}
        for behavioral details.
      </p>
    </DetailPage>
  );
}
