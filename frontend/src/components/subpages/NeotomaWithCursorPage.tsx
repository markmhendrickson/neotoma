import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES, sendFunnelInstallPromptCopy } from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { GettingStartedEvaluateInstallLinks } from "../GettingStartedEvaluateInstallLinks";
import { IntegrationSection } from "../IntegrationSection";
import { IntegrationBeforeAfter, IntegrationActivation, IntegrationLimitations } from "../IntegrationExtras";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithCursorPage() {
  return (
    <DetailPage title="Neotoma with Cursor">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Cursor provides project-scoped context and session memory. Neotoma adds persistent,
          cross-project memory with entity resolution and versioned state. They complement each
          other without conflict.
        </p>
      </section>

      <IntegrationSection sectionKey="what-cursor-provides" title="What Cursor provides" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              Project-scoped context from open files, workspace, and{" "}
              <a
                href="https://docs.cursor.com/context/@-symbols/@-notepads"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Notepads
              </a>
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            Session memory within the current conversation
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              Persistent instructions via{" "}
              <a
                href="https://docs.cursor.com/context/rules"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                .cursor/rules/
              </a>{" "}
              (always-apply, glob-scoped, or agent-invoked rule files)
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              Native{" "}
              <a
                href="https://docs.cursor.com/context/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                MCP integration
              </a>{" "}
              (30+ built-in servers and support for custom stdio, SSE, and HTTP servers)
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="what-cursor-does-not-handle" title="What Cursor doesn't handle">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Memory that persists across projects or after session ends. Rules carry forward
              instructions, not data
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Entity resolution across different conversations and data sources
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Versioned state with audit trail and provenance
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="deterministic-guarantees" title="Deterministic guarantees Neotoma provides">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          {[
            "Persistent memory across all projects, sessions, and tools",
            "Deterministic entity resolution: contacts, tasks, and relationships unified by canonical IDs",
            "Versioned state with full provenance: every fact traces to its source",
            "Cross-tool continuity: data stored from Cursor is available in Claude and Codex",
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
          Keep rules and notepads for what they do well: project instructions and reusable
          context snippets. Neotoma handles structured data that persists across projects and tools.
          Both are active simultaneously with no conflict.
        </p>
        <TableScrollWrapper className="mb-4 w-full max-w-full">
          <table className="w-full text-[14px] leading-6 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Concern</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Cursor</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Neotoma</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Project context &amp; open files</td>
                <td className="align-top px-4 py-3">Workspace</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Persistent AI instructions</td>
                <td className="align-top px-4 py-3">.cursor/rules/</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Reusable context snippets</td>
                <td className="align-top px-4 py-3">Notepads</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Structured entities across projects</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Store via MCP</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Cross-tool state</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Shared memory graph</td>
              </tr>
              <tr>
                <td className="align-top px-4 py-3">Versioned history &amp; audit trail</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Observation history</td>
              </tr>
            </tbody>
          </table>
        </TableScrollWrapper>
      </IntegrationSection>

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <GettingStartedEvaluateInstallLinks agentTargetPhrase="a Cursor agent chat" />
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          If you are ready to proceed, paste this prompt into a Cursor agent chat.
          The agent handles evaluation, installation if needed, activation, and
          local MCP configuration.
        </p>
        <CopyableCodeBlock
          code={SITE_CODE_SNIPPETS.agentInstallPrompt}
          className="mb-4"
          onAfterCopy={() => sendFunnelInstallPromptCopy("doc_neotoma_with_cursor")}
        />
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          This is a local integration. Neotoma runs on the same machine via stdio. No API
          server or remote access is required. The agent writes to <code>.cursor/mcp.json</code>{" "}
          (project-level) or <code>~/.cursor/mcp.json</code> (global) and restarts MCP
          automatically.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          After activation, offer to configure additional remote access points if
          the user also wants Neotoma available in hosted tools.
        </p>
      </IntegrationSection>

      <IntegrationBeforeAfter toolName="Cursor" />
      <IntegrationActivation toolName="Cursor" />
      <IntegrationLimitations />

      <IntegrationSection sectionKey="cursor-documentation" title="Cursor documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://docs.cursor.com/context/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              MCP integrations
            </a>
            <span className="text-muted-foreground"> (connecting external tools via MCP)</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://docs.cursor.com/context/rules"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Rules
            </a>
            <span className="text-muted-foreground">
              {" "}
              (persistent AI instructions via .cursor/rules/)
            </span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://docs.cursor.com/context/@-symbols/@-notepads"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Notepads
            </a>
            <span className="text-muted-foreground"> (reusable context shared across sessions)</span>
          </li>
        </ul>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Start with{" "}
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithCursorTailEvaluate}
          className={extLink}
        >
          evaluation
        </TrackedProductLink>
        , see the{" "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithCursorTailInstall}
          className={extLink}
        >
          install guide
        </TrackedProductLink>{" "}
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
