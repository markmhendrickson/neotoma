import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { GettingStartedEvaluateInstallLinks } from "../GettingStartedEvaluateInstallLinks";
import { IntegrationSection } from "../IntegrationSection";
import { IntegrationBeforeAfter, IntegrationActivation } from "../IntegrationExtras";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithOpenCodePage() {
  return (
    <DetailPage title="Neotoma with OpenCode">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          OpenCode is a local coding agent with a TypeScript plugin system. Neotoma adds a
          persistent, user-owned state layer that OpenCode can reach through MCP and lifecycle
          hooks.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for OpenClaw instead? See{" "}
          <Link to="/neotoma-with-openclaw" className={extLink}>
            Neotoma with OpenClaw
          </Link>
          .
        </p>
      </section>

      <IntegrationSection sectionKey="what-opencode-provides" title="What OpenCode provides" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            Local agent runtime for code editing, shell work, and project tasks
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              <a
                href="https://dev.opencode.ai/docs/plugins/"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Plugin hooks
              </a>{" "}
              for sessions, messages, tool execution, shell environment, and compaction context
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span className="min-w-0">
              Load plugins from <code>opencode.json</code> (npm packages) or from local files under{" "}
              <code>.opencode/plugins/</code> and <code>~/.config/opencode/plugins/</code>
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="what-opencode-does-not-handle" title="What OpenCode doesn't handle">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Durable structured memory shared across other agent tools
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Entity resolution, observation history, or provenance-backed facts
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="min-w-0 text-muted-foreground">
              A persistence or consistency layer for external stores: OpenCode runs hooks and tool
              calls but does not verify, deduplicate, sequence, or repair what lands in databases,
              APIs, or files; that remains the job of plugins and integrations you add
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="deterministic-guarantees" title="Deterministic guarantees Neotoma provides">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          {[
            "Persistent memory graph shared with Cursor, Claude Code, Codex, ChatGPT, and OpenClaw",
            "Conversation, message, tool, and compaction observations with stable provenance",
            "Structured state written by the agent through MCP, with hook capture as a safety net",
            "CLI fallback when MCP is unavailable or the agent needs direct terminal access",
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
          OpenCode stays responsible for the agent runtime. Neotoma stays responsible for the
          durable state layer. MCP remains the quality path for schema-typed writes, while the
          OpenCode plugin records baseline turn activity when the agent misses a step.
        </p>
        <TableScrollWrapper className="mb-4 w-full max-w-full">
          <table className="w-full text-[14px] leading-6 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Concern</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">OpenCode</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Neotoma</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Agent runtime and tools</td>
                <td className="align-top px-4 py-3">Coding agent</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Plugin lifecycle hooks</td>
                <td className="align-top px-4 py-3">Event surface</td>
                <td className="align-top px-4 py-3">Hook package</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Structured entities and tasks</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Store via MCP</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Cross-tool memory</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Shared state graph</td>
              </tr>
              <tr>
                <td className="align-top px-4 py-3">Audit trail and provenance</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Observation history</td>
              </tr>
            </tbody>
          </table>
        </TableScrollWrapper>
      </IntegrationSection>

      <IntegrationSection sectionKey="neotoma-opencode-plugin" title="Neotoma OpenCode plugin">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          The{" "}
          <a
            href="https://github.com/markmhendrickson/neotoma/tree/main/packages/opencode-plugin"
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            Neotoma OpenCode plugin
          </a>{" "}
          is published as <code>@neotoma/opencode-plugin</code>. Add it to{" "}
          <code>opencode.json</code>:
        </p>
        <pre className="mb-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-[13px] leading-6">
          <code>{`{
  "plugin": ["@neotoma/opencode-plugin"]
}`}</code>
        </pre>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          OpenCode installs npm plugins automatically at startup. For local plugin files, export a
          named plugin function from <code>~/.config/opencode/plugins/neotoma.ts</code>:
        </p>
        <pre className="mb-0 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-[13px] leading-6">
          <code>{`import neotoma from "@neotoma/opencode-plugin";

export const Neotoma = neotoma();`}</code>
        </pre>
      </IntegrationSection>

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <GettingStartedEvaluateInstallLinks agentTargetPhrase="OpenCode" />
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          Start Neotoma locally, then let OpenCode load the plugin from npm or a local plugin file:
        </p>
        <pre className="mb-3 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-[13px] leading-6">
          <code>{`npm install -g neotoma
neotoma api start --background --env dev`}</code>
        </pre>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Keep MCP configured as well. Hooks guarantee baseline capture; MCP gives the agent the
          richer store, retrieval, relationship, and feedback tools.
        </p>
      </IntegrationSection>

      <IntegrationSection sectionKey="opencode-documentation" title="OpenCode documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://dev.opencode.ai/docs/plugins/"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Plugins
            </a>
            <span className="text-muted-foreground"> (npm plugins, local files, and hook events)</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://opencode.ai/docs/sdk"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              SDK
            </a>
            <span className="text-muted-foreground"> (client APIs exposed to plugin context)</span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationBeforeAfter toolName="OpenCode" />
      <IntegrationActivation toolName="OpenCode" />
      <p className="text-[14px] leading-6 text-muted-foreground">
        See the{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/tree/main/packages/opencode-plugin"
          target="_blank"
          rel="noopener noreferrer"
          className={extLink}
        >
          package README
        </a>
        ,{" "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>
        ,{" "}
        <Link to="/cli" className={extLink}>
          CLI reference
        </Link>
        , and{" "}
        <Link to="/agent-instructions" className={extLink}>
          agent instructions
        </Link>{" "}
        for the full operating contract.
      </p>
    </DetailPage>
  );
}
