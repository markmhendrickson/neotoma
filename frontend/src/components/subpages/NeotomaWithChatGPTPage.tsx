import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Using them together
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Keep ChatGPT&apos;s memory on for conversational preferences. Neotoma handles structured
        entities and cross-tool state. Both are active simultaneously with no conflict.
      </p>
      <table className="w-full text-[14px] leading-6 mb-6 border-collapse">
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

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">
        Getting started
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Paste this prompt into an agent tool (e.g. Claude Code, Codex, or Cursor) to install Neotoma.
        The agent handles npm install, initialization, and local MCP configuration.
      </p>
      <CopyableCodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} className="mb-4" />

      <h3 className="text-[17px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Connect ChatGPT via remote MCP
      </h3>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        ChatGPT connects to MCP servers over the network via{" "}
        <a href="https://help.openai.com/en/articles/12584461" target="_blank" rel="noopener noreferrer" className={extLink}>
          developer mode
        </a>
        . After the agentic install above, configure remote access:
      </p>
      <ol className="list-decimal pl-5 space-y-4 mb-6">
        <li className="text-[15px] leading-7">
          <strong>Start the API server with a tunnel</strong> &mdash; the <code>--tunnel</code> flag
          auto-provisions a public HTTPS URL via ngrok or Cloudflare (whichever is installed)
          <CopyableCodeBlock code={`neotoma api start --env prod --tunnel`} className="mt-2 mb-1" />
          <p className="text-[14px] leading-6 text-muted-foreground mt-1">
            The tunnel URL is printed to the console and written to{" "}
            <code>/tmp/ngrok-mcp-url.txt</code>. You can also use a reverse proxy or your own domain
            instead of <code>--tunnel</code>.
          </p>
        </li>
        <li className="text-[15px] leading-7">
          <strong>Enable developer mode</strong> in ChatGPT &mdash; go to{" "}
          <a href="https://help.openai.com/en/articles/12584461" target="_blank" rel="noopener noreferrer" className={extLink}>
            Settings &rarr; Developer mode
          </a>{" "}
          (requires Business or Enterprise account).
        </li>
        <li className="text-[15px] leading-7">
          <strong>Add Neotoma as a remote MCP server</strong> &mdash; in ChatGPT&apos;s developer mode
          settings, add your tunnel URL (e.g. <code>https://&lt;tunnel-host&gt;/mcp</code>). ChatGPT
          authenticates via OAuth; the Neotoma API supports the{" "}
          <a href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization" target="_blank" rel="noopener noreferrer" className={extLink}>
            MCP OAuth authorization flow
          </a>
          .
        </li>
      </ol>
      <h3 className="text-[17px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Connect via custom GPT with OpenAPI
      </h3>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        You can also integrate Neotoma as an action inside a{" "}
        <a href="https://help.openai.com/en/articles/20001049-apps-in-custom-gpts-for-business-accounts-beta" target="_blank" rel="noopener noreferrer" className={extLink}>
          custom GPT
        </a>
        . This approach uses the Neotoma API&apos;s OpenAPI spec directly and works with any ChatGPT
        plan that supports custom GPTs.
      </p>
      <ol className="list-decimal pl-5 space-y-4 mb-6">
        <li className="text-[15px] leading-7">
          <strong>Start the API server with a tunnel</strong> (same as step 1 above).
        </li>
        <li className="text-[15px] leading-7">
          <strong>Create or edit a custom GPT</strong> &mdash; go to{" "}
          <a href="https://chatgpt.com/gpts/editor" target="_blank" rel="noopener noreferrer" className={extLink}>
            chatgpt.com/gpts/editor
          </a>{" "}
          and open the <strong>Configure</strong> tab.
        </li>
        <li className="text-[15px] leading-7">
          <strong>Add a new action</strong> &mdash; under Actions, click &ldquo;Create new
          action&rdquo; and import the OpenAPI spec from your Neotoma API:
          <CopyableCodeBlock
            code={`https://<tunnel-host>/openapi.json`}
            className="mt-2 mb-1"
          />
        </li>
        <li className="text-[15px] leading-7">
          <strong>Configure authentication</strong> &mdash; set the authentication type to
          &ldquo;OAuth&rdquo; and enter your Neotoma API&apos;s OAuth credentials (client ID, client
          secret, authorization URL, and token URL). The Neotoma API supports the{" "}
          <a href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization" target="_blank" rel="noopener noreferrer" className={extLink}>
            standard OAuth 2.0 flow
          </a>
          .
        </li>
        <li className="text-[15px] leading-7">
          <strong>Save and publish</strong> &mdash; the custom GPT now has full read/write access to
          your Neotoma memory graph via the API&apos;s REST endpoints.
        </li>
      </ol>

      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        Neotoma&apos;s CLI can also be used alongside ChatGPT without MCP or custom GPTs &mdash;
        store facts from ChatGPT conversations using the CLI, and they&apos;ll be available in your
        next session across any connected tool.
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
