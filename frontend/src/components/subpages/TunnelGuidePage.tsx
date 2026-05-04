import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

function CodeSnippet({ children }: { children: string }) {
  return (
    <pre className="rounded-md border border-border bg-muted/30 px-4 py-3 text-[13px] leading-6 overflow-x-auto mb-4">
      <code>{children}</code>
    </pre>
  );
}

export function TunnelGuidePage() {
  return (
    <DetailPage title="Expose tunnel">
      <p className="text-[15px] leading-7 mb-4">
        Remote MCP clients (ChatGPT, claude.ai, mobile apps, cloud agents) cannot
        launch a local stdio process on your machine. To reach a local Neotoma instance they need an
        HTTPS URL. An HTTPS tunnel forwards MCP traffic from the public internet to your local API
        server while your data stays on your machine.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        Neotoma ships with built-in tunnel support via <code>neotoma api start --tunnel</code>.
        You can also use any standard reverse-tunnel tool pointed at the local API port.
      </p>

      <IntegrationSection title="Built-in tunnel" sectionKey="built-in" dividerBefore={false}>
        <CodeSnippet>{`neotoma api start --env prod --tunnel`}</CodeSnippet>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Starts the local API server and opens a tunnel. The public URL is printed to stdout once the
          tunnel is established. Pass <code>--tunnel-provider &lt;name&gt;</code> to select a
          specific provider (default is auto-detected).
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Auth is required for writes; unauthenticated callers can only read public discovery
          endpoints (<code>/server-info</code>, <code>/.well-known/*</code>).
        </p>
      </IntegrationSection>

      <IntegrationSection title="Provider setup" sectionKey="providers">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Neotoma auto-detects the tunnel provider. Set{" "}
          <code>--tunnel-provider ngrok</code> or{" "}
          <code>--tunnel-provider cloudflare</code> to override. The local port is{" "}
          <code>3080</code> (prod) or <code>3180</code> (dev) by default.
        </p>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-2">ngrok</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-2">
              Requires a free{" "}
              <a href="https://dashboard.ngrok.com/signup" target="_blank" rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline">
                ngrok account
              </a>. After installing, authenticate once:
            </p>
            <CodeSnippet>{`ngrok config add-authtoken YOUR_AUTHTOKEN`}</CodeSnippet>
            <p className="text-[14px] leading-6 text-muted-foreground mb-2">
              For a stable URL across restarts, set <code>HOST_URL</code> in{" "}
              <code>.env</code> to your ngrok reserved/custom domain (e.g.{" "}
              <code>https://your-subdomain.ngrok-free.app</code>). Otherwise a random URL is
              generated each run.
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground">
              Manual alternative: <code>ngrok http 3080</code>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-2">Cloudflare Tunnel</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-2">
              Install{" "}
              <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                target="_blank" rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline">
                cloudflared
              </a>{" "}
              (<code>brew install cloudflare/cloudflare/cloudflared</code>).
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground mb-2">
              <strong>Quick tunnel</strong> (ephemeral URL, no config):{" "}
              <code>cloudflared tunnel --url http://localhost:3080</code>
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground mb-2">
              <strong>Named tunnel</strong> (stable URL): set <code>HOST_URL</code> in{" "}
              <code>.env</code> to your public hostname. Ensure{" "}
              <code>~/.cloudflared/config.yml</code> declares the tunnel and routes ingress to{" "}
              <code>http://localhost:3080</code>.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-2">Tailscale Funnel</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-2">
              Requires{" "}
              <a href="https://tailscale.com/download" target="_blank" rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline">
                Tailscale
              </a>{" "}
              with Funnel enabled on your tailnet. No Neotoma-side config needed.
            </p>
            <CodeSnippet>{`tailscale funnel 3080`}</CodeSnippet>
          </div>
        </div>
        <p className="text-[14px] leading-6 text-muted-foreground mt-3">
          Once the tunnel is up, use the public URL as your MCP server URL in ChatGPT, claude.ai, or
          any remote client. The tunnel forwards all traffic: MCP at <code>/mcp</code>,
          Inspector at <code>/app</code>, REST API at standard endpoints.
        </p>
      </IntegrationSection>

      <IntegrationSection title="When to use a tunnel" sectionKey="when">
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground">
          <li>
            <Link to="/neotoma-with-chatgpt-connect-remote-mcp" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">ChatGPT</Link>
            {" and "}
            <Link to="/neotoma-with-claude-connect-remote-mcp" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">claude.ai</Link>
            {", "}web-based clients that connect to MCP servers over HTTPS.
          </li>
          <li>
            <span className="font-medium text-foreground">Mobile and tablet</span>: agents
            running on devices that cannot reach localhost on your development machine.
          </li>
          <li>
            <Link to="/neotoma-with-codex-connect-remote-http-oauth" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">Codex</Link>
            {" and "}
            <Link to="/neotoma-with-openclaw-connect-remote-http" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">OpenClaw</Link>
            {", "}cloud agents and hosted services that need to write observations or read
            state from your Neotoma instance.
          </li>
          <li>
            <span className="font-medium text-foreground">Multi-machine</span>: when you
            run agents on multiple machines and want a single source of truth. See{" "}
            <Link to="/hosted" className="text-foreground underline underline-offset-2 hover:no-underline">hosted flavors</Link>
            {" "}for persistent deployment options.
          </li>
        </ul>
        <p className="text-[14px] leading-6 text-muted-foreground mt-3">
          See{" "}
          <Link to="/connect" className="text-foreground underline underline-offset-2 hover:no-underline">connect</Link>
          {" "}for the full list of client-specific setup guides, and{" "}
          <Link to="/aauth" className="text-foreground underline underline-offset-2 hover:no-underline">AAuth</Link>
          {" "}for agent identity verification over tunneled connections.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Remote auth" sectionKey="auth">
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Writes through the tunnel require authentication. Configure at least one of these in{" "}
          <code>.env</code> before starting the tunnel:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-3">
          <li>
            <code>NEOTOMA_BEARER_TOKEN</code>: quick start; remote clients pass this as a
            Bearer token.
          </li>
          <li>
            <code>NEOTOMA_KEY_FILE_PATH</code> or <code>NEOTOMA_MNEMONIC</code>:
            key-authenticated MCP OAuth (agents sign requests with{" "}
            <Link to="/aauth" className="text-foreground underline underline-offset-2 hover:no-underline">
              AAuth
            </Link>).
          </li>
        </ul>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Without any of these, the tunnel setup warns you and remote writes are rejected.
          Unauthenticated callers can still read discovery endpoints (<code>/server-info</code>,{" "}
          <code>/.well-known/*</code>).
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          For additional control, use tunnel-provider features (IP allowlists, password protection)
          or restrict the tunnel to your Tailscale network.
        </p>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground mt-8">
        See{" "}
        <Link to="/hosted" className="text-foreground underline underline-offset-2 hover:no-underline">
          hosted flavors
        </Link>{" "}
        for an overview of deployment options,{" "}
        <Link to="/connect" className="text-foreground underline underline-offset-2 hover:no-underline">
          connect
        </Link>{" "}
        for client-specific setup, and{" "}
        <Link to="/aauth" className="text-foreground underline underline-offset-2 hover:no-underline">
          AAuth
        </Link>{" "}
        for agent identity over tunneled connections.
      </p>
    </DetailPage>
  );
}
