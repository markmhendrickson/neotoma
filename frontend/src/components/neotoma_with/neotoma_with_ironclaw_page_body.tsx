import { CopyableCodeBlock } from "@/components/CopyableCodeBlock";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";
import { IntegrationSection } from "@/components/IntegrationSection";
import { IntegrationBeforeAfter, IntegrationActivation } from "@/components/IntegrationExtras";
import { IntegrationLinkCard } from "@/components/IntegrationLinkCard";
import { TableScrollWrapper } from "@/components/ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const IRONCLAW_HTTP_SETUP = `# 1. Start Neotoma with an HTTPS tunnel
neotoma api start --env prod --tunnel

# 2. Add the remote MCP endpoint to IronClaw
ironclaw mcp add neotoma https://<tunnel-host>/mcp \\
  --description "Neotoma structured memory"

# 3. Verify IronClaw can see Neotoma tools
ironclaw mcp test neotoma`;

const IRONCLAW_STDIO_CONFIG = `{
  "servers": [
    {
      "name": "neotoma",
      "url": "",
      "description": "Neotoma structured memory",
      "enabled": true,
      "transport": {
        "transport": "stdio",
        "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh",
        "args": []
      }
    }
  ]
}`;

export function NeotomaWithIronClawPageBody() {
  return (
    <>
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          IronClaw is a secure, always-on agent runtime. Neotoma gives that runtime a
          structured state layer: versioned entities, relationships, timelines, and
          provenance that are also available to Cursor, Claude Code, Codex, and ChatGPT.
        </p>
      </section>

      <IntegrationSection sectionKey="what-ironclaw-provides" title="What IronClaw provides" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          {[
            "Always-on agent execution with REPL, web gateway, webhooks, and channel integrations",
            "WASM sandboxing with capability manifests, endpoint allowlists, fuel limits, and leak detection",
            "MCP client support for hosted tool providers",
            "Workspace memory with markdown-style files and hybrid full-text plus vector search",
          ].map((item) => (
            <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
                &rarr;
              </span>
              {item}
            </li>
          ))}
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="why-add-neotoma" title="Why add Neotoma">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          {[
            "IronClaw workspace files are useful working memory; Neotoma adds durable structured state",
            "Facts stored from IronClaw become queryable from every other MCP client",
            "Entity resolution keeps contacts, tasks, decisions, and relationships unified across tools",
            "Versioned observations let you reconstruct what the agent knew at decision time",
          ].map((item) => (
            <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
                &rarr;
              </span>
              {item}
            </li>
          ))}
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="using-them-together" title="Using them together">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Treat IronClaw as the execution layer and Neotoma as the state layer. IronClaw
          runs the agent and invokes tools. Neotoma stores the structured truth that should
          survive across sessions, agents, and clients.
        </p>
        <TableScrollWrapper className="mb-4 w-full max-w-full">
          <table className="w-full text-[14px] leading-6 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Concern</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">IronClaw</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Neotoma</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Agent execution</td>
                <td className="align-top px-4 py-3">Always-on runtime, channels, routines</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Tool security</td>
                <td className="align-top px-4 py-3">WASM sandbox and allowlists</td>
                <td className="align-top px-4 py-3">State-layer access controls</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Working memory</td>
                <td className="align-top px-4 py-3">Workspace files and hybrid search</td>
                <td className="align-top px-4 py-3">Structured entities and graph traversal</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Cross-tool continuity</td>
                <td className="align-top px-4 py-3">IronClaw-scoped</td>
                <td className="align-top px-4 py-3">Shared through MCP</td>
              </tr>
              <tr>
                <td className="align-top px-4 py-3">State integrity</td>
                <td className="align-top px-4 py-3">Audit logs for tool activity</td>
                <td className="align-top px-4 py-3">Versioned observations with provenance</td>
              </tr>
            </tbody>
          </table>
        </TableScrollWrapper>
      </IntegrationSection>

      <IntegrationSection sectionKey="setup" title="Setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Start with HTTP MCP because IronClaw documents `ironclaw mcp add`, `ironclaw mcp list`,
          and `ironclaw mcp test` as the stable server-management path.
        </p>
        <CopyableCodeBlock code={IRONCLAW_HTTP_SETUP} className="mb-4" />
        <p className="text-[14px] leading-6 text-muted-foreground mb-4">
          IronClaw stores MCP server configuration in its database when available and falls back to{" "}
          <code>~/.ironclaw/mcp_servers.json</code>. If your IronClaw build supports stdio MCP
          transports, you can use a local config entry instead:
        </p>
        <CopyableCodeBlock code={IRONCLAW_STDIO_CONFIG} className="mb-4" />
        <IntegrationLinkCard
          title="Developer setup guide"
          preview="Exact IronClaw MCP commands, local stdio fallback, verification, and troubleshooting."
          to="/mcp"
        />
        <p className="text-[14px] leading-6 text-muted-foreground mt-3">
          Full setup details live in <code>docs/developer/mcp_ironclaw_setup.md</code>.
        </p>
      </IntegrationSection>

      <IntegrationSection sectionKey="documentation" title="IronClaw documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <a href="https://mintlify.wiki/nearai/ironclaw/cli/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP server management
            </a>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <a href="https://mintlify.wiki/nearai/ironclaw/tools/wasm" target="_blank" rel="noopener noreferrer" className={extLink}>
              WASM tool system
            </a>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <a href="https://github.com/nearai/ironclaw" target="_blank" rel="noopener noreferrer" className={extLink}>
              IronClaw GitHub repository
            </a>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationBeforeAfter toolName="IronClaw" />
      <IntegrationActivation toolName="IronClaw" />
      <p className="text-[14px] leading-6 text-muted-foreground">
        Start with the{" "}
        <MdxI18nLink to="/install" className={extLink}>
          install guide
        </MdxI18nLink>
        , then review the{" "}
        <MdxI18nLink to="/mcp" className={extLink}>
          MCP reference
        </MdxI18nLink>{" "}
        and{" "}
        <MdxI18nLink to="/agent-instructions" className={extLink}>
          agent instructions
        </MdxI18nLink>{" "}
        for the memory rules IronClaw should follow when it writes to Neotoma.
      </p>
    </>
  );
}
