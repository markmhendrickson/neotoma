import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What ChatGPT provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          Conversation history with search across past chats
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://help.openai.com/en/articles/8590148-memory-in-chatgpt-remembering-what-you-chat-about" target="_blank" rel="noopener noreferrer" className={extLink}>
              Memory
            </a>{" "}
            — saved memories and chat history references that persist across conversations on all
            plans
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://help.openai.com/en/articles/20001049-apps-in-custom-gpts-for-business-accounts-beta" target="_blank" rel="noopener noreferrer" className={extLink}>
              Custom GPTs
            </a>{" "}
            with persistent system instructions and app integrations
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <span>
            <a href="https://platform.openai.com/docs/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
              MCP support
            </a>{" "}
            via{" "}
            <a href="https://help.openai.com/en/articles/12584461" target="_blank" rel="noopener noreferrer" className={extLink}>
              developer mode
            </a>{" "}
            — full read/write tool access for Business and Enterprise accounts
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What ChatGPT doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Structured entity resolution with typed schemas — ChatGPT's{" "}
            <a href="https://help.openai.com/en/articles/8590148-memory-in-chatgpt-remembering-what-you-chat-about" target="_blank" rel="noopener noreferrer" className={extLink}>
              memory
            </a>{" "}
            stores preference-level facts, not schema-bound entities
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Deterministic state reconstruction from observation history
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Cross-tool access — memory stays inside ChatGPT's ecosystem
          </span>
        </li>
        <li className="text-[15px] leading-7 flex items-start gap-2">
          <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
          <span className="text-muted-foreground">
            Full audit trail and provenance for every stored fact
          </span>
        </li>
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Deterministic guarantees Neotoma provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">How they connect</h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        ChatGPT supports MCP via{" "}
        <a href="https://help.openai.com/en/articles/12584461" target="_blank" rel="noopener noreferrer" className={extLink}>
          developer mode
        </a>
        . Build a remote MCP server for Neotoma using the{" "}
        <a href="https://platform.openai.com/docs/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
          OpenAI MCP guide
        </a>{" "}
        and connect it from your ChatGPT settings. The agent stores every conversation turn and
        extracted entities before responding.
      </p>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Neotoma's CLI and API can also be used alongside ChatGPT — store facts from ChatGPT
        conversations using the CLI, and they'll be available in your next session across any
        connected tool.
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        ChatGPT documentation
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://help.openai.com/en/articles/8590148-memory-in-chatgpt-remembering-what-you-chat-about" target="_blank" rel="noopener noreferrer" className={extLink}>
            Memory FAQ
          </a>
          <span className="text-muted-foreground">— saved memories and chat history</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://platform.openai.com/docs/mcp" target="_blank" rel="noopener noreferrer" className={extLink}>
            Building MCP servers
          </a>
          <span className="text-muted-foreground">— connecting tools to ChatGPT</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://help.openai.com/en/articles/12584461" target="_blank" rel="noopener noreferrer" className={extLink}>
            Developer mode
          </a>
          <span className="text-muted-foreground">— MCP apps in ChatGPT</span>
        </li>
        <li className="text-[14px] leading-6 flex items-start gap-2">
          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>&rarr;</span>
          <a href="https://help.openai.com/en/articles/20001049-apps-in-custom-gpts-for-business-accounts-beta" target="_blank" rel="noopener noreferrer" className={extLink}>
            Apps in custom GPTs
          </a>
          <span className="text-muted-foreground">— integrating tools into custom GPTs</span>
        </li>
      </ul>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
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
