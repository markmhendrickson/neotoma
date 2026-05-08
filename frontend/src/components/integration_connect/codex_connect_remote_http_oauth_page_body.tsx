import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { CopyableCodeBlock } from "@/components/CopyableCodeBlock";
import { TrackedProductLink } from "@/components/TrackedProductNav";
import { IntegrationSection } from "@/components/IntegrationSection";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function CodexConnectRemoteHttpOauthPageBody() {
  return (
    <>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <MdxI18nLink to="/neotoma-with-codex" className={extLink}>
          Neotoma with Codex
        </MdxI18nLink>
        {" · "}
        Remote setup for Codex sandboxes that cannot run local Neotoma.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Running Codex on the same machine as Neotoma? See{" "}
        <MdxI18nLink to="/neotoma-with-codex-connect-local-stdio" className={extLink}>
          Codex local setup (stdio)
        </MdxI18nLink>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Codex sandboxes can connect to remote MCP servers over HTTP. Use this when Neotoma is
          not installed locally in the sandbox. Start with local install on your host machine, then
          configure remote access:
        </p>
        <ol className="list-decimal pl-5 space-y-4 mb-4">
          <li className="text-[15px] leading-7">
            <strong>Start Neotoma with a tunnel:</strong> follow the{" "}
            <MdxI18nLink to="/tunnel" className={extLink}>
              tunnel guide
            </MdxI18nLink>{" "}
            to expose your local Neotoma instance over HTTPS. The quickest path:
            <CopyableCodeBlock code={`neotoma api start --env prod --tunnel`} className="mt-2 mb-1" />
          </li>
          <li className="text-[15px] leading-7">
            <strong>Configure HTTP transport with OAuth</strong> in your Codex config. Replace the
            URL with your tunnel URL
            <CopyableCodeBlock
              code={`# .codex/config.toml
[mcp_servers.neotoma]
type = "http"
url = "https://<tunnel-host>/mcp"`}
              className="mt-2 mb-1"
            />
            <p className="text-[14px] leading-6 text-muted-foreground mt-2">
              Codex handles the{" "}
              <a
                href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
                MCP OAuth authorization flow
              </a>{" "}
              automatically.
            </p>
          </li>
        </ol>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          When MCP is not available in the sandbox, agents can use the <code>neotoma</code> CLI
          directly as a fallback.
        </p>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <MdxI18nLink to="/neotoma-with-codex" className={extLink}>
          Back to Neotoma with Codex
        </MdxI18nLink>
        {" · "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.codexConnectRemoteOauthInstall}
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
