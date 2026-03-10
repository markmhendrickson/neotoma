import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function NeotomaWithChatGPTPage() {
  return (
    <DetailPage title="Neotoma with ChatGPT">
      <section className="mb-8">
        <p className="text-[15px] leading-7 text-foreground mb-4">
          ChatGPT offers conversation history and custom GPTs with persistent instructions.
          Neotoma adds structured, deterministic memory with entity resolution and
          cross-tool continuity — accessible from ChatGPT and every other tool in your
          stack.
        </p>
      </section>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What ChatGPT provides
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Conversation history with search across past chats",
          "Custom GPTs with persistent system instructions",
          "Memory feature that retains user preferences and facts",
          "MCP support for connecting external tools (rolling out)",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        What ChatGPT doesn't handle
      </h2>
      <ul className="list-none pl-0 space-y-1.5 mb-6">
        {[
          "Structured entity resolution with typed schemas",
          "Deterministic state reconstruction from observation history",
          "Cross-tool access — memory stays inside ChatGPT's ecosystem",
          "Full audit trail and provenance for every stored fact",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-rose-400 shrink-0" aria-hidden>&times;</span>
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
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
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>&rarr;</span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        How they connect
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        ChatGPT is adding MCP support for connecting external tools. Once available,
        configure Neotoma as an MCP server in your ChatGPT settings. The agent stores
        every conversation turn and extracted entities before responding.
      </p>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        In the meantime, Neotoma's CLI and API can be used alongside ChatGPT — store
        facts from ChatGPT conversations using the CLI, and they'll be available in
        your next session across any connected tool.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        {" "}for full setup,{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        {" "}for terminal usage, and{" "}
        <Link to="/agent-instructions" className="text-foreground underline underline-offset-2 hover:no-underline">
          agent instructions
        </Link>
        {" "}for behavioral details.
      </p>
    </DetailPage>
  );
}
