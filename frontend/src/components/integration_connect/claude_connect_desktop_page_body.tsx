import { PRODUCT_NAV_SOURCES, sendFunnelInstallPromptCopy } from "@/utils/analytics";
import { TrackedProductLink } from "@/components/TrackedProductNav";
import { SITE_CODE_SNIPPETS } from "@/site/site_data";
import { CopyableCodeBlock } from "@/components/CopyableCodeBlock";
import { IntegrationSection } from "@/components/IntegrationSection";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function ClaudeConnectDesktopPageBody() {
  return (
    <>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <MdxI18nLink to="/neotoma-with-claude" className={extLink}>
          Neotoma with Claude
        </MdxI18nLink>
        {" · "}
        Local setup for Claude Desktop (stdio transport).
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Looking for claude.ai (remote MCP) instead? See{" "}
        <MdxI18nLink to="/neotoma-with-claude-connect-remote-mcp" className={extLink}>
          claude.ai remote MCP setup
        </MdxI18nLink>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Paste this prompt into another agent tool (for example Claude Code or Cursor) to install
          Neotoma and configure it for Claude Desktop. The agent handles npm install,
          initialization, and MCP configuration.
        </p>
        <CopyableCodeBlock
          code={SITE_CODE_SNIPPETS.agentInstallPrompt}
          className="mb-4"
          onAfterCopy={() => sendFunnelInstallPromptCopy("doc_claude_connect_desktop")}
        />
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Claude Desktop uses local stdio. Neotoma runs on the same machine. No API server
          or remote access is required. The agent writes to{" "}
          <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> and you
          restart Claude Desktop to pick up the new MCP server.
        </p>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <MdxI18nLink to="/neotoma-with-claude" className={extLink}>
          Back to Neotoma with Claude
        </MdxI18nLink>
        {" · "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.claudeConnectDesktopFooterInstall}
          className={extLink}
        >
          Install guide
        </TrackedProductLink>
        {" · "}
        <MdxI18nLink to="/mcp" className={extLink}>
          MCP reference
        </MdxI18nLink>
      </p>
    </>
  );
}
