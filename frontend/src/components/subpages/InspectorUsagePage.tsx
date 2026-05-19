import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockStatCard,
} from "./inspector/InspectorPreview";

export function InspectorUsagePage() {
  return (
    <DetailPage title="Inspector, Usage">
      <p className="text-[15px] leading-7 mb-4">
        The Usage view surfaces aggregate statistics about your own activity
        inside the Neotoma instance. It gives you a quick read on how much
        state you have, where it came from, and whether your entity types are
        covered by registered schemas.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        All figures are computed from local data only. No external calls are
        made. The numbers reflect the authenticated user's own records and
        update each time you load the page.
      </p>

      <InspectorPreview
        path="/usage"
        caption="Usage view: summary stats, entities by type, observations by source, and schema coverage."
      >
        <div className="flex">
          <InspectorSidebarMock active="usage" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Usage"
              subtitle="Your local aggregate statistics"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4">
              <MockStatCard label="Total Entities" value="4,821" hint="7 types" />
              <MockStatCard
                label="Total Observations"
                value="23,140"
              />
              <MockStatCard label="Recent Activity" value="38" hint="last 7 days" />
              <MockStatCard label="Schema Coverage" value="85%" hint="6 of 7 types" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 pb-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[12px] font-medium text-foreground mb-2">
                  Entities by type
                </div>
                <ul className="space-y-1.5 text-[12px]">
                  {[
                    ["contact", "1,842"],
                    ["transaction", "1,204"],
                    ["note", "887"],
                    ["task", "501"],
                    ["project", "387"],
                  ].map(([type, count]) => (
                    <li key={type} className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-primary/70 shrink-0" />
                      <span className="text-foreground font-mono">{type}</span>
                      <span className="ml-auto text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[12px] font-medium text-foreground mb-2">
                  Observations by source
                </div>
                <ul className="space-y-1.5 text-[12px]">
                  {[
                    ["llm_summary", "12,840"],
                    ["human", "6,091"],
                    ["import", "2,940"],
                    ["sync", "1,269"],
                  ].map(([source, count]) => (
                    <li key={source} className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-secondary-foreground/50 shrink-0" />
                      <span className="text-foreground font-mono">{source}</span>
                      <span className="ml-auto text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-lg font-semibold mt-8 mb-3">What the view shows</h2>
      <ul className="list-none pl-0 space-y-2 mb-6 text-[15px] leading-7 text-muted-foreground">
        <li>
          <strong className="text-foreground">Entities by type</strong>:count
          of active (non-merged) entities per <code>entity_type</code>, sorted
          by count descending, up to 15 types shown in the bar chart.
        </li>
        <li>
          <strong className="text-foreground">Observations by source</strong>:
          count of observations grouped by <code>observation_source</code>{" "}
          (<code>llm_summary</code>, <code>human</code>, <code>import</code>,{" "}
          <code>sync</code>, and others). Null sources appear as{" "}
          <code>unclassified</code>.
        </li>
        <li>
          <strong className="text-foreground">Recent activity</strong>:number
          of entities created in the last 7 days and last 30 days.
        </li>
        <li>
          <strong className="text-foreground">Schema coverage</strong>:how
          many of your distinct entity types have a registered schema in the
          schema registry, expressed as a percentage and a fraction.
        </li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-3">API</h2>
      <p className="text-[15px] leading-7 mb-4 text-muted-foreground">
        The view calls <code>GET /usage</code>, which returns a{" "}
        <code>UsageStats</code> object. All queries are scoped to the
        authenticated user and run against the local database only.
      </p>

      <p className="text-[15px] leading-7 text-muted-foreground">
        For related aggregate data such as relationship counts and total
        timeline events, see the{" "}
        <Link
          to="/inspector/dashboard"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Dashboard
        </Link>{" "}
        view (<code>GET /stats</code>).
      </p>
    </DetailPage>
  );
}
