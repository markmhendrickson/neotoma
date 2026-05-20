import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockStatCard,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorReferencePage() {
  return (
    <DetailPage title="Inspector">
      <p className="text-[15px] leading-7 mb-4">
        The Inspector is the visual operator console for any Neotoma instance.
        It runs alongside the Neotoma server (locally at{" "}
        <code>http://localhost:3080/inspector</code>, or on a hosted Neotoma
        deployment) and is the fastest way to see exactly what your agents have
        written, why, and on whose authority.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Where the CLI and MCP surface let agents <em>write</em> to Neotoma, the
        Inspector lets <em>you</em> read, audit, and correct that state, every
        entity, every observation, every relationship, every source artifact,
        every signed agent, every conversation turn, without writing SQL.
      </p>

      <InspectorPreview
        path="/"
        caption="Inspector dashboard with system stats, entity-type histogram, recent timeline events, and agent attribution coverage."
      >
        <div className="flex">
          <InspectorSidebarMock active="dashboard" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Dashboard"
              subtitle="Live state of this Neotoma instance"
              right={
                <>
                  <MockPill tone="success">Healthy</MockPill>
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
              <MockStatCard label="Agents" value="14" hint="3 hardware" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 pb-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[12px] font-medium text-foreground mb-2">
                  Entities by type
                </div>
                <ul className="space-y-1.5 text-[12px]">
                  {[
                    { t: "agent_message", v: 0.98, n: 4910 },
                    { t: "transaction", v: 0.62, n: 3104 },
                    { t: "contact", v: 0.45, n: 2231 },
                    { t: "task", v: 0.31, n: 1556 },
                    { t: "event", v: 0.18, n: 902 },
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
                  Recent timeline events
                </div>
                <ul className="space-y-1.5 text-[12px]">
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-12 tabular-nums">12:41</span>
                    <MockPill tone="info">store</MockPill>
                    <span className="truncate">
                      transaction · "Subscription · Vercel"
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-12 tabular-nums">12:38</span>
                    <MockPill tone="violet">correct</MockPill>
                    <span className="truncate">
                      contact · canonical_name updated
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-12 tabular-nums">12:30</span>
                    <MockPill tone="info">store</MockPill>
                    <span className="truncate">
                      conversation_message · turn 4
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-12 tabular-nums">12:21</span>
                    <MockPill tone="success">link</MockPill>
                    <span className="truncate">PART_OF created</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        What the Inspector is for
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Neotoma's value comes from a single shared, versioned graph of state.
        Once agents start writing, three questions immediately matter:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">What did they write?</strong>{" "}
          Browse entities, observations, sources, relationships, and timeline
          events with full filters and pagination.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Why is the snapshot what it is?</strong>{" "}
          Drill into per-field provenance, which observation won, when, from
          which agent, citing which source row.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Was it written on real authority?</strong>{" "}
          Inspect AAuth trust tiers, JWT subjects, hardware attestation
          envelopes, and operator allowlists per row.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Because Neotoma never overwrites observations, the Inspector also acts
        as a forensic tool: every value you see can be traced back to the
        observation, source, and agent that produced it, and corrections layer
        on top without erasing history.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        How to open it
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Inspector is bundled with the Neotoma server and served by the same
        process as the API:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`# Start (or confirm) the local API
neotoma api start --env dev

# Open the Inspector
open http://localhost:3080/inspector`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        For hosted Neotoma deployments, the Inspector is reachable at{" "}
        <code>https://&lt;your-neotoma-host&gt;/inspector</code>. The Inspector
        respects the same authentication contract as the API: bearer tokens,{" "}
        <code>user_id</code> scope, and AAuth-attributed writes flow through
        unchanged. See{" "}
        <Link
          to="/aauth"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          AAuth
        </Link>{" "}
        for the attribution contract surfaced in every Inspector list.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Sections
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Each subpage below maps directly to a section of the Inspector
        application and shows representative UI:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/dashboard"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Dashboard & health
          </Link>{" "}
         , top-level stats, type breakdown, system health, attribution
          coverage.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/entities"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Entities
          </Link>{" "}
         , filter, search, and inspect entity snapshots; per-field provenance
          and multi-field corrections.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/observations-and-sources"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Observations & sources
          </Link>{" "}
         , the immutable write log and the raw artifacts behind it.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/relationships-and-graph"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Relationships & graph
          </Link>{" "}
         , typed edges, neighborhood graph explorer, traversal.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/schemas"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Schemas
          </Link>{" "}
         , registered entity types, fields, identity rules, schema evolution.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/timeline"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Timeline & interpretations
          </Link>{" "}
         , event stream, replays, derived interpretation entities.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/conversations"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Conversations & turns
          </Link>{" "}
         , agent_message rows reconstructed into per-conversation transcripts.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/agents"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Agents, AAuth & grants
          </Link>{" "}
         , per-agent rosters, trust tier, attestation envelopes, grant
          policies.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/peers"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Peers
          </Link>{" "}
         , registered Neotoma instances for cross-instance sync: URLs,
          directions, scoped entity types, auth, conflict strategy, and sync
          status.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/search"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Search
          </Link>{" "}
         , ⌘K global identifier and full-text search across every record
          type, with ranking and result-kind details.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong>Issues</strong> (<code>/issues</code> in the Inspector app),
          GitHub-backed issue filing and threads synced to Neotoma{" "}
          <code>issue</code> entities; use <code>neotoma issues</code> / MCP{" "}
          <code>submit_issue</code> from agents. See{" "}
          <code>docs/subsystems/issues.md</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/settings"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Settings
          </Link>{" "}
         , <code>/settings</code> instance configuration. Drill in for{" "}
          <Link
            to="/inspector/settings/connection"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Connection
          </Link>
          ,{" "}
          <Link
            to="/inspector/settings/attribution-policy"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Attribution policy
          </Link>
          ,{" "}
          <Link
            to="/inspector/settings/retention"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Retention
          </Link>
          .
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Tech stack
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Inspector is a standalone React 19 + Vite 6 single-page application
        served from the Neotoma server. It uses Tailwind CSS for styling,
        TanStack Query for data fetching, TanStack Table for list views,
        Recharts for charts, and <code>@xyflow/react</code> for the graph
        explorer. Every panel reads from the same REST endpoints documented
        under{" "}
        <Link
          to="/api"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          REST API
        </Link>{" "}
       , there is no Inspector-specific backend.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Read-mostly, with safe corrections
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Inspector is read-mostly by design. Where it does write, it follows
        the same rules as any other client:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Field-level corrections add a new observation; they never mutate or
          delete the prior one.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Relationship creates and merges go through the same{" "}
          <code>/create_relationship</code> and <code>/merge_entities</code>{" "}
          endpoints used by the MCP and CLI.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Inspector-originated writes are themselves attributed,{" "}
          <code>clientInfo.name</code> is set to <code>inspector-ui</code> and
          (when configured) signed via AAuth, so you can audit operator
          actions in the same surfaces as agent actions.
        </li>
      </ul>
    </DetailPage>
  );
}
