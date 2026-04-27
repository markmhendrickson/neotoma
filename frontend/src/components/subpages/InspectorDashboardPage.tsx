import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockStatCard,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorDashboardPage() {
  return (
    <DetailPage title="Inspector, Dashboard & health">
      <p className="text-[15px] leading-7 mb-4">
        The Inspector dashboard is the first thing you land on. Its job is to
        let an operator answer four questions at a glance: <em>is the
        instance healthy</em>, <em>how much state is in it</em>, <em>what's
        been happening recently</em>, and <em>who is writing to it</em>.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Each panel is read-only and reflects live data from the Neotoma API,
        the same numbers <code>GET /stats</code> reports for programmatic
        consumers.
      </p>

      <InspectorPreview
        path="/"
        caption="Top stat row, entity-type histogram, recent timeline events, and a system health card."
      >
        <div className="flex">
          <InspectorSidebarMock active="dashboard" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Dashboard"
              subtitle="Live state of this Neotoma instance"
              right={
                <>
                  <MockPill tone="success">API healthy</MockPill>
                  <MockPill tone="muted">v0.12.0</MockPill>
                </>
              }
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4">
              <MockStatCard label="Entities" value="12,481" hint="+128 today" />
              <MockStatCard
                label="Observations"
                value="84,302"
                hint="+1,021 today"
              />
              <MockStatCard label="Relationships" value="6,907" />
              <MockStatCard label="Sources" value="2,154" hint="312 unique" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 pb-4">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[12px] font-medium text-foreground">
                    Entities by type
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    top 6 of 47
                  </div>
                </div>
                <ul className="space-y-1.5 text-[12px]">
                  {[
                    { t: "agent_message", v: 0.98, n: 4910 },
                    { t: "transaction", v: 0.62, n: 3104 },
                    { t: "contact", v: 0.45, n: 2231 },
                    { t: "task", v: 0.31, n: 1556 },
                    { t: "event", v: 0.18, n: 902 },
                    { t: "note", v: 0.12, n: 612 },
                  ].map((row) => (
                    <li key={row.t} className="flex items-center gap-2">
                      <span className="w-28 truncate text-muted-foreground font-mono">
                        {row.t}
                      </span>
                      <span className="flex-1 h-1.5 rounded bg-muted/60 overflow-hidden">
                        <span
                          className="block h-full bg-foreground/70"
                          style={{ width: `${row.v * 100}%` }}
                        />
                      </span>
                      <span className="w-12 text-right tabular-nums text-foreground">
                        {row.n.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[12px] font-medium text-foreground mb-2">
                  Attribution coverage
                </div>
                <ul className="space-y-1.5 text-[12px]">
                  <li className="flex items-center gap-2">
                    <MockPill tone="success">hardware</MockPill>
                    <span className="flex-1 h-1.5 rounded bg-muted/60 overflow-hidden">
                      <span className="block h-full bg-emerald-500/80 w-[18%]" />
                    </span>
                    <span className="w-10 text-right tabular-nums text-foreground">
                      18%
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <MockPill tone="info">software</MockPill>
                    <span className="flex-1 h-1.5 rounded bg-muted/60 overflow-hidden">
                      <span className="block h-full bg-sky-500/80 w-[44%]" />
                    </span>
                    <span className="w-10 text-right tabular-nums text-foreground">
                      44%
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <MockPill tone="violet">unverified</MockPill>
                    <span className="flex-1 h-1.5 rounded bg-muted/60 overflow-hidden">
                      <span className="block h-full bg-violet-500/80 w-[31%]" />
                    </span>
                    <span className="w-10 text-right tabular-nums text-foreground">
                      31%
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <MockPill tone="muted">anonymous</MockPill>
                    <span className="flex-1 h-1.5 rounded bg-muted/60 overflow-hidden">
                      <span className="block h-full bg-muted-foreground/60 w-[7%]" />
                    </span>
                    <span className="w-10 text-right tabular-nums text-foreground">
                      7%
                    </span>
                  </li>
                </ul>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Of the last 50,000 observations.
                </div>
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Stat row
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The top row counts the four primitive Neotoma rows: entities,
        observations, relationships, and sources. Numbers come straight from{" "}
        <code>GET /stats</code> and reflect the operator's <code>user_id</code>{" "}
        scope. Trend hints (<em>"+128 today"</em>) are derived from the same
        endpoint's daily aggregates and update without polling spam.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Entities by type
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The histogram is the <em>cardinality</em> of each registered{" "}
        <code>entity_type</code>, not its schema field width. This is the
        same number the{" "}
        <Link
          to="/api"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          REST API
        </Link>{" "}
        returns under <code>entities_by_type</code> on <code>/stats</code>,
        and is the canonical source for "how many of each type" questions
        (don't substitute <code>list_entity_types.field_count</code>, which
        measures schema width).
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Attribution coverage
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The attribution panel surfaces what fraction of recent writes were
        signed at each AAuth tier, <code>hardware</code>,{" "}
        <code>software</code>, <code>unverified_client</code>, and{" "}
        <code>anonymous</code>. A healthy production instance trends toward
        <code> hardware</code>/<code>software</code>; a high{" "}
        <code>anonymous</code> share usually means clients are sending
        generic <code>clientInfo.name</code> values that get normalised away.
        See{" "}
        <Link
          to="/aauth"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          AAuth
        </Link>{" "}
        for the tier definitions.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Recent activity
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Below the panels, a recent timeline strip lists the latest store /
        correct / link / merge events with their entity, agent, and trust
        tier. Click-through opens the corresponding entity detail; right-click
        copies the row's <code>entity_id</code>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        System health
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        A health card pings <code>/healthz</code> and <code>/storage/health</code>{" "}
        and reports SQLite integrity, write-ahead log depth, and last
        successful backup. SQLite corruption surfaces here first, followed
        by the operator-targeted recovery prompt described in{" "}
        <Link
          to="/troubleshooting"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Troubleshooting
        </Link>
        .
      </p>
    </DetailPage>
  );
}
