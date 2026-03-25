import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function CrossPlatformPage() {
  return (
    <DetailPage title="Cross-platform">
      <p className="text-[15px] leading-7 mb-4">
        Neotoma provides one memory system across AI tools. Claude, ChatGPT, Cursor, Codex,
        Claude Code, and OpenClaw all access the same state graph through Model Context Protocol
        (MCP). Facts stored by one agent are immediately available to every other connected agent:
        no sync step, no export/import, no duplicate data.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        MCP is the integration layer. Each AI tool connects to Neotoma's MCP server and uses the
        same store, retrieve, and relationship operations. The CLI and REST API expose the same
        OpenAPI-backed contract, so humans and apps have identical access. There is one source of
        truth regardless of the interface.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Neotoma works alongside native memory features (ChatGPT's memory, Claude's project
        knowledge, Cursor's context). It does not replace them or require disabling them. When you
        stop using Neotoma, there is nothing to uninstall from the AI tool itself; you simply
        disconnect the MCP server.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        No platform lock-in. Your memory graph is a local SQLite database. You own the file, you
        control what connects to it, and you can export or migrate at any time. Switching AI tools
        does not mean starting over. The same structured memory is available to the next tool you
        connect.
      </p>
      <p className="text-[15px] leading-7">
        See{" "}
        <Link to="/mcp" className="text-foreground underline hover:text-foreground">
          MCP reference
        </Link>{" "}
        for the full action catalog,{" "}
        <Link to="/cli" className="text-foreground underline hover:text-foreground">
          CLI reference
        </Link>{" "}
        for terminal commands, and{" "}
        <Link to="/api" className="text-foreground underline hover:text-foreground">
          API reference
        </Link>{" "}
        for REST endpoints. For per-tool setup guides, see{" "}
        <Link to="/neotoma-with-cursor" className="text-foreground underline hover:text-foreground">
          Cursor
        </Link>,{" "}
        <Link to="/neotoma-with-claude" className="text-foreground underline hover:text-foreground">
          Claude
        </Link>,{" "}
        <Link to="/neotoma-with-claude-code" className="text-foreground underline hover:text-foreground">
          Claude Code
        </Link>,{" "}
        <Link to="/neotoma-with-chatgpt" className="text-foreground underline hover:text-foreground">
          ChatGPT
        </Link>, and{" "}
        <Link to="/neotoma-with-codex" className="text-foreground underline hover:text-foreground">
          Codex
        </Link>.
      </p>
    </DetailPage>
  );
}
