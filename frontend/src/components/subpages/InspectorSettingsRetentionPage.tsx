import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  MockPill,
  MockStatCard,
} from "./inspector/InspectorPreview";

export function InspectorSettingsRetentionPage() {
  return (
    <DetailPage title="Inspector, Settings · Retention">
      <p className="text-[15px] leading-7 mb-4">
        Retention controls when, if ever, Neotoma drops or tiers data into cold
        storage. The default for a fresh install is{" "}
        <strong className="text-foreground">keep everything</strong>,
        observations, source files, and timeline events are immutable by design
        and most operators rely on that for audit and provenance. The Retention
        panel exists for the cases where you do want to age data out.
      </p>

      <InspectorPreview
        path="/settings#retention"
        caption="Retention panel, per-store windows, cold-tier toggles, and projected size impact."
      >
        <div className="flex">
          <InspectorSidebarMock active="settings" />
          <div className="flex-1 min-w-0 p-4 space-y-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[12px] font-semibold text-foreground mb-2">
                Retention windows
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1">Store</th>
                    <th className="text-left font-medium py-1">Window</th>
                    <th className="text-left font-medium py-1">After window</th>
                    <th className="text-right font-medium py-1">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      s: "Observations",
                      w: "keep all",
                      a: "-",
                      sz: "84.2 MB",
                      tone: "muted" as const,
                    },
                    {
                      s: "Source files",
                      w: "180 days",
                      a: "tier → cold",
                      sz: "412.1 MB",
                      tone: "info" as const,
                    },
                    {
                      s: "Timeline events",
                      w: "keep all",
                      a: "-",
                      sz: "12.6 MB",
                      tone: "muted" as const,
                    },
                    {
                      s: "Conversation msgs",
                      w: "365 days",
                      a: "compact",
                      sz: "31.8 MB",
                      tone: "info" as const,
                    },
                    {
                      s: "Sandbox writes",
                      w: "30 days",
                      a: "expire",
                      sz: "0.4 MB",
                      tone: "warning" as const,
                    },
                  ].map((row) => (
                    <tr
                      key={row.s}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="py-1.5 text-foreground">{row.s}</td>
                      <td className="py-1.5 font-mono text-muted-foreground">
                        {row.w}
                      </td>
                      <td className="py-1.5">
                        <MockPill tone={row.tone}>{row.a}</MockPill>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {row.sz}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MockStatCard
                label="DB size"
                value="541 MB"
                hint="hot + cold"
              />
              <MockStatCard
                label="If applied"
                value="−226 MB"
                hint="next sweep"
              />
              <MockStatCard
                label="Last sweep"
                value="2d ago"
                hint="manual run"
              />
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Stores
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Observations</strong>, immutable
          row-per-write. Default is keep-all; any retention here is destructive
          and compounds, the reducer can no longer reconstruct prior states
          for affected entities.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Source files</strong>, the
          biggest store by bytes. Tier-to-cold-storage moves the bytes out of
          the SQLite blob columns to a configured cold path while preserving
          the metadata row, so observations still link to a known source even
          when the file is offline. Expire drops the bytes outright.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Timeline events</strong>,{" "}
          append-only event log. Default keep-all; expire is mostly used in CI
          / sandbox.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Conversation messages</strong>,
          chat turns. <code>compact</code> rewrites old turns to a summary
          row that preserves who-talked-to-whom-when without the full body.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Sandbox writes</strong>, only
          present on{" "}
          <Link
            to="/inspector/settings/connection"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            sandbox-environment
          </Link>{" "}
          instances. Defaults to a tight 30-day expiry so the public sandbox
          stays fresh.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Sweep semantics
      </h2>
      <ol className="list-decimal pl-6 space-y-1.5 mb-6 text-[15px] leading-7 text-muted-foreground">
        <li>
          Sweeps are <strong className="text-foreground">opt-in</strong>, a
          nightly run can be enabled per store, but you can also kick a
          one-shot sweep from this panel and review the dry-run impact first.
        </li>
        <li>
          <code>tier → cold</code> is reversible: the metadata row stays, the
          file path moves, and a re-ingest restores it.
        </li>
        <li>
          <code>expire</code> and <code>compact</code> are{" "}
          <strong className="text-foreground">not reversible</strong>, they
          drop bytes. Run them with backups in place.
        </li>
        <li>
          Affected rows are recorded as a <code>retention_sweep</code> timeline
          event so the audit trail stays intact even after the source data is
          gone. See the{" "}
          <Link
            to="/inspector/timeline"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Timeline
          </Link>{" "}
          for the running record.
        </li>
      </ol>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Recommendations
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Personal use</strong>, leave
          everything at keep-all; SQLite handles low-GB workloads comfortably.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Shared / server</strong>, tier
          source files older than 6-12 months to cold; keep observations and
          timeline events forever.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Sandbox / CI</strong>, expire
          everything aggressively; the dataset is synthetic.
        </li>
      </ul>
    </DetailPage>
  );
}
