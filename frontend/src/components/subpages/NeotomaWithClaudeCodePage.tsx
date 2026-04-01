import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES, sendFunnelInstallPromptCopy } from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { GettingStartedEvaluateInstallLinks } from "../GettingStartedEvaluateInstallLinks";
import { IntegrationSection } from "../IntegrationSection";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithClaudeCodePage() {
  return (
    <DetailPage title="Neotoma with Claude Code">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          Claude Code is Anthropic's local CLI agent for development tasks. It runs in your terminal
          with direct filesystem access. Neotoma adds persistent structured memory that survives
          across sessions and tools via MCP or CLI fallback.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Looking for Claude's web, mobile, or desktop apps? See{" "}
          <Link to="/neotoma-with-claude" className={extLink}>
            Neotoma with Claude
          </Link>
          .
        </p>
      </section>

      <IntegrationSection sectionKey="what-claude-code-provides" title="What Claude Code provides" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Local terminal agent with direct filesystem and shell access
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            Session memory plus{" "}
            <a href="https://code.claude.com/docs/en/memory#auto-memory" target="_blank" rel="noopener noreferrer" className={extLink}>
              auto memory
            </a>{" "}
            that records corrections and preferences across sessions
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP server support
            </a>{" "}
            via <code>.mcp.json</code> at your project root (stdio, SSE, and HTTP transports)
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://code.claude.com/docs/en/memory#claudemd-files" target="_blank" rel="noopener noreferrer" className={extLink}>
              CLAUDE.md
            </a>{" "}
            project context files for persistent instructions at project, user, or org scope
          </span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="what-claude-code-does-not-handle" title="What Claude Code doesn't handle">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Memory that persists across sessions after terminal closes; auto memory stores
            preferences but not structured entity data
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Structured entity resolution or typed data storage
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Cross-tool access; session context is local to Claude Code
          </span>
        </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="deterministic-guarantees" title="Deterministic guarantees Neotoma provides">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        {[
          "Persistent memory graph accessible across all Claude Code sessions",
          "Deterministic state: same observations always produce the same entity snapshots",
          "Full provenance trail for every stored fact",
          "CLI fallback for direct terminal access when MCP is not configured",
          "Cross-tool continuity: memory shared with Claude, Cursor, Codex, and ChatGPT",
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
        Keep{" "}
        <a href="https://code.claude.com/docs/en/memory#auto-memory" target="_blank" rel="noopener noreferrer" className={extLink}>
          auto memory
        </a>{" "}
        and CLAUDE.md on. Auto memory saves build commands, debugging insights, and code style
        preferences to <code>~/.claude/projects/&lt;project&gt;/memory/</code>. The first 200
        lines of <code>MEMORY.md</code> load into every session. It&apos;s machine-local and
        per-project, so it handles what it&apos;s good at; Neotoma handles what it cannot. Both are
        active simultaneously with no conflict.
        </p>
        <TableScrollWrapper className="mb-4 w-full max-w-full">
          <table className="w-full text-[14px] leading-6 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Concern</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Claude Code</th>
                <th className="text-left align-top px-4 py-3 font-medium text-foreground">Neotoma</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Coding preferences &amp; corrections</td>
                <td className="align-top px-4 py-3">Auto memory</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Project instructions</td>
                <td className="align-top px-4 py-3">CLAUDE.md</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Build commands &amp; debugging notes</td>
                <td className="align-top px-4 py-3">Auto memory (MEMORY.md)</td>
                <td className="align-top px-4 py-3">-</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Structured entities (people, tasks, decisions)</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Store via MCP</td>
              </tr>
              <tr className="border-b border-border">
                <td className="align-top px-4 py-3">Cross-tool state</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Shared memory graph</td>
              </tr>
              <tr>
                <td className="align-top px-4 py-3">Audit trail &amp; provenance</td>
                <td className="align-top px-4 py-3">-</td>
                <td className="align-top px-4 py-3">Observation history</td>
              </tr>
            </tbody>
          </table>
        </TableScrollWrapper>
      </IntegrationSection>

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <GettingStartedEvaluateInstallLinks agentTargetPhrase="Claude Code" />
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        If you are ready to proceed, paste this prompt into Claude Code. The
        agent handles evaluation, installation if needed, activation, and local
        MCP configuration.
        </p>
        <CopyableCodeBlock
          code={SITE_CODE_SNIPPETS.agentInstallPrompt}
          className="mb-4"
          onAfterCopy={() => sendFunnelInstallPromptCopy("doc_neotoma_with_claude_code")}
        />
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        This is a local integration. Neotoma runs on the same machine via stdio. No API server
        or remote access is required. The agent writes to <code>.mcp.json</code> at your project root.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        When MCP is not available, agents can use the <code>neotoma</code> CLI directly from the
        terminal as a fallback.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        After activation, offer additional remote access points only if the user
        wants Neotoma available outside Claude Code as well.
        </p>
      </IntegrationSection>

      <IntegrationSection sectionKey="claude-code-documentation" title="Claude Code documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP in Claude Code
          </a>
          <span className="text-muted-foreground"> (connecting external tools via .mcp.json)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://code.claude.com/docs/en/memory" target="_blank" rel="noopener noreferrer" className={extLink}>
            Memory in Claude Code
          </a>
          <span className="text-muted-foreground"> (CLAUDE.md files and auto memory)</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://code.claude.com/docs/en/memory#auto-memory" target="_blank" rel="noopener noreferrer" className={extLink}>
            Auto memory
          </a>
          <span className="text-muted-foreground">
            {" "}
            (how Claude learns preferences and patterns across sessions)
          </span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://code.claude.com/docs/en/settings" target="_blank" rel="noopener noreferrer" className={extLink}>
            Settings
          </a>
          <span className="text-muted-foreground"> (project and user-level configuration)</span>
        </li>
        </ul>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Start with{" "}
        <TrackedProductLink
          to="/evaluate"
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithClaudeCodeTailEvaluate}
          className={extLink}
        >
          evaluation
        </TrackedProductLink>
        , see the{" "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.neotomaWithClaudeCodeTailInstall}
          className={extLink}
        >
          install guide
        </TrackedProductLink>{" "}
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
