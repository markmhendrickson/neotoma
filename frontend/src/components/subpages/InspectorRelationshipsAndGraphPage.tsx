import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorRelationshipsAndGraphPage() {
  return (
    <DetailPage title="Inspector, Relationships & graph">
      <p className="text-[15px] leading-7 mb-4">
        Relationships are the typed edges that turn a flat list of entities
        into a navigable graph. Inspector exposes them as a flat list (good
        for filtering and audit) and as an interactive graph explorer (good
        for understanding context around a single entity).
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Relationship list
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The list at <code>/relationships</code> shows every typed edge,{" "}
        <code>PART_OF</code>, <code>REFERS_TO</code>, <code>EMBEDS</code>,{" "}
        <code>SUPERSEDES</code>, and any custom types, with source and
        target entity, the agent that created the edge, and the
        relationship's trust tier (it inherits the writer's). Filters: by
        relationship type, by source or target <code>entity_type</code>, and
        by agent.
      </p>

      <InspectorPreview
        path="/relationships?type=PART_OF"
        caption="Typed edges with source, target, agent, and tier. Each edge is one row, immutable like observations."
      >
        <div className="flex">
          <InspectorSidebarMock active="relationships" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Relationships"
              subtitle="6,907 edges across 12 types"
              right={
                <>
                  <MockPill tone="info">PART_OF (4,210)</MockPill>
                  <MockPill tone="muted">REFERS_TO (1,884)</MockPill>
                  <MockPill tone="muted">EMBEDS (612)</MockPill>
                </>
              }
            />
            <div className="px-4 py-3">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Source</th>
                    <th className="py-1.5 pr-3 font-medium">Type</th>
                    <th className="py-1.5 pr-3 font-medium">Target</th>
                    <th className="py-1.5 pr-3 font-medium">Agent</th>
                    <th className="py-1.5 pr-3 font-medium text-right">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      s: "msg · turn 4 (user)",
                      t: "PART_OF",
                      tg: "conversation · Q2 review",
                      a: "claude-code",
                      tier: "info",
                      d: "12:30",
                    },
                    {
                      s: "msg · turn 4 (user)",
                      t: "REFERS_TO",
                      tg: "transaction · Vercel",
                      a: "claude-code",
                      tier: "info",
                      d: "12:30",
                    },
                    {
                      s: "receipt · vercel-2026-04",
                      t: "EMBEDS",
                      tg: "file_asset · vercel-2026-04.pdf",
                      a: "claude-code",
                      tier: "info",
                      d: "11:08",
                    },
                    {
                      s: "task · follow up Sarah",
                      t: "REFERS_TO",
                      tg: "contact · Sarah Park",
                      a: "cursor-agent",
                      tier: "success",
                      d: "10:55",
                    },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-1.5 pr-3 text-foreground truncate max-w-[160px]">
                        {row.s}
                      </td>
                      <td className="py-1.5 pr-3">
                        <MockPill
                          tone={
                            row.t === "PART_OF"
                              ? "info"
                              : row.t === "EMBEDS"
                                ? "violet"
                                : "muted"
                          }
                        >
                          {row.t}
                        </MockPill>
                      </td>
                      <td className="py-1.5 pr-3 text-foreground truncate max-w-[180px]">
                        {row.tg}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-muted-foreground truncate max-w-[110px]">
                        {row.a}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {row.d}
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
        Graph explorer
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Graph Explorer (<code>/graph</code>) renders a 1- or 2-hop
        neighborhood around a chosen entity, using <code>@xyflow/react</code>{" "}
        for layout. Nodes are coloured by <code>entity_type</code>; edges by
        relationship type. Useful examples: confirming that a refund linked
        to the right charge, that a calendar event linked to the correct
        attendees, or that an embedded file linked back to the right
        container row.
      </p>

      <InspectorPreview
        path="/graph?center=ent_4ad…&hops=2"
        caption="Force-directed neighborhood around a single entity. Click a node to recentre; right-click an edge to inspect the underlying relationship row."
      >
        <div className="flex">
          <InspectorSidebarMock active="graph" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Graph Explorer"
              subtitle="Center: Subscription · Vercel · 2 hops · 14 nodes"
              right={
                <>
                  <MockPill tone="info">PART_OF</MockPill>
                  <MockPill tone="violet">REFERS_TO</MockPill>
                  <MockPill tone="success">EMBEDS</MockPill>
                </>
              }
            />
            <div className="relative h-[260px] bg-muted/20 overflow-hidden">
              <svg
                viewBox="0 0 600 260"
                className="absolute inset-0 w-full h-full"
              >
                {/* edges */}
                <g
                  stroke="currentColor"
                  strokeWidth="1.2"
                  className="text-muted-foreground/60"
                >
                  <line x1="300" y1="130" x2="160" y2="60" />
                  <line x1="300" y1="130" x2="160" y2="200" />
                  <line x1="300" y1="130" x2="450" y2="60" />
                  <line x1="300" y1="130" x2="450" y2="200" />
                  <line
                    x1="160"
                    y1="60"
                    x2="60"
                    y2="40"
                    className="text-violet-400"
                    stroke="currentColor"
                  />
                  <line
                    x1="450"
                    y1="60"
                    x2="540"
                    y2="40"
                    className="text-emerald-400"
                    stroke="currentColor"
                  />
                  <line
                    x1="450"
                    y1="200"
                    x2="540"
                    y2="220"
                    className="text-violet-400"
                    stroke="currentColor"
                  />
                </g>
                {/* nodes */}
                <g>
                  <Node x={300} y={130} label="transaction" tone="violet" />
                  <Node x={160} y={60} label="receipt" tone="info" />
                  <Node x={160} y={200} label="agent_message" tone="muted" />
                  <Node x={450} y={60} label="contact · Vercel" tone="success" />
                  <Node x={450} y={200} label="task" tone="warning" />
                  <Node x={60} y={40} label="file_asset" tone="violet" small />
                  <Node x={540} y={40} label="email_message" tone="info" small />
                  <Node x={540} y={220} label="reminder" tone="muted" small />
                </g>
              </svg>
            </div>
            <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground flex items-center gap-3">
              <span>Drag to pan · scroll to zoom</span>
              <span className="ml-auto">14 nodes · 19 edges</span>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Edge inspection
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Right-clicking an edge opens its underlying relationship row:
        type, source, target, creator agent, trust tier, and any
        relationship-level metadata. Like observations, relationships are
        immutable; "removing" an edge is modeled with a separate{" "}
        <code>SUPERSEDES</code> link rather than a destructive delete.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Common workflows
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Audit a turn</strong>, center
          the graph on an <code>agent_message</code> to see every entity it
          created or referenced, with PART_OF and REFERS_TO edges.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Find orphans</strong>, filter
          relationships by source or target type and look for entities with
          zero incoming edges to a conversation.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Trace a file</strong>, center
          on a <code>file_asset</code> and walk EMBEDS edges back to every
          container row that referenced it.
        </li>
      </ul>

      <p className="text-[15px] leading-7 mb-4">
        For the underlying API and edge semantics, see{" "}
        <Link
          to="/api"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          REST API
        </Link>
        .
      </p>
    </DetailPage>
  );
}

function Node({
  x,
  y,
  label,
  tone,
  small = false,
}: {
  x: number;
  y: number;
  label: string;
  tone: "info" | "violet" | "success" | "warning" | "muted";
  small?: boolean;
}) {
  const fill: Record<string, string> = {
    info: "fill-sky-500/20 stroke-sky-500",
    violet: "fill-violet-500/20 stroke-violet-500",
    success: "fill-emerald-500/20 stroke-emerald-500",
    warning: "fill-amber-500/20 stroke-amber-500",
    muted: "fill-muted-foreground/15 stroke-muted-foreground/60",
  };
  const r = small ? 14 : 22;
  return (
    <g>
      <circle cx={x} cy={y} r={r} className={fill[tone]} strokeWidth="1.5" />
      <text
        x={x}
        y={y + r + 12}
        textAnchor="middle"
        className="fill-foreground text-[10px] font-mono"
      >
        {label}
      </text>
    </g>
  );
}
