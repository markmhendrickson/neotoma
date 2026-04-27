import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorTimelinePage() {
  return (
    <DetailPage title="Inspector, Timeline & interpretations">
      <p className="text-[15px] leading-7 mb-4">
        The Timeline view turns Neotoma's per-row history into a single
        chronological stream. Anything that produced a write, a new
        observation, a correction, a new edge, a merge, an interpretation,
        shows up here, scoped to the operator's <code>user_id</code>. It's
        the fastest way to answer "what just happened?" without writing a
        query.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Timeline stream
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Each event row carries a timestamp, an event kind (<code>store</code>,{" "}
        <code>correct</code>, <code>link</code>, <code>merge</code>,{" "}
        <code>interpret</code>), the affected entity, the agent that did
        it, and the trust tier. Events are clickable and deep-link to the
        underlying observation, relationship, or entity row.
      </p>

      <InspectorPreview
        path="/timeline?range=24h"
        caption="Reverse-chronological event stream with quick filters by kind, entity type, agent, and trust tier."
      >
        <div className="flex">
          <InspectorSidebarMock active="timeline" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Timeline"
              subtitle="Last 24h · 1,021 events"
              right={
                <>
                  <MockPill tone="info">store (612)</MockPill>
                  <MockPill tone="violet">correct (118)</MockPill>
                  <MockPill tone="success">link (231)</MockPill>
                  <MockPill tone="warning">merge (4)</MockPill>
                </>
              }
            />
            <div className="px-4 py-3 space-y-1.5 text-[12px]">
              {[
                {
                  t: "12:41",
                  k: "store",
                  e: "transaction · Subscription · Vercel",
                  a: "claude-code",
                  tier: "info",
                },
                {
                  t: "12:38",
                  k: "correct",
                  e: "transaction · category → subscription",
                  a: "operator",
                  tier: "success",
                },
                {
                  t: "12:30",
                  k: "store",
                  e: "agent_message · turn 4 (user)",
                  a: "claude-code",
                  tier: "info",
                },
                {
                  t: "12:30",
                  k: "link",
                  e: "PART_OF · turn 4 → conversation Q2 review",
                  a: "claude-code",
                  tier: "info",
                },
                {
                  t: "12:21",
                  k: "interpret",
                  e: "interpretation · spend pattern · April",
                  a: "ingest-pipeline",
                  tier: "info",
                },
                {
                  t: "11:08",
                  k: "store",
                  e: "receipt · vercel-2026-04",
                  a: "claude-code",
                  tier: "info",
                },
                {
                  t: "11:08",
                  k: "link",
                  e: "EMBEDS · receipt → file_asset (pdf)",
                  a: "claude-code",
                  tier: "info",
                },
                {
                  t: "10:55",
                  k: "merge",
                  e: "contact · Sarah Park ← Sarah P.",
                  a: "operator",
                  tier: "success",
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5"
                >
                  <span className="w-12 tabular-nums text-muted-foreground">
                    {row.t}
                  </span>
                  <MockPill
                    tone={
                      row.k === "store"
                        ? "info"
                        : row.k === "correct"
                          ? "violet"
                          : row.k === "link"
                            ? "success"
                            : row.k === "merge"
                              ? "warning"
                              : "muted"
                    }
                  >
                    {row.k}
                  </MockPill>
                  <span className="flex-1 truncate text-foreground">
                    {row.e}
                  </span>
                  <span className="font-mono text-muted-foreground truncate max-w-[120px]">
                    {row.a}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Range and ranges
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The range chip switches between rolling windows (last hour, 24h, 7d,
        30d) and absolute ranges. The same query is reachable
        programmatically via <code>list_timeline_events</code> on the API.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Filters
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Event kind</strong>, store,
          correct, link, merge, interpret.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Entity type</strong>, same
          enum as the entity list filter.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Agent</strong>, by signed
          identity (AAuth thumbprint), <code>clientInfo.name</code>, or
          free-form <code>agent_label</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Trust tier</strong>,
          hardware, software, unverified, anonymous.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Interpretations
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Interpretations are derived entities, synthesised summaries
        (legal_research, competitive_analysis, market_research, report,
        analysis-style notes) produced by an agent on top of raw
        observations. Inspector exposes them as a separate section
        (<code>/interpretations</code>) with their inputs, conclusions,
        caveats, and the source observations they cite.
      </p>

      <InspectorPreview
        path="/interpretations"
        caption="Interpretations are synthesised entities; each links to the source observations and to the entity it interprets."
      >
        <div className="flex">
          <InspectorSidebarMock active="interpretations" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Interpretations"
              subtitle="48 derived analyses · last 30 days"
              right={<MockPill tone="info">research_date desc</MockPill>}
            />
            <div className="px-4 py-3 space-y-2 text-[12px]">
              {[
                {
                  title: "Q2 spend pattern (subscriptions)",
                  type: "report",
                  cites: 124,
                  by: "claude-code",
                  date: "Apr 24",
                },
                {
                  title: "Vercel vs Netlify cost comparison",
                  type: "competitive_analysis",
                  cites: 38,
                  by: "cursor-agent",
                  date: "Apr 22",
                },
                {
                  title: "Sarah Park, relationship summary",
                  type: "analysis",
                  cites: 17,
                  by: "claude-code",
                  date: "Apr 21",
                },
                {
                  title: "Email triage backlog (week 16)",
                  type: "report",
                  cites: 92,
                  by: "ingest-pipeline",
                  date: "Apr 20",
                },
              ].map((row) => (
                <div
                  key={row.title}
                  className="rounded-md border border-border bg-card p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium truncate">
                      {row.title}
                    </span>
                    <MockPill tone="violet">{row.type}</MockPill>
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {row.date}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground text-[11px] flex items-center gap-2">
                    <span>cites {row.cites} observations</span>
                    <span>·</span>
                    <span className="font-mono">{row.by}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Replay
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Selecting a range and pressing <em>Replay</em> walks the events in
        order, with the current snapshot visible alongside. This is useful
        when investigating "why did this entity look like X at 11:02 but Y
        at 11:08?", the timeline + reducer transparency together answer
        that without a database query. See{" "}
        <Link
          to="/inspector/observations-and-sources"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Observations & sources
        </Link>{" "}
        for the underlying immutable history that powers replay.
      </p>
    </DetailPage>
  );
}
