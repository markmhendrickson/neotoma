import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithOpenClawPage() {
  return (
    <DetailPage title="Neotoma with OpenClaw">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          OpenClaw gives agents their own machine, long-term memory, and persistent execution.
          Neotoma adds user-owned, structured state that any agent can query — across platforms,
          sessions, and tools.
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What OpenClaw provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.openclaw.ai/cli/agents" target="_blank" rel="noopener noreferrer" className={extLink}>
              Agent-scoped machines
            </a>{" "}
            with persistent execution, isolated sessions, and multi-agent routing
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Long-term conversational memory and reminders
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.openclaw.ai/index" target="_blank" rel="noopener noreferrer" className={extLink}>
              Multi-channel gateway
            </a>{" "}
            — WhatsApp, Telegram, Discord, iMessage via a single process
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://docs.openclaw.ai/skills" target="_blank" rel="noopener noreferrer" className={extLink}>
              Skills system
            </a>{" "}
            with ClawHub registry and{" "}
            <a href="https://openclaw-ai.com/en/docs/tools/index" target="_blank" rel="noopener noreferrer" className={extLink}>
              first-class agent tools
            </a>{" "}
            (browser, canvas, cron)
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What OpenClaw doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Cross-platform memory — data stays inside one agent instance
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Structured entity resolution across tools and data sources
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            User-owned state with provenance, versioning, and audit trail
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Deterministic guarantees Neotoma provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "User-owned structured memory accessible from any tool or agent",
          "Deterministic entity resolution — contacts, tasks, and relationships unified by canonical IDs",
          "Versioned state with full provenance — every fact traces to its source",
          "Cross-tool continuity — data stored from OpenClaw is available in Cursor, Claude, and Codex",
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
        OpenClaw is the execution layer &mdash; it gives the agent a machine and the ability to act.
        Neotoma is the state layer &mdash; it holds the user&apos;s structured memory that any agent
        can read and write. The two are complementary with no conflict.
      </p>
      <table className="w-full text-[14px] leading-6 mb-6 border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-foreground">Concern</th>
            <th className="text-left py-2 pr-4 font-medium text-foreground">OpenClaw</th>
            <th className="text-left py-2 font-medium text-foreground">Neotoma</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Agent execution &amp; persistent machines</td>
            <td className="py-2 pr-4">Agent-scoped machines</td>
            <td className="py-2">&mdash;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Conversational memory &amp; reminders</td>
            <td className="py-2 pr-4">Long-term memory</td>
            <td className="py-2">&mdash;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Multi-channel gateway</td>
            <td className="py-2 pr-4">WhatsApp, Telegram, etc.</td>
            <td className="py-2">&mdash;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Structured entities across tools</td>
            <td className="py-2 pr-4">&mdash;</td>
            <td className="py-2">Store via MCP</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-4">Cross-platform state</td>
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
        Getting started &mdash; local (stdio)
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Paste this prompt into an agent tool (e.g. Claude Code, Codex, or Cursor) to install Neotoma.
        The agent handles npm install, initialization, and MCP configuration.
      </p>
      <CopyableCodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} className="mb-4" />
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        After installation, add Neotoma to your OpenClaw{" "}
        <a href="https://www.getopenclaw.ai/docs/configuration" target="_blank" rel="noopener noreferrer" className={extLink}>
          configuration file
        </a>{" "}
        and restart OpenClaw to pick up the new MCP server.
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Getting started &mdash; remote (HTTP)
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        If OpenClaw runs on a different machine or in the cloud, start with the agentic install above
        on your host machine, then configure remote access:
      </p>
      <ol className="list-decimal pl-5 space-y-4 mb-6">
        <li className="text-[15px] leading-7">
          <strong>Start the API server</strong>
          <CopyableCodeBlock code={`neotoma api start --env prod`} className="mt-2 mb-1" />
        </li>
        <li className="text-[15px] leading-7">
          <strong>Expose the API externally</strong> &mdash; use a reverse proxy (nginx, Caddy) or
          tunnel (ngrok, Cloudflare Tunnel) to make your Neotoma API reachable at a public HTTPS URL.
          The API runs on <code>http://localhost:3080</code> by default.
        </li>
        <li className="text-[15px] leading-7">
          <strong>Point OpenClaw at the remote endpoint</strong> &mdash; use the Neotoma API&apos;s
          OpenAPI spec URL (<code>https://your-neotoma-host.example.com/openapi.json</code>) or
          the remote MCP endpoint. The Neotoma API supports the{" "}
          <a href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP OAuth authorization flow
          </a>{" "}
          for authenticated access.
        </li>
      </ol>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        If MCP is not yet available in your OpenClaw environment, use the Neotoma CLI directly from
        the same machine as a fallback:
      </p>
      <CopyableCodeBlock
        code={`neotoma store --json='[{"entity_type":"task","title":"Follow up","status":"open"}]'
neotoma entities list --type task`}
        className="mb-6"
      />

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        OpenClaw documentation
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.openclaw.ai/index" target="_blank" rel="noopener noreferrer" className={extLink}>
            Overview
          </a>
          <span className="text-muted-foreground">— self-hosted agent gateway</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://www.getopenclaw.ai/docs/configuration" target="_blank" rel="noopener noreferrer" className={extLink}>
            Configuration
          </a>
          <span className="text-muted-foreground">— setup wizard and settings reference</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://openclaw-ai.com/en/docs/tools/index" target="_blank" rel="noopener noreferrer" className={extLink}>
            Tools
          </a>
          <span className="text-muted-foreground">— browser, canvas, cron, and access control</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://docs.openclaw.ai/skills" target="_blank" rel="noopener noreferrer" className={extLink}>
            Skills
          </a>
          <span className="text-muted-foreground">— extensible skill folders and ClawHub registry</span>
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
