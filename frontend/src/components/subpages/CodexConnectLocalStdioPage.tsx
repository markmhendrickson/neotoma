import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function CodexConnectLocalStdioPage() {
  return (
    <DetailPage title="Codex local setup (stdio)">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-codex" className={extLink}>
          Neotoma with Codex
        </Link>
        {" · "}
        Local setup where Neotoma is configured in Codex on the same machine.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Need a remote MCP URL for sandboxes (HTTP with OAuth)? See{" "}
        <Link to="/neotoma-with-codex-connect-remote-http-oauth" className={extLink}>
          Codex remote setup (HTTP with OAuth)
        </Link>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Paste this prompt into Codex. The agent handles npm install, initialization, and MCP
          configuration.
        </p>
        <CopyableCodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} className="mb-4" />
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          The agent writes to <code>.codex/config.toml</code> (project-level) or{" "}
          <code>~/.codex/config.toml</code> (user-level). Codex discovers the MCP server from your
          config automatically.
        </p>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <Link to="/neotoma-with-codex" className={extLink}>
          Back to Neotoma with Codex
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
