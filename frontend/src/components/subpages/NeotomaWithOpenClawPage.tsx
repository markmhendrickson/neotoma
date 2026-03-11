import { Link } from "react-router-dom";
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">How they connect</h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Neotoma runs as an MCP server. Point OpenClaw at Neotoma's stdio or HTTP endpoint via the{" "}
        <a href="https://www.getopenclaw.ai/docs/configuration" target="_blank" rel="noopener noreferrer" className={extLink}>
          configuration file
        </a>
        . The agent stores conversations and extracted entities automatically; retrieval happens
        before every response.
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
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        If MCP is not yet available in your OpenClaw environment, use the Neotoma CLI directly from
        the same machine:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">
        {`neotoma store --json='[{"entity_type":"task","title":"Follow up","status":"open"}]'
neotoma entities list --type task`}
      </pre>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Execution layer vs. state layer
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-6">
        OpenClaw is execution — it gives the agent a machine and the ability to act. Neotoma is the
        state layer — it holds the user's structured memory that any agent can read and write. The
        two are complementary: agents use OpenClaw for actions and Neotoma for durable,
        cross-platform structured data.
      </p>

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
