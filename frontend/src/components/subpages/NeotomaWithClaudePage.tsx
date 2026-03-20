import { Link } from "react-router-dom";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationLinkCard } from "../IntegrationLinkCard";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const projectInstructionsSnippet = `For any request that depends on stored facts, history, lists, counts, records,
timelines, prior work, or "what do you know / show me / list / summarize":

1. Call Neotoma MCP tools before answering.
2. Do not answer from Claude memory or chat history alone.
3. If Neotoma is unavailable or tool call fails, respond:
   "Neotoma retrieval failed: <error>. Please check the connector."
4. If no matching records are found, say so explicitly and stop.
5. Every factual claim must be traceable to Neotoma tool output from this turn.`;

export function NeotomaWithClaudePage() {
  return (
    <DetailPage title="Neotoma with Claude">
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

      <IntegrationSection sectionKey="setup-overview" title="Setup overview" dividerBefore={false}>
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Getting reliable Neotoma usage in Claude requires four steps: connect the MCP server,
          set tool permissions, create a Project, and add routing instructions. Each step builds
          on the previous one.
        </p>
        <ol className="list-decimal pl-5 space-y-1.5 mb-2 text-[15px] leading-7 text-muted-foreground">
          <li>Connect the Neotoma MCP server</li>
          <li>Set tool permissions to &ldquo;Always allow&rdquo;</li>
          <li>Create a Claude Project for Neotoma-backed work</li>
          <li>Add project instructions that route queries to Neotoma</li>
        </ol>
      </IntegrationSection>

      <IntegrationSection sectionKey="step-1-connect" title="Step 1: Connect the Neotoma MCP server">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Choose a connection method based on your setup. Claude Desktop uses local stdio;
          claude.ai uses remote MCP over HTTPS.
        </p>
        <IntegrationLinkCard
          title="Claude Desktop (local stdio)"
          preview="Run Neotoma on the same machine. No API server or tunnel required."
          to="/neotoma-with-claude-connect-desktop"
        />
        <IntegrationLinkCard
          title="claude.ai (remote MCP)"
          preview="Expose Neotoma over HTTPS via tunnel and connect from claude.ai settings."
          to="/neotoma-with-claude-connect-remote-mcp"
        />
        <p className="text-[14px] leading-6 text-muted-foreground mt-3">
          After connecting, verify the connector appears in{" "}
          <strong>Settings &rarr; Connectors</strong> and shows a &ldquo;Connected&rdquo; state.
          You should see Neotoma listed with its tools.
        </p>
      </IntegrationSection>

      <IntegrationSection sectionKey="step-2-permissions" title="Step 2: Set tool permissions">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          By default Claude may ask for permission before using connector tools, which breaks
          automatic retrieval. Set all Neotoma tools to always run without prompting:
        </p>
        <ol className="list-decimal pl-5 space-y-2 mb-2 text-[15px] leading-7">
          <li>
            Open{" "}
            <a
              href="https://claude.ai/customize/connectors"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Settings &rarr; Connectors
            </a>
          </li>
          <li>Click <strong>Neotoma</strong> in the connector list</li>
          <li>
            Under <strong>Tool permissions</strong>, set the dropdown for{" "}
            <strong>Other tools</strong> to <strong>Always allow</strong>
          </li>
        </ol>
        <p className="text-[14px] leading-6 text-muted-foreground">
          This ensures Claude can call Neotoma tools (retrieve, store, search) without
          interrupting you for approval each time.
        </p>
      </IntegrationSection>

      <IntegrationSection sectionKey="step-3-project" title="Step 3: Create a Claude Project">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Claude{" "}
          <a
            href="https://www.anthropic.com/news/projects"
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            Projects
          </a>{" "}
          let you attach persistent instructions that apply to every chat inside the project.
          This is the only way to give Claude standing orders on claude.ai without repeating
          them each conversation.
        </p>
        <ol className="list-decimal pl-5 space-y-2 mb-2 text-[15px] leading-7">
          <li>
            In the Claude sidebar, click <strong>Projects</strong> &rarr;{" "}
            <strong>Create project</strong>
          </li>
          <li>
            Name it something like <strong>Neotoma workspace</strong> (or whatever fits your
            use case)
          </li>
          <li>Open the project — all new chats started inside it will inherit its instructions</li>
        </ol>
        <div className="mt-3 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[14px] leading-6">
          <strong className="text-foreground">Why a Project?</strong>{" "}
          Without a Project, Claude has no persistent instruction surface. You would need to
          paste routing instructions at the start of every new chat, and Claude may still
          fall back to its own memory for queries that Neotoma should handle.
        </div>
      </IntegrationSection>

      <IntegrationSection sectionKey="step-4-instructions" title="Step 4: Add project instructions">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Open your project&apos;s settings and paste the following into the{" "}
          <strong>Custom instructions</strong> field. This tells Claude to route all factual
          retrieval through Neotoma and refuse to answer from internal memory alone.
        </p>
        <CopyableCodeBlock code={projectInstructionsSnippet} className="mb-4" />
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          This is a fail-closed policy: if Neotoma is unreachable, Claude says so instead of
          guessing from chat history. You can customize the wording, but the key constraints are:
        </p>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          {[
            "Tool-first — Neotoma is called before composing a response",
            "No silent fallback — Claude does not substitute its own memory",
            "Grounded output — every fact traces to a tool call in the current turn",
          ].map((item) => (
            <li key={item} className="text-[14px] leading-6 flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
                &rarr;
              </span>
              {item}
            </li>
          ))}
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="verify" title="Verify the setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Start a new chat inside the project and test with a query like:
        </p>
        <CopyableCodeBlock code="show me all my posts" className="mb-4" />
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Claude should call Neotoma tools before answering. Look for tool-use indicators
          (e.g. &ldquo;Ran commands, used Neotoma integration&rdquo;) in the response. If Claude
          answers from memory instead, check that:
        </p>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          {[
            "The chat is inside the project (not a standalone conversation)",
            "The connector shows \"Connected\" in Settings → Connectors",
            "Tool permissions are set to \"Always allow\"",
            "The project instructions are saved (not just drafted)",
          ].map((item) => (
            <li key={item} className="text-[14px] leading-6 flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
                &rarr;
              </span>
              <span className="text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="what-claude-provides" title="What Claude's platform provides">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              <a
                href="https://support.anthropic.com/en/articles/11817273-how-does-claude-s-memory-work"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Conversation memory
              </a>{" "}
              — saved memories and chat history that persist across sessions on all plans
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              <a
                href="https://www.anthropic.com/news/projects"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Projects
              </a>{" "}
              — organize chats with scoped documents and custom instructions (200K context window)
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            Artifacts for generated documents and code
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              MCP server connections via{" "}
              <a
                href="https://modelcontextprotocol.io/docs/develop/connect-local-servers"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Claude Desktop
              </a>{" "}
              and claude.ai (remote MCP)
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="what-claude-does-not-handle" title="What the platform doesn't handle">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Structured entity resolution across conversations and projects
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Persistent memory that survives session resets and model updates — Claude's{" "}
              <a
                href="https://support.anthropic.com/en/articles/11817273-how-does-claude-s-memory-work"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                memory
              </a>{" "}
              stores preferences but not structured, schema-bound entities
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Cross-tool access — data stays inside Claude's ecosystem
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Deterministic state reconstruction from recorded observations
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection sectionKey="deterministic-guarantees" title="Deterministic guarantees Neotoma provides">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
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
      </IntegrationSection>

      <IntegrationSection sectionKey="using-them-together" title="Using them together">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Keep Claude&apos;s memory and projects on. They handle conversational context and
          preferences; Neotoma handles structured state. Both are active simultaneously with no
          conflict.
        </p>
        <table className="w-full text-[14px] leading-6 mb-2 border-collapse">
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
      </IntegrationSection>

      <IntegrationSection sectionKey="claude-documentation" title="Claude documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://support.anthropic.com/en/articles/11817273-how-does-claude-s-memory-work"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Memory in Claude
            </a>
            <span className="text-muted-foreground">— saved memories and chat history</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://www.anthropic.com/news/projects"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Projects
            </a>
            <span className="text-muted-foreground">
              — scoped documents and custom instructions
            </span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://modelcontextprotocol.io/docs/develop/connect-local-servers"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              MCP in Claude Desktop
            </a>
            <span className="text-muted-foreground">— connecting local MCP servers</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://www.anthropic.com/news/context-management"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Context management
            </a>
            <span className="text-muted-foreground">— developer platform memory tool</span>
          </li>
        </ul>
      </IntegrationSection>

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
