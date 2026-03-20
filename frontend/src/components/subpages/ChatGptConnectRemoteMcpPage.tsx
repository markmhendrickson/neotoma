import { Link } from "react-router-dom";
import { useNeotomaApiHost } from "../../hooks/useNeotomaApiHost";
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
            <strong>Install a tunnel provider</strong> &mdash; Neotoma&apos;s <code>--tunnel</code>{" "}
            flag needs either{" "}
            <a href="https://ngrok.com/download" target="_blank" rel="noopener noreferrer" className={extLink}>
              ngrok
            </a>{" "}
            or{" "}
            <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer" className={extLink}>
              Cloudflare Tunnel (cloudflared)
            </a>{" "}
            installed on your machine. Install one:
            <CopyableCodeBlock
              code={`# ngrok (via Homebrew)\nbrew install ngrok\nngrok config add-authtoken <YOUR_NGROK_TOKEN>\n\n# — or Cloudflare Tunnel —\nbrew install cloudflared`}
              className="mt-2 mb-1"
            />
            <p className="text-[14px] leading-6 text-muted-foreground mt-1">
              ngrok requires a free account and auth token from{" "}
              <a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" rel="noopener noreferrer" className={extLink}>
                dashboard.ngrok.com
              </a>
              . You can set the token as an environment variable instead of running{" "}
              <code>ngrok config</code>:
            </p>
            <CopyableCodeBlock
              code={`# In your shell profile or .env\nexport NGROK_AUTHTOKEN=<YOUR_NGROK_TOKEN>`}
              className="mt-2 mb-1"
            />
            <p className="text-[14px] leading-6 text-muted-foreground mt-1">
              Cloudflare Tunnel works without an account for quick tunnels. If both
              providers are installed, Neotoma auto-detects which to use; pass{" "}
              <code>--tunnel-provider ngrok</code> or <code>--tunnel-provider cloudflare</code>{" "}
              to choose explicitly.
            </p>
          </li>
          <li className="text-[15px] leading-7">
            <strong>Start the API server with a tunnel</strong> &mdash; the <code>--tunnel</code>{" "}
            flag auto-provisions a public HTTPS URL via ngrok or Cloudflare (whichever is installed)
            <CopyableCodeBlock
              code={`neotoma api start --env prod --tunnel`}
              className="mt-2 mb-1"
            />
            <p className="text-[14px] leading-6 text-muted-foreground mt-1">
              The tunnel URL is printed to the console and written to{" "}
              <code>/tmp/ngrok-mcp-url.txt</code>. You can also use a reverse proxy or your own
              domain instead of <code>--tunnel</code>.
            </p>
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
            <strong>Enable developer mode</strong> in ChatGPT &mdash; go to{" "}
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
            <strong>Add Neotoma as a remote MCP server</strong> &mdash; in ChatGPT&apos;s developer
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
