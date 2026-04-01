import { Link } from "react-router-dom";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function OpenClawConnectRemoteHttpPage() {
  return (
    <DetailPage title="OpenClaw remote setup (HTTP)">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-openclaw" className={extLink}>
          Neotoma with OpenClaw
        </Link>
        {" · "}
        Remote setup for cloud or multi-machine deployments.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        OpenClaw and Neotoma on the same machine? See{" "}
        <Link to="/neotoma-with-openclaw-connect-local-stdio" className={extLink}>
          OpenClaw local setup (stdio)
        </Link>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          If OpenClaw runs on a different machine or in the cloud, start with local install on your
          host machine, then configure remote access:
        </p>
        <ol className="list-decimal pl-5 space-y-4 mb-4">
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
            <strong>Point OpenClaw at the remote endpoint:</strong> use the tunnel URL for
            the Neotoma API&apos;s OpenAPI spec (<code>https://&lt;tunnel-host&gt;/openapi.yaml</code>)
            or the remote MCP endpoint (<code>https://&lt;tunnel-host&gt;/mcp</code>). The Neotoma
            API supports the{" "}
            <a
              href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              MCP OAuth authorization flow
            </a>{" "}
            for authenticated access.
          </li>
        </ol>
        <p className="text-[14px] leading-6 text-muted-foreground mb-4">
          If MCP is not yet available in your OpenClaw environment, use the Neotoma CLI directly
          from the same machine as a fallback:
        </p>
        <CopyableCodeBlock
          code={`neotoma store --json='[{"entity_type":"task","title":"Follow up","status":"open"}]'
neotoma entities list --type task`}
          className="mb-2"
        />
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
