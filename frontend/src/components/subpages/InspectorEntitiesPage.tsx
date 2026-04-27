import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorEntitiesPage() {
  return (
    <DetailPage title="Inspector, Entities">
      <p className="text-[15px] leading-7 mb-4">
        The Entities section is where most operator work happens. It exposes
        the typed list of every entity Neotoma has resolved, the live
        snapshot of each one, the immutable observations that produced that
        snapshot, and the controls to make corrections without erasing
        history.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Entity list
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The entity list (<code>/entities</code>) is a virtual table backed by{" "}
        <code>retrieve_entities</code>. It supports free-text search on{" "}
        <code>canonical_name</code> and snapshot fields, type-scoped
        filtering, identity-basis filtering (so you can audit how each row
        was resolved, schema rule, schema lookup, heuristic name, etc.), and
        offset pagination tied to the URL.
      </p>

      <InspectorPreview
        path="/entities?type=transaction"
        caption="Filterable entity list with type chip, identity-basis filter, and a column for the resolved trust tier."
      >
        <div className="flex">
          <InspectorSidebarMock active="entities" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Entities"
              subtitle="3,104 transactions · sorted by last_observation_at"
              right={
                <>
                  <span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                    Search…
                  </span>
                  <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground font-mono">
                    type: transaction ×
                  </span>
                </>
              }
            />
            <div className="px-4 pt-3 pb-2 flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">identity_basis</span>
              <MockPill tone="info">schema_rule</MockPill>
              <MockPill tone="muted">heuristic_name</MockPill>
              <span className="ml-auto text-muted-foreground">25 / page</span>
            </div>
            <div className="px-4 pb-4">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Name</th>
                    <th className="py-1.5 pr-3 font-medium">Type</th>
                    <th className="py-1.5 pr-3 font-medium">Last writer</th>
                    <th className="py-1.5 pr-3 font-medium">Tier</th>
                    <th className="py-1.5 pr-3 font-medium text-right">
                      Last seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      n: "Subscription · Vercel",
                      w: "claude-code@1.4",
                      tier: "software",
                      seen: "12:41",
                    },
                    {
                      n: "Domain renewal · namecheap",
                      w: "cursor-agent@build-918",
                      tier: "hardware",
                      seen: "11:08",
                    },
                    {
                      n: "Coffee · Blue Bottle",
                      w: "ingest-pipeline@myco",
                      tier: "software",
                      seen: "10:55",
                    },
                    {
                      n: "Refund · Amazon",
                      w: "manual-import",
                      tier: "anonymous",
                      seen: "09:14",
                    },
                  ].map((row) => (
                    <tr
                      key={row.n}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-1.5 pr-3 text-foreground truncate max-w-[180px]">
                        {row.n}
                      </td>
                      <td className="py-1.5 pr-3">
                        <MockPill tone="violet">transaction</MockPill>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-muted-foreground truncate max-w-[140px]">
                        {row.w}
                      </td>
                      <td className="py-1.5 pr-3">
                        <MockPill
                          tone={
                            row.tier === "hardware"
                              ? "success"
                              : row.tier === "software"
                                ? "info"
                                : "muted"
                          }
                        >
                          {row.tier}
                        </MockPill>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {row.seen}
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
        Entity detail, Snapshot tab
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Clicking a row opens the entity detail page. The Snapshot tab shows
        the resolved snapshot, the same JSON {" "}
        <code>retrieve_entity_by_identifier</code> returns, with per-field{" "}
        <em>provenance</em>: which observation produced that value, when, and
        from which agent / trust tier. Hovering a field surfaces the source
        row's identifier and a deep link to the source content endpoint.
      </p>

      <InspectorPreview
        path="/entities/ent_4ad…/snapshot"
        caption="Per-field provenance: each field shows the observation that 'won', the agent, and the trust tier."
      >
        <div className="flex">
          <InspectorSidebarMock active="entities" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Subscription · Vercel"
              subtitle="transaction · ent_4ad9f1c2"
              right={
                <>
                  <MockPill tone="info">software</MockPill>
                  <span className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground">
                    Edit
                  </span>
                </>
              }
            />
            <div className="px-4 pt-3 flex gap-3 text-[12px] border-b border-border">
              {[
                "Snapshot",
                "Observations (8)",
                "Relationships (3)",
                "Graph",
                "Edit",
              ].map((tab, i) => (
                <span
                  key={tab}
                  className={
                    i === 0
                      ? "border-b-2 border-foreground pb-2 -mb-px text-foreground font-medium"
                      : "pb-2 text-muted-foreground"
                  }
                >
                  {tab}
                </span>
              ))}
            </div>
            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
              {[
                {
                  k: "amount",
                  v: "20.00 USD",
                  agent: "claude-code@1.4",
                  tier: "software",
                },
                {
                  k: "merchant",
                  v: "Vercel Inc.",
                  agent: "claude-code@1.4",
                  tier: "software",
                },
                {
                  k: "billing_period",
                  v: "2026-04",
                  agent: "ingest-pipeline@myco",
                  tier: "software",
                },
                {
                  k: "category",
                  v: "subscription",
                  agent: "operator (you)",
                  tier: "software",
                },
              ].map((f) => (
                <div
                  key={f.k}
                  className="rounded-md border border-border bg-card p-2"
                >
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {f.k}
                  </div>
                  <div className="text-foreground">{f.v}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono">{f.agent}</span>
                    <span>·</span>
                    <MockPill tone={f.tier === "hardware" ? "success" : "info"}>
                      {f.tier}
                    </MockPill>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Observations tab
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Observations tab is the immutable history. Every store /{" "}
        <code>correct</code> / merge that touched this entity appears here,
        oldest first, including overwritten or losing observations.
        Observations are <em>never</em> deleted; corrections layer on top via
        a higher <code>source_priority</code> or <code>observation_source</code>{" "}
        tie-break (sensor &lt; workflow_state &lt; llm_summary &lt; human &lt;
        import). The reducer column shows which observation currently "wins"
        for each field.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Relationships tab
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Lists incoming and outgoing typed edges (<code>PART_OF</code>,{" "}
        <code>REFERS_TO</code>, <code>EMBEDS</code>, <code>SUPERSEDES</code>,
        and any custom types). Each row links to the related entity and shows
        the agent that created the edge.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Graph tab
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Renders the 1- or 2-hop graph neighborhood centred on this entity
        using <code>@xyflow/react</code>. Nodes are coloured by{" "}
        <code>entity_type</code>; edges by relationship type. Useful for
        confirming that a refund linked correctly to the underlying
        transaction, or that a meeting invite linked to the right
        attendee contacts.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Edit tab, multi-field corrections
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Edit tab batches multiple field corrections into a single{" "}
        <code>correct</code> call. Pre-fill it with the current snapshot,
        change one or more fields, and the Inspector emits a new observation
        per changed field, with{" "}
        <code>observation_source: "human"</code> so the reducer prioritises
        them appropriately. Nothing is overwritten, see the{" "}
        <Link
          to="/inspector/observations-and-sources"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Observations & sources
        </Link>{" "}
        page for how the reducer applies these.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Duplicate detection & merge
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        From the entity detail menu, "Find potential duplicates" calls{" "}
        <code>list_potential_duplicates(entity_type)</code> and displays
        candidate pairs with score and matched fields. The detector is
        read-only and never auto-merges; merging is an explicit action that
        invokes <code>merge_entities(from, to)</code> after operator
        confirmation.
      </p>
    </DetailPage>
  );
}
