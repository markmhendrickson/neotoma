import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { TrackedProductLink } from "../TrackedProductNav";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function ClaudeConnectRemoteMcpPage() {
  return (
    <DetailPage title="claude.ai remote MCP setup">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-claude" className={extLink}>
          Neotoma with Claude
        </Link>
        {" · "}
        Remote setup for connecting Neotoma to claude.ai.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Looking for Claude Desktop (local stdio) instead? See{" "}
        <Link to="/neotoma-with-claude-connect-desktop" className={extLink}>
          Claude Desktop local setup
        </Link>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          claude.ai connects to MCP servers over the network. Start with local install, then
          configure remote access:
        </p>
        <ol className="list-decimal pl-5 space-y-4 mb-2">
          <li className="text-[15px] leading-7">
            <strong>Install a tunnel provider:</strong> Neotoma&apos;s <code>--tunnel</code>{" "}
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
              code={`# ngrok (via Homebrew)\nbrew install ngrok\nngrok config add-authtoken <YOUR_NGROK_TOKEN>\n\n# or Cloudflare Tunnel\nbrew install cloudflared`}
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
            <strong>Start the API server with a tunnel:</strong> the <code>--tunnel</code>{" "}
            flag auto-provisions a public HTTPS URL via ngrok or Cloudflare (whichever is installed)
            <CopyableCodeBlock code={`neotoma api start --env prod --tunnel`} className="mt-2 mb-1" />
            <p className="text-[14px] leading-6 text-muted-foreground mt-1">
              The tunnel URL is printed to the console and written to{" "}
              <code>/tmp/ngrok-mcp-url.txt</code>. You can also use a reverse proxy or your own
              domain instead of <code>--tunnel</code>.
            </p>
          </li>
          <li className="text-[15px] leading-7">
            <strong>Connect in claude.ai:</strong> go to Settings &rarr; MCP Servers and add
            your tunnel URL (for example <code>https://&lt;tunnel-host&gt;/mcp</code>). Claude
            authenticates via OAuth; the Neotoma API supports the{" "}
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
        <div className="mt-4 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[14px] leading-6">
          <strong className="text-foreground">Use the tunnel URL, not a custom domain.</strong>{" "}
          When you run with <code>--tunnel</code> (Cloudflare or ngrok), set the MCP server URL in
          Claude to the <em>exact</em> tunnel URL printed at startup (e.g.{" "}
          <code>https://&lt;tunnel-host&gt;/mcp</code>). Do not use a custom domain that points
          elsewhere (e.g. your own HTTPS host). Traffic must hit the same process that is serving
          the tunnel; otherwise Connect will fail and you will not see requests in{" "}
          <code>neotoma api logs</code>.
        </div>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <Link to="/neotoma-with-claude" className={extLink}>
          Back to Neotoma with Claude
        </Link>
        {" · "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.claudeConnectRemoteMcpInstall}
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
