import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorObservationsAndSourcesPage() {
  return (
    <DetailPage title="Inspector, Observations & sources">
      <p className="text-[15px] leading-7 mb-4">
        Snapshots are derived; observations and sources are the truth.
        Inspector exposes both as first-class browsable surfaces so
        operators can audit exactly which writes produced the current
        snapshot, and which raw artifact (file, API response, signed
        request) backed each write.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Observations list
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Observations are immutable. Every <code>store</code>,{" "}
        <code>correct</code>, or merge produces one or more rows here, and{" "}
        <em>none of them are ever mutated or deleted</em>. The list at{" "}
        <code>/observations</code> shows them in reverse chronological order
        with filters for entity, field, agent, trust tier, and{" "}
        <code>observation_source</code> (sensor, workflow_state,
        llm_summary, human, import).
      </p>

      <InspectorPreview
        path="/observations?entity=ent_4ad…"
        caption="The full immutable history for one entity. The 'reducer' column shows which row currently wins for each field."
      >
        <div className="flex">
          <InspectorSidebarMock active="observations" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Observations"
              subtitle="Subscription · Vercel · 8 rows"
              right={
                <>
                  <MockPill tone="muted">obs_source: any</MockPill>
                  <span className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                    Group by field
                  </span>
                </>
              }
            />
            <div className="px-4 py-3">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">When</th>
                    <th className="py-1.5 pr-3 font-medium">Field</th>
                    <th className="py-1.5 pr-3 font-medium">Value</th>
                    <th className="py-1.5 pr-3 font-medium">Agent</th>
                    <th className="py-1.5 pr-3 font-medium">Source</th>
                    <th className="py-1.5 pr-3 font-medium text-right">
                      Reducer
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      t: "12:41",
                      f: "amount",
                      v: "20.00",
                      a: "claude-code",
                      s: "llm_summary",
                      win: true,
                    },
                    {
                      t: "12:38",
                      f: "category",
                      v: "subscription",
                      a: "operator",
                      s: "human",
                      win: true,
                    },
                    {
                      t: "12:30",
                      f: "merchant",
                      v: "Vercel",
                      a: "claude-code",
                      s: "llm_summary",
                      win: false,
                    },
                    {
                      t: "12:30",
                      f: "merchant",
                      v: "Vercel Inc.",
                      a: "claude-code",
                      s: "llm_summary",
                      win: true,
                    },
                    {
                      t: "11:08",
                      f: "amount",
                      v: "$20",
                      a: "ingest-pipeline",
                      s: "import",
                      win: false,
                    },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                        {row.t}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-foreground">
                        {row.f}
                      </td>
                      <td className="py-1.5 pr-3 text-foreground truncate max-w-[100px]">
                        {row.v}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-muted-foreground truncate max-w-[110px]">
                        {row.a}
                      </td>
                      <td className="py-1.5 pr-3">
                        <MockPill
                          tone={
                            row.s === "human"
                              ? "success"
                              : row.s === "import"
                                ? "warning"
                                : "info"
                          }
                        >
                          {row.s}
                        </MockPill>
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {row.win ? (
                          <MockPill tone="success">winner</MockPill>
                        ) : (
                          <MockPill tone="muted">superseded</MockPill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Reducer transparency
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Each observation displays which row currently "wins" for its field.
        The reducer order is documented and visible: higher{" "}
        <code>source_priority</code> wins, with{" "}
        <code>observation_source</code> as the tie-break (sensor &lt;
        workflow_state &lt; llm_summary &lt; human &lt; import). Inspector
        shows this in the row metadata so operators don't have to guess why
        a "human" correction did or did not override an automated row.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Source registry
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Every observation that came from an external artifact carries a{" "}
        <code>source_id</code>. The Sources page (<code>/sources</code>)
        lists those artifacts: PDFs, CSVs, JSON dumps, screenshots, signed
        API responses, even raw email bodies. Each row links to{" "}
        <code>GET /sources/:id/content</code> so you can open the
        original file inline (browser-viewable types) or download it.
      </p>

      <InspectorPreview
        path="/sources?type=email"
        caption="Each source row preserves the original artifact, its mime type, the agent that ingested it, and downstream observations."
      >
        <div className="flex">
          <InspectorSidebarMock active="sources" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Sources"
              subtitle="2,154 artifacts · 312 unique"
              right={
                <>
                  <MockPill tone="info">mime: application/pdf</MockPill>
                  <MockPill tone="muted">size &lt; 1MB</MockPill>
                </>
              }
            />
            <div className="px-4 py-3 space-y-2">
              {[
                {
                  name: "vercel-2026-04.pdf",
                  mime: "application/pdf",
                  agent: "claude-code",
                  obs: 12,
                },
                {
                  name: "wise-transfer-58812.json",
                  mime: "application/json",
                  agent: "ingest-pipeline",
                  obs: 6,
                },
                {
                  name: "screenshot-2026-04-22.png",
                  mime: "image/png",
                  agent: "cursor-agent",
                  obs: 3,
                },
                {
                  name: "calendar-week-17.ics",
                  mime: "text/calendar",
                  agent: "ingest-pipeline",
                  obs: 14,
                },
              ].map((row) => (
                <div
                  key={row.name}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-[12px]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground truncate font-mono">
                      {row.name}
                    </div>
                    <div className="text-muted-foreground text-[11px] truncate">
                      ingested by{" "}
                      <span className="font-mono">{row.agent}</span> ·{" "}
                      {row.obs} observations downstream
                    </div>
                  </div>
                  <MockPill tone="muted">{row.mime}</MockPill>
                  <span className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground">
                    Open
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Source detail
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Source detail pages show the artifact's metadata (mime type, size,
        ingestion agent, idempotency key, when it was first observed) and
        the full list of observations that cite it. The combined-store
        contract guarantees each <code>file_path</code> /{" "}
        <code>file_content</code> persisted via <code>store_structured</code>{" "}
        becomes one row here, making "what raw artifact backs this fact?" a
        one-click question.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Provenance chains
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        From any observation row, you can trace forward (what entity it
        contributed to, which fields it currently or once won) or backward
        (which source artifact, which agent, which trust tier). This is the
        same chain the per-field provenance hover on{" "}
        <Link
          to="/inspector/entities"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Entities
        </Link>{" "}
        surfaces, the difference is direction: that view starts from the
        snapshot, this one starts from the writes themselves.
      </p>
    </DetailPage>
  );
}
