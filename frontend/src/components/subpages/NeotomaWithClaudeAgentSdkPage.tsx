import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES, sendFunnelInstallPromptCopy } from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { GettingStartedEvaluateInstallLinks } from "../GettingStartedEvaluateInstallLinks";
import { IntegrationSection } from "../IntegrationSection";
import { IntegrationBeforeAfter, IntegrationActivation } from "../IntegrationExtras";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithClaudeAgentSdkPage() {
  return (
    <DetailPage title="Memory infrastructure for Claude agents">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          The Claude Agent SDK and Managed Agents let developers build agents on top of Anthropic's
          platform primitives: bash, code execution, web search, the text editor, and the Memory
          Tool. Neotoma connects as an MCP server alongside these tools and provides a
          schema-bound, append-only memory backend for facts that must be trustworthy across
          sessions, tools, and agents.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for the Claude web or desktop apps? See{" "}
          <Link to="/neotoma-with-claude" className={extLink}>
            Neotoma with Claude
          </Link>
          . For the local CLI, see{" "}
          <Link to="/neotoma-with-claude-code" className={extLink}>
            Neotoma with Claude Code
          </Link>
          .
        </p>
      </section>

      <IntegrationSection
        sectionKey="what-agent-sdk-provides"
        title="What the Agent SDK and Managed Agents provide"
        dividerBefore={false}
      >
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <span>
              <a
                href="https://docs.claude.com/en/api/agent-sdk/overview"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Claude Agent SDK
              </a>{" "}
              (Python and TypeScript) for running agents in your own process with a configurable
              tool set
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <span>
              <a
                href="https://docs.claude.com/en/docs/claude-code/managed-agents"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Managed Agents
              </a>{" "}
              for running agents in Anthropic-hosted cloud containers without managing
              infrastructure
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <span>
              The{" "}
              <a
                href="https://docs.claude.com/en/docs/build-with-claude/memory-tool"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Memory Tool
              </a>{" "}
              (beta), which gives agents a client-side <code>/memories</code> file directory for
              cross-session state
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <span>
              MCP server support (stdio for local SDK, remote HTTPS for Managed Agents) for
              connecting external tools and memory backends
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection
        sectionKey="what-agent-sdk-does-not-handle"
        title="What they don't handle"
      >
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">
              Schema validation on memory writes. The Memory Tool stores unstructured files; any
              string can be written, and malformed data is accepted silently
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">
              Append-only guarantees. Files in <code>/memories</code> can be overwritten or deleted
              by the agent with no history of prior versions
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">
              Entity resolution. There is no canonical ID for a person, task, or record, so the
              same fact can be written in multiple conflicting forms
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">
              Provenance tracking. There is no record of which agent, session, or pipeline wrote a
              given fact, or when
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">
              Cross-tool access. Memory written by an Agent SDK process is not visible to Claude
              Desktop, Cursor, Codex, or any other tool
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">
              Concurrent-write safety. Multiple agents writing to the same file can silently
              clobber each other
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection
        sectionKey="deterministic-guarantees"
        title="Deterministic guarantees Neotoma provides"
      >
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          {[
            "Append-only observations: writes are never silently overwritten, and prior versions are always recoverable",
            "Schema-bound entities: invalid writes are rejected at store time, not discovered at read time",
            "Deterministic state: same observations always produce the same entity snapshots",
            "Full provenance: every field traces to the agent, session, and observation that wrote it",
            "Cross-tool continuity: memory is shared with Claude, Claude Code, Cursor, Codex, and ChatGPT",
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
          The Memory Tool and Neotoma address different layers of the problem and can run at the
          same time. Use the Memory Tool for lightweight scratchpad state that is specific to the
          current agent. Use Neotoma for facts that must survive compaction, cross tool boundaries,
          or carry an audit trail.
        </p>
        <TableScrollWrapper className="mb-4 w-full max-w-full">
          <table className="w-full text-[14px] leading-6 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Use case</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Memory Tool</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Neotoma</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Scratchpad notes during a session</td>
                <td className="align-top px-4 py-3">Yes</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Agent-specific preferences and conventions</td>
                <td className="align-top px-4 py-3">Yes</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Structured entities (people, tasks, records)</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Store via MCP</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Facts that must survive context compaction</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Append-only log</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Multi-agent pipelines with shared state</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Cross-tool memory</td>
              </tr>
              <tr>
                <td className="align-top px-4 py-3">Audit trail and field-level provenance</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Observation history</td>
              </tr>
            </tbody>
          </table>
        </TableScrollWrapper>
        <p className="text-[14px] leading-6 text-muted-foreground">
          See the{" "}
          <Link to="/memory-guarantees" className={extLink}>
            full list of memory guarantees
          </Link>{" "}
          for the architectural reasoning behind this split.
        </p>
      </IntegrationSection>

      <IntegrationSection sectionKey="setup-notes" title="Setup notes">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Neotoma connects to both the Agent SDK and Managed Agents through MCP. The transport
          depends on where the agent is running.
        </p>
        <ul className="list-none pl-0 space-y-3 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <span>
              <strong className="text-foreground">Agent SDK (local process):</strong>{" "}
              use stdio. The SDK spawns <code>neotoma mcp</code> as a subprocess. Same pattern as{" "}
              <Link to="/neotoma-with-claude-connect-desktop" className={extLink}>
                Claude Desktop
              </Link>
              .
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <span>
              <strong className="text-foreground">Managed Agents (cloud containers):</strong>{" "}
              expose Neotoma's API server over HTTPS and connect via remote MCP. Same pattern as{" "}
              <Link to="/neotoma-with-claude-connect-remote-mcp" className={extLink}>
                claude.ai remote MCP
              </Link>
              . Local stdio is not reachable from Anthropic-hosted containers.
            </span>
          </li>
        </ul>
        <p className="text-[14px] leading-6 text-muted-foreground mt-4">
          See the{" "}
          <a
            href="https://docs.claude.com/en/api/agent-sdk/mcp"
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            Agent SDK MCP documentation
          </a>{" "}
          for current configuration shape. SDK parameter names may change; verify against the
          upstream docs before wiring up a production integration.
        </p>
      </IntegrationSection>

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <GettingStartedEvaluateInstallLinks agentTargetPhrase="the Claude Agent SDK or Managed Agents" />
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          If you are ready to proceed, paste this prompt into a Claude agent. The agent handles
          evaluation, installation if needed, activation, and MCP configuration.
        </p>
        <CopyableCodeBlock
          code={SITE_CODE_SNIPPETS.agentInstallPrompt}
          className="mb-4"
          onAfterCopy={() => sendFunnelInstallPromptCopy("doc_neotoma_with_claude_agent_sdk")}
        />
      </IntegrationSection>

      <IntegrationSection sectionKey="agent-sdk-documentation" title="Claude Agent SDK documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <a
              href="https://docs.claude.com/en/api/agent-sdk/overview"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Agent SDK overview
            </a>
            <span className="text-muted-foreground"> (Python and TypeScript)</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <a
              href="https://docs.claude.com/en/api/agent-sdk/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              MCP in the Agent SDK
            </a>
            <span className="text-muted-foreground"> (connecting external tools and memory backends)</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <a
              href="https://docs.claude.com/en/docs/build-with-claude/memory-tool"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Memory Tool
            </a>
            <span className="text-muted-foreground"> (file-based <code>/memories</code> directory)</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            <a
              href="https://docs.claude.com/en/docs/claude-code/managed-agents"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Managed Agents
            </a>
            <span className="text-muted-foreground"> (Anthropic-hosted agent containers)</span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationBeforeAfter toolName="Claude Agent SDK" />
      <IntegrationActivation toolName="Claude Agent SDK" />
      <p className="text-[14px] leading-6 text-muted-foreground">
        Start with{" "}
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithClaudeAgentSdkTailEvaluate}
          className={extLink}
        >
          evaluation
        </TrackedProductLink>
        , see the{" "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithClaudeAgentSdkTailInstall}
          className={extLink}
        >
          install guide
        </TrackedProductLink>{" "}
        for more options,{" "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>{" "}
        for MCP setup, the{" "}
        <Link to="/neotoma-vs-platform-memory" className={extLink}>
          platform memory comparison
        </Link>{" "}
        for a broader picture, and{" "}
        <Link to="/agent-instructions" className={extLink}>
          agent instructions
        </Link>{" "}
        for behavioral details.
      </p>
    </DetailPage>
  );
}
