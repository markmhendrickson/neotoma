import { useState } from "react";
import { Link } from "react-router-dom";
import { useNeotomaApiHost } from "../../hooks/useNeotomaApiHost";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";
import openApiActionsSpec from "../../../../openapi_actions.yaml?raw";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const PLACEHOLDER_BASE = "https://<tunnel-host>";

function normalizeApiBase(hostInput: string): string {
  const raw =
    hostInput
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .split("/")[0] ?? "";
  if (!raw) return PLACEHOLDER_BASE;
  return `https://${raw}`;
}

function OAuthDetails({ apiBase }: { apiBase: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[14px] leading-6 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          &#9654;
        </span>
        Using OAuth instead?
      </button>
      {open && (
        <div className="mt-3 pl-4 border-l-2 border-border space-y-3">
          <p className="text-[14px] leading-6 text-muted-foreground">
            If you prefer browser-based auth, open the action&apos;s <strong>Authentication</strong>{" "}
            modal, choose <strong>OAuth</strong>, and fill in:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground">
            <li>
              <strong>Authorization URL:</strong>
              <CopyableCodeBlock code={`${apiBase}/mcp/oauth/authorize`} className="mt-1 mb-1" />
            </li>
            <li>
              <strong>Token URL:</strong>
              <CopyableCodeBlock code={`${apiBase}/mcp/oauth/token`} className="mt-1 mb-1" />
            </li>
            <li>
              <strong>Scope:</strong> leave empty unless your instance requires a scope.
            </li>
            <li>
              <strong>Token exchange method:</strong> use <strong>Default (POST request)</strong>.
              Neotoma&apos;s token endpoint expects credentials in the request body; do not switch
              to &ldquo;Basic authorization header.&rdquo;
            </li>
          </ul>
          <p className="text-[14px] leading-6 text-muted-foreground">
            Authorization URL and Token URL are required when OAuth is selected; leaving them empty
            causes &ldquo;Error saving draft.&rdquo; Client ID and Client Secret can stay blank
            unless your Neotoma instance uses a fixed OAuth client. The API supports the{" "}
            <a
              href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              standard OAuth 2.0 flow
            </a>{" "}
            with dynamic client registration.
          </p>
          <p className="text-[14px] leading-6 text-muted-foreground">
            OpenAI may show a warning that OAuth can fail if redirect URLs are not allowed. Ensure
            your Neotoma server (or OAuth config) allows OpenAI&apos;s redirect URIs for Custom
            GPTs; see{" "}
            <a
              href="https://platform.openai.com/docs/actions/oauth"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              OpenAI&apos;s OAuth documentation
            </a>{" "}
            for the exact redirect URLs to allow.
          </p>
          <p className="text-[14px] leading-6 font-medium text-amber-600 dark:text-amber-500">
            Weaker security with Custom GPT OAuth: OpenAI Custom GPTs do not send PKCE
            (code_challenge). Neotoma allows this flow for Custom GPT redirect URIs so OAuth works,
            but the authorization code is not bound to a verifier. Prefer{" "}
            <strong>Bearer token</strong> if you want the strongest guarantee; use OAuth for
            per-user sign-in when you accept this tradeoff.
          </p>
        </div>
      )}
    </div>
  );
}

function PasteSpecFallback() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[14px] leading-6 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          &#9654;
        </span>
        OpenAPI import unavailable? Paste the spec directly
      </button>
      {open && (
        <div className="mt-3 pl-4 border-l-2 border-border">
          <CopyableCodeBlock code={openApiActionsSpec} className="mb-1" previewLineCount={20} />
        </div>
      )}
    </div>
  );
}

