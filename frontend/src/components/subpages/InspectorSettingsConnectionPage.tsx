import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorSettingsConnectionPage() {
  return (
    <DetailPage title="Inspector, Settings · Connection">
      <p className="text-[15px] leading-7 mb-4">
        The Connection panel tells Inspector which Neotoma instance to read
        from. It's the first place to look when the UI is empty, returning
        zeros, or showing the wrong environment.
      </p>

      <InspectorPreview
        path="/settings#connection"
        caption="Connection panel, API base URL, environment, DB path, and a one-click health probe."
      >
        <div className="flex">
          <InspectorSidebarMock active="settings" />
          <div className="flex-1 min-w-0 p-4 space-y-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[12px] font-semibold text-foreground mb-2">
                API connection
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-muted-foreground mb-1">Base URL</div>
                  <div className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-foreground">
                    http://127.0.0.1:3080
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Environment</div>
                  <div className="flex gap-1">
                    <MockPill tone="info">prod</MockPill>
                    <MockPill tone="muted">dev</MockPill>
                    <MockPill tone="muted">sandbox</MockPill>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">DB path</div>
                  <div className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-foreground truncate">
                    ~/.neotoma/neotoma.sqlite
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Server</div>
                  <div className="flex items-center gap-2">
                    <MockPill tone="success">healthy</MockPill>
                    <span className="text-muted-foreground">
                      v0.12.0 · pid 48132
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-[12px]">
              <div className="font-semibold text-foreground mb-2">
                Last probe
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-md border border-border/60 px-2 py-1.5">
                  <div className="text-muted-foreground">/health</div>
                  <div className="text-foreground">200 · 4ms</div>
                </div>
                <div className="rounded-md border border-border/60 px-2 py-1.5">
                  <div className="text-muted-foreground">/session</div>
                  <div className="text-foreground">tier · software</div>
                </div>
                <div className="rounded-md border border-border/60 px-2 py-1.5">
                  <div className="text-muted-foreground">/stats</div>
                  <div className="text-foreground">12.4k entities</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Fields
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">API base URL</strong>, the HTTP
          endpoint serving Neotoma. Defaults to <code>http://127.0.0.1:3080</code>{" "}
          for prod and <code>http://127.0.0.1:3180</code> for dev. Override
          when running against a remote tunnel or a non-default port.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Environment</strong>,{" "}
          <code>prod</code>, <code>dev</code>, or <code>sandbox</code>. Used as
          a label across the UI (timeline filters, agent badges) so you don't
          mistake one instance for another. The value matches the{" "}
          <code>--env</code> flag the CLI uses for server commands.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">DB path</strong>, the SQLite
          file backing this instance. Read-only here; surface it so operators
          can copy it into a backup or the{" "}
          <Link
            to="/cli"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            CLI's
          </Link>{" "}
          <code>storage recover-db</code> flow.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Server</strong>, version, pid,
          and uptime reported by <code>/health</code>. Mismatch here is the
          first sign you're hitting a stale process.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Health probe
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Saving Connection changes triggers three probes against the new base
        URL:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5 mb-6 text-[15px] leading-7 text-muted-foreground">
        <li>
          <code>GET /health</code>, verifies the server is up and responding.
        </li>
        <li>
          <code>GET /session</code>, fetches the resolved attribution tier and
          the policy decision (so the{" "}
          <Link
            to="/inspector/settings/attribution-policy"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Attribution policy
          </Link>{" "}
          panel can render an accurate "current state").
        </li>
        <li>
          <code>GET /stats</code>, pulls entity counts so the dashboard and{" "}
          <Link
            to="/inspector/entities"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Entities
          </Link>{" "}
          page light up immediately.
        </li>
      </ol>
      <p className="text-[15px] leading-7 mb-4">
        If any probe fails the panel surfaces the exact HTTP status, body, and
        latency, and refuses to apply the change so you don't lose the working
        connection mid-debug.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Multiple instances
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Inspector remembers recent base URLs and lets you switch between them
        without a reload. This pairs with the CLI's connect-only startup,
        agents and humans share the same set of running ports, and the
        Inspector tabs the active one.
      </p>
    </DetailPage>
  );
}
