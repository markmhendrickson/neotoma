import { Link } from "react-router-dom";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function CodexConnectRemoteHttpOauthPage() {
  return (
    <DetailPage title="Codex remote setup (HTTP with OAuth)">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-codex" className={extLink}>
          Neotoma with Codex
        </Link>
        {" · "}
        Remote setup for Codex sandboxes that cannot run local Neotoma.
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Codex sandboxes can connect to remote MCP servers over HTTP. Use this when Neotoma is
          not installed locally in the sandbox. Start with local install on your host machine, then
          configure remote access:
        </p>
        <ol className="list-decimal pl-5 space-y-4 mb-4">
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
            flag auto-provisions a public HTTPS URL via ngrok or Cloudflare (whichever is
            installed)
            <CopyableCodeBlock code={`neotoma api start --env prod --tunnel`} className="mt-2 mb-1" />
            <p className="text-[14px] leading-6 text-muted-foreground mt-1">
              The tunnel URL is printed to the console and written to{" "}
              <code>/tmp/ngrok-mcp-url.txt</code>. You can also use a reverse proxy or your own
              domain instead of <code>--tunnel</code>.
            </p>
          </li>
          <li className="text-[15px] leading-7">
            <strong>Configure HTTP transport with OAuth</strong> in your Codex config &mdash;
            replace the URL with your tunnel URL
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