export function ChatGptConnectCustomGptPage() {
  const [apiHost, setApiHost] = useNeotomaApiHost();
  const apiBase = normalizeApiBase(apiHost);

  return (
    <DetailPage title="Connect via custom GPT with OpenAPI">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <Link to="/neotoma-with-chatgpt" className={extLink}>
          Neotoma with ChatGPT
        </Link>
        {" · "}
        Full step-by-step setup: tunnel, Actions auth, instructions, OpenAPI paste.
      </p>

      <IntegrationSection title="Setup" sectionKey="setup" dividerBefore={false}>
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          You can also integrate Neotoma as an action inside a{" "}
          <a
            href="https://help.openai.com/en/articles/20001049-apps-in-custom-gpts-for-business-accounts-beta"
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            custom GPT
          </a>
          . This approach uses the Neotoma API&apos;s OpenAPI spec directly and works with any
          ChatGPT plan that supports custom GPTs.
        </p>
        <ol className="list-decimal pl-5 space-y-4 mb-2">
          <li className="text-[15px] leading-7">
            <strong>Install a tunnel provider:</strong> Neotoma&apos;s <code>--tunnel</code>{" "}
            flag needs either{" "}
            <a
              href="https://ngrok.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              ngrok
            </a>{" "}
            or{" "}
            <a
              href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              Cloudflare Tunnel (cloudflared)
            </a>{" "}
            installed on your machine. Install one:
            <CopyableCodeBlock
              code={`# ngrok (via Homebrew)\nbrew install ngrok\nngrok config add-authtoken <YOUR_NGROK_TOKEN>\n\n# or Cloudflare Tunnel\nbrew install cloudflared`}
              className="mt-2 mb-1"
            />
            <p className="text-[14px] leading-6 text-muted-foreground mt-1">
              ngrok requires a free account and auth token from{" "}
              <a
                href="https://dashboard.ngrok.com/get-started/your-authtoken"
                target="_blank"
                rel="noopener noreferrer"
                className={extLink}
              >
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
              Cloudflare Tunnel works without an account for quick tunnels. If both providers are
              installed, Neotoma auto-detects which to use; pass{" "}
              <code>--tunnel-provider ngrok</code> or <code>--tunnel-provider cloudflare</code> to
              choose explicitly.
            </p>
          </li>
          <li className="text-[15px] leading-7">
            <strong>Start the API server with a tunnel</strong>:
            <CopyableCodeBlock
              code={`neotoma api start --env prod --tunnel`}
              className="mt-2 mb-1"
            />
            <p className="text-[14px] leading-6 text-muted-foreground mt-1">
              Add <code>--background</code> to run as a background process. Logs go to{" "}
              <code>~/.config/neotoma/logs_prod/api.log</code> and can be viewed with{" "}
              <code>neotoma api logs --env prod</code>.
            </p>
            <CopyableCodeBlock
              code={`neotoma api start --env prod --tunnel --background`}
              className="mt-2 mb-1"
            />
            <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30 max-w-xl">
              <label
                htmlFor="neotoma-api-host-custom-gpt"
                className="text-[14px] font-medium text-foreground block mb-2"
              >
                Your Neotoma API host
              </label>
              <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="pl-3 text-[14px] text-muted-foreground select-none">https://</span>
                <input
                  id="neotoma-api-host-custom-gpt"
                  type="text"
                  inputMode="url"
                  placeholder="your-tunnel-or-domain"
                  value={apiHost}
                  onChange={(e) => {
                    const v =
                      e.target.value
                        .replace(/^https?:\/\//i, "")
                        .trimStart()
                        .split("/")[0] ?? "";
                    setApiHost(v);
                  }}
                  className="flex-1 min-w-0 py-2 pr-3 pl-1 text-[14px] text-foreground placeholder:text-muted-foreground bg-transparent border-0 focus:outline-none focus:ring-0"
                  aria-describedby="api-host-description-custom-gpt"
                />
              </div>
              <p
                id="api-host-description-custom-gpt"
                className="text-[13px] text-muted-foreground mt-1.5"
              >
                Optional. Enter host only (e.g. <code>abc123.ngrok.io</code>); copyable URLs below
                use <code>https://</code> + this host.
              </p>
            </div>
          </li>
          <li className="text-[15px] leading-7">
            <strong>Create or edit a custom GPT:</strong> go to{" "}
            <a
              href="https://chatgpt.com/gpts/editor"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              chatgpt.com/gpts/editor
            </a>{" "}
            and open the <strong>Configure</strong> tab.
          </li>
          <li className="text-[15px] leading-7">
            <strong>Add a new action:</strong> under Actions, click &ldquo;Create new
            action&rdquo;, then click <strong>Import from URL</strong>. Enter your Neotoma
            API&apos;s actions spec URL (reduced spec that stays within GPT Actions operation
            limits):
            <CopyableCodeBlock code={`${apiBase}/openapi_actions.yaml`} className="mt-2 mb-1" />
            <PasteSpecFallback />
          </li>
          <li className="text-[15px] leading-7">
            <strong>Paste recommended custom GPT instructions</strong> into the GPT&apos;s{" "}
            <strong>Instructions</strong> field:
            <CopyableCodeBlock
              code={SITE_CODE_SNIPPETS.chatgptCustomGptInstructions}
              className="mt-2 mb-1"
              previewLineCount={18}
            />
          </li>
          <li className="text-[15px] leading-7">
            <strong>Set the GPT name to &ldquo;Neotoma&rdquo;</strong> in the <strong>Name</strong>{" "}
            field (optional but recommended so the assistant identifies as Neotoma).
          </li>
          <li className="text-[15px] leading-7">
            <strong>Configure authentication:</strong> set auth type to{" "}
            <strong>API Key</strong> (Bearer) in the GPT Actions UI and pass{" "}
            <code>Authorization: Bearer &lt;token&gt;</code>. Neotoma&apos;s OpenAPI spec includes{" "}
            <code>bearerAuth</code>. No OAuth client ID or secret needed.             Your API base (from the
            host field above) for reference:
            <CopyableCodeBlock code={apiBase} className="mt-2 mb-1" />
            In the GPT Action&apos;s <strong>API Key</strong> field, paste your bearer token only (e.g. from{" "}
            <code>ACTIONS_BEARER_TOKEN</code> or a key-derived token from your Neotoma server).             If you
            use <strong>OAuth</strong> instead, paste these into the Authentication modal:
            <p className="text-[14px] leading-6 mt-2 mb-1 font-medium text-foreground">Authorization URL</p>
            <CopyableCodeBlock code={`${apiBase}/mcp/oauth/authorize`} className="mt-0 mb-2" />
            <p className="text-[14px] leading-6 mb-1 font-medium text-foreground">Token URL</p>
            <CopyableCodeBlock code={`${apiBase}/mcp/oauth/token`} className="mt-0 mb-1" />
            <OAuthDetails apiBase={apiBase} />
          </li>
          <li className="text-[15px] leading-7">
            <strong>Save and publish:</strong> the custom GPT now has full read/write access
            to your Neotoma memory graph via the API&apos;s REST endpoints.
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
