import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function OpenClawConnectLocalStdioPage() {
  return (
    <DetailPage title="OpenClaw local setup (stdio)">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-openclaw" className={extLink}>
          Neotoma with OpenClaw
        </Link>
        {" · "}
        Local setup where Neotoma runs on the same machine via stdio.
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Paste this prompt into an agent tool (for example Claude Code, Codex, or Cursor) to
          install Neotoma. The agent handles npm install, initialization, and MCP configuration.
        </p>
        <CopyableCodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} className="mb-4" />
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          After installation, add Neotoma to your OpenClaw{" "}
          <a
            href="https://www.getopenclaw.ai/docs/configuration"
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            configuration file
          </a>{" "}
          and restart OpenClaw to pick up the new MCP server.
        </p>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <Link to="/neotoma-with-openclaw" className={extLink}>
          Back to Neotoma with OpenClaw
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
