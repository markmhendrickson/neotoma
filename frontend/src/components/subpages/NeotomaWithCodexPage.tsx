import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Using them together
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Codex provides the execution sandbox; Neotoma provides the persistent state layer.
        Each sandbox starts fresh, but Neotoma carries structured memory across every task.
      </p>
      <table className="w-full text-[14px] leading-6 mb-6 border-collapse">
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Getting started &mdash; local (stdio)
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Paste this prompt into Codex. The agent handles npm install, initialization, and MCP
        configuration.
      </p>
      <CopyableCodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} className="mb-4" />
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        The agent writes to <code>.codex/config.toml</code> (project-level) or{" "}
        <code>~/.codex/config.toml</code> (user-level). Codex discovers the MCP server from your
        config automatically.
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Getting started &mdash; remote (HTTP with OAuth)
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Codex sandboxes can connect to remote MCP servers over HTTP. Use this when Neotoma is not
        installed locally in the sandbox. Start with the agentic install above on your host machine,
        then configure remote access:
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
          <strong>Configure HTTP transport with OAuth</strong> in your Codex config &mdash; replace the
          URL with your tunnel URL
          <CopyableCodeBlock
            code={`# .codex/config.toml
[mcp_servers.neotoma]
type = "http"
url = "https://<tunnel-host>/mcp"`}
            className="mt-2 mb-1"
          />
          <p className="text-[14px] leading-6 text-muted-foreground mt-2">
            Codex handles the{" "}
            <a href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP OAuth authorization flow
            </a>{" "}
            automatically.
          </p>
        </li>
      </ol>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        When MCP is not available in the sandbox, agents can use the <code>neotoma</code> CLI
        directly as a fallback.
      </p>

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
