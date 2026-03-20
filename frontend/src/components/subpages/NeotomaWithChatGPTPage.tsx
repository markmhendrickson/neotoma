import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function NeotomaWithChatGPTPage() {
  return (
    <DetailPage title="Neotoma with ChatGPT">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          ChatGPT offers conversation history and custom GPTs with persistent instructions. Neotoma
          adds structured, deterministic memory with entity resolution and cross-tool continuity —
          accessible from ChatGPT and every other tool in your stack.
        </p>
      </section>

      <IntegrationSection sectionKey="what-chatgpt-provides" title="What ChatGPT provides" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            Conversation history with search across past chats
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              <a
                href="https://help.openai.com/en/articles/8590148-memory-in-chatgpt-remembering-what-you-chat-about"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Memory
              </a>{" "}
              — saved memories and chat history references that persist across conversations on all
              plans
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              <a
                href="https://help.openai.com/en/articles/20001049-apps-in-custom-gpts-for-business-accounts-beta"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                Custom GPTs
              </a>{" "}
              with persistent system instructions and app integrations
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <span>
              <a
                href="https://platform.openai.com/docs/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                MCP support
              </a>{" "}
              via{" "}
              <a
                href="https://help.openai.com/en/articles/12584461"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                developer mode
              </a>{" "}
              — full read/write tool access for Business and Enterprise accounts
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection
        sectionKey="what-chatgpt-does-not-handle"
        title="What ChatGPT doesn't handle"
      >
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Structured entity resolution with typed schemas — ChatGPT's{" "}
              <a
                href="https://help.openai.com/en/articles/8590148-memory-in-chatgpt-remembering-what-you-chat-about"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                memory
              </a>{" "}
              stores preference-level facts, not schema-bound entities
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Deterministic state reconstruction from observation history
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Cross-tool access — memory stays inside ChatGPT's ecosystem
            </span>
          </li>
          <li className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>
              &times;
            </span>
            <span className="text-muted-foreground">
              Full audit trail and provenance for every stored fact
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
            "Structured entities with canonical IDs that persist across all sessions",
            "Deterministic state evolution — same observations always produce the same result",
            "Full provenance and audit trail for every stored fact",
            "Cross-tool continuity — memory is shared with Claude, Claude Code, Cursor, and Codex",
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
          Keep ChatGPT&apos;s memory on for conversational preferences. Neotoma handles structured
          entities and cross-tool state. Both are active simultaneously with no conflict.
        </p>
        <table className="w-full text-[14px] leading-6 mb-2 border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 font-medium text-foreground">Concern</th>
              <th className="text-left py-2 pr-4 font-medium text-foreground">ChatGPT</th>
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
              <td className="py-2 pr-4">Custom instructions &amp; GPT personas</td>
              <td className="py-2 pr-4">Custom GPTs</td>
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

      <IntegrationSection sectionKey="getting-started" title="Getting started">
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          Choose an integration path:
        </p>
        <div className="space-y-3">
          <Link
            to="/neotoma-with-chatgpt-connect-remote-mcp"
            className="group flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-left text-foreground no-underline hover:no-underline transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-6 font-medium">Connect ChatGPT via remote MCP</span>
              <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
                Tunnel, developer mode, add Neotoma MCP server URL
              </span>
            </span>
            <span className="mt-1 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden>
              &rarr;
            </span>
          </Link>
          <Link
            to="/neotoma-with-chatgpt-connect-custom-gpt"
            className="group flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-left text-foreground no-underline hover:no-underline transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-6 font-medium">Connect via custom GPT with OpenAPI</span>
              <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
                Full step-by-step setup: tunnel, Actions auth, instructions, OpenAPI paste
              </span>
            </span>
            <span className="mt-1 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden>
              &rarr;
            </span>
          </Link>
        </div>
      </IntegrationSection>

      <IntegrationSection sectionKey="chatgpt-documentation" title="ChatGPT documentation">
        <ul className="list-none pl-0 space-y-1.5 mb-2">
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://help.openai.com/en/articles/8590148-memory-in-chatgpt-remembering-what-you-chat-about"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Memory FAQ
            </a>
            <span className="text-muted-foreground">— saved memories and chat history</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://platform.openai.com/docs/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Building MCP servers
            </a>
            <span className="text-muted-foreground">— connecting tools to ChatGPT</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://help.openai.com/en/articles/12584461"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Developer mode
            </a>
            <span className="text-muted-foreground">— MCP apps in ChatGPT</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://help.openai.com/en/articles/20001049-apps-in-custom-gpts-for-business-accounts-beta"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Apps in custom GPTs
            </a>
            <span className="text-muted-foreground">— integrating tools into custom GPTs</span>
          </li>
          <li className="text-[14px] leading-6 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            <a
              href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/chatgpt_integration_instructions.md"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              ChatGPT integration instructions
            </a>
            <span className="text-muted-foreground">
              — copy-paste instructions and Actions OpenAPI spec
            </span>
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
