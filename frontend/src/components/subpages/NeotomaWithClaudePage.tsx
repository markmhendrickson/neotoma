import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Using them together
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Keep Claude&apos;s memory and projects on. They handle conversational context and preferences;
        Neotoma handles structured state. Both are active simultaneously with no conflict.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        If you also use Claude Code, its{" "}
        <a href="https://code.claude.com/docs/en/memory#auto-memory" target="_blank" rel="noopener noreferrer" className={extLink}>
          auto memory
        </a>{" "}
        records build commands, debugging insights, and code style preferences locally per project.
        Neotoma complements auto memory by storing structured entities and cross-tool state that
        persist beyond a single machine. See{" "}
        <Link to="/neotoma-with-claude-code" className={extLink}>
          Neotoma with Claude Code
        </Link>{" "}
        for details.
      </p>
      <table className="w-full text-[14px] leading-6 mb-6 border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-foreground">Concern</th>
            <th className="text-left py-2 pr-4 font-medium text-foreground">Claude</th>
            <th className="text-left py-2 font-medium text-foreground">Neotoma</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Conversation preferences</td>
            <td className="py-2 pr-4">Memory</td>
            <td className="py-2">&mdash;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Project-scoped documents &amp; instructions</td>
            <td className="py-2 pr-4">Projects</td>
            <td className="py-2">&mdash;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Structured entities (people, tasks, decisions)</td>
            <td className="py-2 pr-4">&mdash;</td>
            <td className="py-2">Store via MCP</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Cross-tool state</td>
            <td className="py-2 pr-4">&mdash;</td>
            <td className="py-2">Shared memory graph</td>
          </tr>
          <tr>
            <td className="py-2 pr-4">Versioned history &amp; audit trail</td>
            <td className="py-2 pr-4">&mdash;</td>
            <td className="py-2">Observation history</td>
          </tr>
        </tbody>
      </table>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Getting started &mdash; Claude Desktop (local)
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Paste this prompt into another agent tool (e.g. Claude Code or Cursor) to install Neotoma
        and configure it for Claude Desktop. The agent handles npm install, initialization, and MCP
        configuration.
      </p>
      <CopyableCodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} className="mb-4" />
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        Claude Desktop uses local stdio &mdash; Neotoma runs on the same machine. No API server or
        remote access is required. The agent writes to{" "}
        <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> and
        you restart Claude Desktop to pick up the new MCP server.
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Getting started &mdash; claude.ai (remote)
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        claude.ai connects to MCP servers over the network. Start with the same agentic install
        above, then configure remote access:
      </p>
      <ol className="list-decimal pl-5 space-y-4 mb-6">
        <li className="text-[15px] leading-7">
          <strong>Start the API server with a tunnel</strong> &mdash; the <code>--tunnel</code> flag
          auto-provisions a public HTTPS URL via ngrok or Cloudflare (whichever is installed)
          <CopyableCodeBlock code={`neotoma api start --env prod --tunnel`} className="mt-2 mb-1" />
          <p className="text-[14px] leading-6 text-muted-foreground mt-1">
            The tunnel URL is printed to the console and written to{" "}
            <code>/tmp/ngrok-mcp-url.txt</code>. You can also use a reverse proxy or your own domain
            instead of <code>--tunnel</code>.
          </p>
        </li>
        <li className="text-[15px] leading-7">
          <strong>Connect in claude.ai</strong> &mdash; go to Settings &rarr; MCP Servers and add
          your tunnel URL (e.g. <code>https://&lt;tunnel-host&gt;/mcp</code>). Claude authenticates
          via OAuth; the Neotoma API supports the{" "}
          <a href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP OAuth authorization flow
          </a>
          .
        </li>
      </ol>

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
        <Link to="/install" className={extLink}>
          install guide
        </Link>{" "}
        for more options,{" "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>{" "}
        for full setup,{" "}
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
