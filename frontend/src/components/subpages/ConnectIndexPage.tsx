import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { CodexIcon } from "../icons/CodexIcon";
import { CursorIcon } from "../icons/CursorIcon";
import { OpenClawIcon } from "../icons/OpenClawIcon";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

type ConnectEntry = {
  label: string;
  desc: string;
  /** Preferred remote/HTTP connect doc for this harness. */
  remote: string;
  /** Stdio / local connect doc (for users self-hosting). */
  local?: string;
  Icon: typeof SiClaude;
};

const CONNECT_ENTRIES: ConnectEntry[] = [
  {
    label: "Claude Code",
    desc: "CLI agent - register with `claude mcp add --transport http`.",
    remote: "/neotoma-with-claude-code",
    Icon: SiClaude,
  },
  {
    label: "Claude Desktop",
    desc: "Desktop app - add a stdio server or remote MCP endpoint.",
    remote: "/neotoma-with-claude-connect-remote-mcp",
    local: "/neotoma-with-claude-connect-desktop",
    Icon: SiClaude,
  },
  {
    label: "claude.ai (remote MCP)",
    desc: "Web Claude with remote MCP support.",
    remote: "/neotoma-with-claude-connect-remote-mcp",
    Icon: SiClaude,
  },
  {
    label: "ChatGPT (remote MCP)",
    desc: "ChatGPT developer mode - add Neotoma as a remote MCP server.",
    remote: "/neotoma-with-chatgpt-connect-remote-mcp",
    local: "/neotoma-with-chatgpt-connect-custom-gpt",
    Icon: SiOpenai,
  },
  {
    label: "Codex",
    desc: "OpenAI Codex - add an `[mcp_servers.neotoma]` block to ~/.codex/config.toml.",
    remote: "/neotoma-with-codex-connect-remote-http-oauth",
    local: "/neotoma-with-codex-connect-local-stdio",
    Icon: CodexIcon,
  },
  {
    label: "Cursor",
    desc: "Cursor IDE - add a `mcpServers` entry to .cursor/mcp.json.",
    remote: "/neotoma-with-cursor",
    Icon: CursorIcon,
  },
  {
    label: "OpenClaw",
    desc: "OpenClaw agents - install via clawhub or add manual MCP config.",
    remote: "/neotoma-with-openclaw-connect-remote-http",
    local: "/neotoma-with-openclaw-connect-local-stdio",
    Icon: OpenClawIcon,
  },
];

export function ConnectIndexPage() {
  return (
    <DetailPage title="Connect a remote Neotoma">
      <p className="text-[15px] leading-7 text-foreground mb-3">
        Every hosted Neotoma instance - the{" "}
        <Link to="/sandbox" className={extLink}>public sandbox</Link>, a personal tunnel, or a
        self-hosted deployment - exposes an MCP endpoint at <code>/mcp</code>. This page points you
        at the per-harness doc for connecting to it over HTTP without installing Neotoma locally.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        Installing Neotoma on the same machine as your agent? Use the{" "}
        <Link to="/install" className={extLink}>install guide</Link> instead - stdio is faster and
        needs no tunnel. See <Link to="/hosted" className={extLink}>Hosted Neotoma</Link> for the
        flavor comparison.
      </p>

      <IntegrationSection title="Pick your harness" sectionKey="harnesses" dividerBefore={false}>
        <ul className="list-none pl-0 m-0 space-y-2">
          {CONNECT_ENTRIES.map((entry) => (
            <li key={entry.label} className="rounded-lg border border-border bg-muted/20 p-3 flex items-start gap-3">
              <entry.Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <Link to={entry.remote} className="text-[15px] font-medium text-foreground underline underline-offset-2 hover:no-underline">
                    {entry.label}
                  </Link>
                  <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
                </div>
                <p className="text-[14px] leading-6 text-muted-foreground mt-0.5 mb-1">
                  {entry.desc}
                </p>
                <p className="text-[13px] leading-6 text-muted-foreground">
                  <Link to={entry.remote} className={extLink}>
                    Remote MCP setup
                  </Link>
                  {entry.local ? (
                    <>
                      {" · "}
                      <Link to={entry.local} className={extLink}>
                        Local / stdio setup
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </IntegrationSection>

      <IntegrationSection title="What you need from the host" sectionKey="host-requirements">
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          Each per-harness doc above expects you to know two things about the Neotoma you want to
          talk to:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-3">
          <li>
            <strong className="text-foreground">MCP URL.</strong> e.g.{" "}
            <code>https://sandbox.neotoma.io/mcp</code> for the sandbox, or{" "}
            <code>https://your-tunnel.example.com/mcp</code> for a personal tunnel.
          </li>
          <li>
            <strong className="text-foreground">Auth posture.</strong> The sandbox is
            unauthenticated. Personal tunnels and self-hosted instances typically require OAuth or a
            bearer token for writes; discovery endpoints (<code>/server-info</code>,{" "}
            <code>/.well-known/*</code>) stay public.
          </li>
        </ul>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Tip: the root page of any hosted Neotoma (e.g.{" "}
          <a
            href="https://sandbox.neotoma.io"
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            sandbox.neotoma.io
          </a>
          ) renders harness-specific connect snippets with its own URL prefilled. The per-harness
          docs linked above mirror that content with placeholders you substitute manually.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Related" sectionKey="related">
        <p className="text-[14px] leading-6 text-muted-foreground">
          <Link to="/install" className={extLink}>Install Neotoma locally</Link>
          {" · "}
          <Link to="/hosted" className={extLink}>Hosted flavors overview</Link>
          {" · "}
          <Link to="/sandbox" className={extLink}>Public sandbox</Link>
          {" · "}
          <Link to="/mcp" className={extLink}>MCP reference</Link>
        </p>
      </IntegrationSection>
    </DetailPage>
  );
}
