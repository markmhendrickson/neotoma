import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorSearchPage() {
  return (
    <DetailPage title="Inspector, Search">
      <p className="text-[15px] leading-7 mb-4">
        Global search is the fastest way to navigate a large Neotoma instance.
        It runs across every record type, entities, observations, sources,
        conversations, and timeline events, and ranks results so you can jump
        to the canonical detail page in two keystrokes.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        ⌘K from anywhere
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Press <code>⌘K</code> on macOS or <code>Ctrl+K</code> elsewhere to open
        the search modal from any page. Results stream in as you type, grouped
        by record type, and every result is keyboard-navigable. <code>↵</code>{" "}
        opens the canonical detail page; <code>⌘↵</code> opens it in a new
        tab; <code>esc</code> dismisses.
      </p>

      <InspectorPreview
        path="/?q=vercel"
        caption="⌘K opens a global search modal that ranks across every record type, with shortcuts to entity, source, and timeline detail."
      >
        <div className="relative">
          <div className="flex">
            <InspectorSidebarMock active="dashboard" />
            <div className="flex-1 min-w-0 opacity-40">
              <InspectorPageHeaderMock
                title="Dashboard"
                subtitle="Live state of this Neotoma instance"
              />
              <div className="px-4 py-6 text-[12px] text-muted-foreground">
                <div className="h-20 rounded-md border border-dashed border-border/60" />
              </div>
            </div>
          </div>
          <div className="absolute inset-0 bg-background/80 flex items-start justify-center pt-10">
            <div className="w-[480px] max-w-[92%] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <span className="text-muted-foreground text-[14px]">⌘K</span>
                <input
                  className="flex-1 bg-transparent text-[13px] text-foreground outline-none"
                  defaultValue="vercel"
                  readOnly
                />
                <span className="text-[11px] text-muted-foreground">esc</span>
              </div>
              <div className="px-2 py-2 text-[12px]">
                <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Entities
                </div>
                {[
                  {
                    title: "transaction · Subscription · Vercel",
                    sub: "ent_4ad… · last seen 12:41",
                    tone: "info" as const,
                    tag: "transaction",
                  },
                  {
                    title: "company · Vercel",
                    sub: "ent_9b1… · 28 references",
                    tone: "info" as const,
                    tag: "company",
                  },
                ].map((row) => (
                  <div
                    key={row.title}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                  >
                    <MockPill tone={row.tone}>{row.tag}</MockPill>
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground truncate">
                        {row.title}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground truncate">
                        {row.sub}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Sources
                </div>
                <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                  <MockPill tone="violet">file_asset</MockPill>
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground truncate">
                      vercel-2026-04.pdf
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate">
                      uploaded 11:08 · 1.2 MB · pdf
                    </div>
                  </div>
                </div>
                <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Timeline
                </div>
                <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                  <MockPill tone="info">store</MockPill>
                  <div className="flex-1 min-w-0 text-foreground truncate">
                    transaction · Subscription · Vercel
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    12:41
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Ranking
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Within each record group, matches are ranked by:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5 mb-6 text-[15px] leading-7 text-muted-foreground">
        <li>
          <strong className="text-foreground">Identity match</strong>,{" "}
          <code>canonical_name</code> equality, then prefix match, then alias
          match.
        </li>
        <li>
          <strong className="text-foreground">Snapshot text match</strong>,
          full-text match against the entity snapshot fields.
        </li>
        <li>
          <strong className="text-foreground">Recency</strong>,{" "}
          <code>last_observation_at</code> tie-break, so the most recently
          touched record wins on ties.
        </li>
      </ol>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Result kinds
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <Link
              to="/inspector/entities"
              className="text-foreground underline underline-offset-2 hover:no-underline"
              {...detailPageCtaLinkProps}
            >
              Entities
            </Link>
          </strong>{" "}
         , matched by <code>canonical_name</code>, snapshot fields, or an
          existing identifier.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <Link
              to="/inspector/observations-and-sources"
              className="text-foreground underline underline-offset-2 hover:no-underline"
              {...detailPageCtaLinkProps}
            >
              Observations
            </Link>
          </strong>{" "}
         , full-text search over <code>field_values</code>, scoped by entity.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <Link
              to="/inspector/observations-and-sources"
              className="text-foreground underline underline-offset-2 hover:no-underline"
              {...detailPageCtaLinkProps}
            >
              Sources
            </Link>
          </strong>{" "}
         , match by filename, mime type, or tool descriptor.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <Link
              to="/inspector/conversations"
              className="text-foreground underline underline-offset-2 hover:no-underline"
              {...detailPageCtaLinkProps}
            >
              Conversations
            </Link>
          </strong>{" "}
         , match by title or by content of any contained turn.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <Link
              to="/inspector/timeline"
              className="text-foreground underline underline-offset-2 hover:no-underline"
              {...detailPageCtaLinkProps}
            >
              Timeline events
            </Link>
          </strong>{" "}
         , match by entity, agent, or event kind in a time window.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Filters and scoping
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Modal-level filters scope the entire search: by entity_type, by agent
        (
        <Link
          to="/inspector/agents"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          thumbprint
        </Link>
        ), or by time window. Per-list pages keep their richer in-page filter
        chips for narrower work; the global search box is intended for fast
        navigation, not for exhaustive querying.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Backed by the same API
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Every result is fetched against the same endpoints documented under{" "}
        <Link
          to="/api"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          REST API
        </Link>{" "}
       , primarily{" "}
        <code>POST /retrieve_entity_by_identifier</code> and{" "}
        <code>POST /entities/query</code>, alongside listing endpoints for
        sources, conversations, and timeline events. There is no
        Inspector-specific search backend; anything you can find in ⌘K is also
        reachable from MCP and CLI.
      </p>
    </DetailPage>
  );
}
