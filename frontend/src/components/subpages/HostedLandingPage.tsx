import { Link } from "react-router-dom";
import { Server, Globe, Home, Sparkles } from "lucide-react";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

type HostedFlavor = {
  id: string;
  title: string;
  status: "live" | "personal" | "planned";
  Icon: typeof Server;
  when: string;
  details: string[];
  cta?: { label: string; to?: string; href?: string };
};

const FLAVORS: HostedFlavor[] = [
  {
    id: "sandbox",
    title: "Public sandbox",
    status: "live",
    Icon: Globe,
    when: "Evaluate Neotoma without installing. Share reproducible examples.",
    details: [
      "Hosted by the Neotoma team at sandbox.neotoma.io.",
      "Data is public and resets every Sunday 00:00 UTC.",
      "Destructive admin endpoints disabled.",
      "Inspector UI is public.",
    ],
    cta: { label: "Sandbox details", to: "/sandbox" },
  },
  {
    id: "personal-tunnel",
    title: "Personal tunnel",
    status: "personal",
    Icon: Home,
    when:
      "You run Neotoma on your own machine and expose it to remote agents (ChatGPT, claude.ai, phone) via an HTTPS tunnel.",
    details: [
      "Data stays on your machine; the tunnel forwards MCP traffic.",
      "Auth is required for writes - unauthenticated callers only see public discovery endpoints.",
      "Examples: ngrok, Cloudflare tunnel, Tailscale funnel, Fly.io app pointed at the local DB.",
      "The root URL of your tunnel renders the same mode-aware landing page shipped with Neotoma, with connect snippets prefilled to your host.",
    ],
    cta: { label: "Install guide", to: "/install" },
  },
  {
    id: "managed-prod",
    title: "Managed production",
    status: "planned",
    Icon: Sparkles,
    when: "Planned - you want a team-grade Neotoma with SLAs and private storage.",
    details: [
      "Not yet offered. The self-hosted path covers most production needs today.",
      "Talk to us if you need a managed deployment; it informs priorities.",
    ],
    cta: { label: "Talk to us", to: "/meet" },
  },
];

const STATUS_STYLES: Record<HostedFlavor["status"], string> = {
  live: "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  personal: "border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-400",
  planned: "border-muted-foreground/25 bg-muted/30 text-muted-foreground",
};

const STATUS_LABEL: Record<HostedFlavor["status"], string> = {
  live: "Live",
  personal: "Self-hosted",
  planned: "Planned",
};

export function HostedLandingPage() {
  return (
    <DetailPage title="Hosted Neotoma">
      <p className="text-[15px] leading-7 text-foreground mb-3">
        Neotoma runs the same code in four places: your laptop, a tunnel pointed at your laptop, a
        public demo instance, and - someday - a managed production service. This page explains which
        hosted flavor you just landed on, or which one you want next.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        Every hosted Neotoma exposes the same MCP endpoint at <code>/mcp</code>, the same Inspector
        at <code>/app</code>, and the same discovery endpoints (<code>/server-info</code>,{" "}
        <code>/.well-known/*</code>). The mode-aware root page at <code>/</code> adapts its copy and
        connect snippets to the deployment.
      </p>

      <IntegrationSection title="Hosted flavors" sectionKey="flavors" dividerBefore={false}>
        <div className="space-y-5">
          {FLAVORS.map((flavor) => (
            <div
              key={flavor.id}
              className="rounded-lg border border-border bg-muted/20 p-4"
            >
              <div className="flex items-start gap-3 mb-2">
                <flavor.Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-[16px] font-medium tracking-[-0.01em] text-foreground">
                      {flavor.title}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[flavor.status]}`}
                    >
                      {STATUS_LABEL[flavor.status]}
                    </span>
                  </div>
                  <p className="text-[14px] leading-6 text-muted-foreground mb-3">
                    <strong className="text-foreground">When to use:</strong> {flavor.when}
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-3">
                    {flavor.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                  {flavor.cta ? (
                    <p className="text-[14px] leading-6">
                      {flavor.cta.to ? (
                        <Link to={flavor.cta.to} className={extLink}>
                          {flavor.cta.label} →
                        </Link>
                      ) : (
                        <a
                          href={flavor.cta.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={extLink}
                        >
                          {flavor.cta.label} →
                        </a>
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </IntegrationSection>

      <IntegrationSection title="Local first" sectionKey="local-first">
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          Most Neotoma users run locally. Your data stays on your machine, every agent on that
          machine shares one dataset, and you can expose it to remote agents later via a tunnel
          without migrating storage.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          <Link to="/install" className={extLink}>Install guide →</Link>
          {" · "}
          <Link to="/connect" className={extLink}>Connect a remote instance →</Link>
          {" · "}
          <Link to="/sandbox" className={extLink}>Try the sandbox →</Link>
        </p>
      </IntegrationSection>
    </DetailPage>
  );
}
