import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { useNeotomaApiHost } from "../../hooks/useNeotomaApiHost";
import { TrackedProductLink } from "../TrackedProductNav";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const PLACEHOLDER_BASE = "https://<tunnel-host>";

function normalizeApiBase(hostInput: string): string {
  const raw = hostInput.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").split("/")[0] ?? "";
  if (!raw) return PLACEHOLDER_BASE;
  return `https://${raw}`;
}

export function ChatGptConnectRemoteMcpPage() {
  const [apiHost, setApiHost] = useNeotomaApiHost();
  const apiBase = normalizeApiBase(apiHost);

  return (
    <DetailPage title="Connect ChatGPT via remote MCP">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-chatgpt" className={extLink}>
          Neotoma with ChatGPT
        </Link>
        {" · "}
        Connect ChatGPT via remote MCP tunnel, developer mode, and Neotoma MCP server URL.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Looking for custom GPT with OpenAPI instead? See{" "}
        <Link to="/neotoma-with-chatgpt-connect-custom-gpt" className={extLink}>
          Connect via custom GPT with OpenAPI
        </Link>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup" dividerBefore={false}>
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          ChatGPT connects to MCP servers over the network via{" "}
          <a
            href="https://help.openai.com/en/articles/12584461"
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            developer mode
          </a>
          . To configure remote access:
        </p>
        <ol className="list-decimal pl-5 space-y-4 mb-2">
          <li className="text-[15px] leading-7">
            <strong>Start Neotoma with a tunnel:</strong> follow the{" "}
            <Link to="/tunnel" className={extLink}>tunnel guide</Link> to expose your local
            Neotoma instance over HTTPS. The quickest path:
            <CopyableCodeBlock code={`neotoma api start --env prod --tunnel`} className="mt-2 mb-1" />
            <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30 max-w-xl">
              <label htmlFor="neotoma-api-host-mcp" className="text-[14px] font-medium text-foreground block mb-2">
                Your Neotoma API host
              </label>
              <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="pl-3 text-[14px] text-muted-foreground select-none">https://</span>
                <input
                  id="neotoma-api-host-mcp"
                  type="text"
                  inputMode="url"
                  placeholder="your-tunnel-or-domain"
                  value={apiHost}
                  onChange={(e) => {
                    const v = e.target.value
                      .replace(/^https?:\/\//i, "")
                      .trimStart()
                      .split("/")[0]
                      ?? "";
                    setApiHost(v);
                  }}
                  className="flex-1 min-w-0 py-2 pr-3 pl-1 text-[14px] text-foreground placeholder:text-muted-foreground bg-transparent border-0 focus:outline-none focus:ring-0"
                  aria-describedby="api-host-description-mcp"
                />
              </div>
              <p id="api-host-description-mcp" className="text-[13px] text-muted-foreground mt-1.5">
                Optional. Enter host only; URLs below use <code>https://</code> + this host.
              </p>
            </div>
          </li>
          <li className="text-[15px] leading-7">
            <strong>Enable developer mode</strong> in ChatGPT, then go to{" "}
            <a
              href="https://help.openai.com/en/articles/12584461"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Settings &rarr; Apps &rarr; Advanced settings &rarr; Developer mode
            </a>
            . On Business plans only admins/owners can enable it; you can also enable it when creating an app via Workspace settings &rarr; Apps &rarr; Create.
          </li>
          <li className="text-[15px] leading-7">
            <strong>Add Neotoma as a remote MCP server</strong> in ChatGPT&apos;s developer
            mode settings, add your tunnel URL (e.g. <code>{apiBase}/mcp</code>).
            ChatGPT authenticates via OAuth; the Neotoma API supports the{" "}
            <a
              href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              MCP OAuth authorization flow
            </a>
            .
          </li>
        </ol>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <Link to="/neotoma-with-chatgpt" className={extLink}>
          Back to Neotoma with ChatGPT
        </Link>
        {" · "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.chatgptConnectRemoteMcpInstall}
          className={extLink}
        >
          Install guide
        </TrackedProductLink>
        {" · "}
        <Link to="/mcp" className={extLink}>
          MCP reference
        </Link>
      </p>
    </DetailPage>
  );
}
