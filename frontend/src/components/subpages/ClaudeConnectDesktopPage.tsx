import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function ClaudeConnectDesktopPage() {
  return (
    <DetailPage title="Claude Desktop local setup">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-claude" className={extLink}>
          Neotoma with Claude
        </Link>
        {" · "}
        Local setup for Claude Desktop (stdio transport).
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Looking for claude.ai (remote MCP) instead? See{" "}
        <Link to="/neotoma-with-claude-connect-remote-mcp" className={extLink}>
          claude.ai remote MCP setup
        </Link>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Paste this prompt into another agent tool (for example Claude Code or Cursor) to install
          Neotoma and configure it for Claude Desktop. The agent handles npm install,
          initialization, and MCP configuration.
        </p>
        <CopyableCodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} className="mb-4" />
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Claude Desktop uses local stdio. Neotoma runs on the same machine. No API server
          or remote access is required. The agent writes to{" "}
          <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> and you
          restart Claude Desktop to pick up the new MCP server.
        </p>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <Link to="/neotoma-with-claude" className={extLink}>
          Back to Neotoma with Claude
        </Link>
        {" · "}
        <Link to="/install" className={extLink}>
          Install guide
        </Link>
        {" · "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>
      </p>
    </DetailPage>
  );
}
