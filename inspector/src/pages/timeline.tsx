import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { isApiUrlConfigured } from "@/api/client";
import { useTimeline } from "@/hooks/use_timeline";
import { PageShell } from "@/components/layout/page_shell";
import { ApiNotConfiguredState } from "@/components/shared/api_not_configured_state";
import { EmptyState } from "@/components/shared/empty_state";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/shared/entity_link";
import { AgentBadge } from "@/components/shared/agent_badge";
import { useAgentAttributionFilter } from "@/components/shared/agent_filter";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import type { ColumnDef } from "@tanstack/react-table";
import type { TimelineEvent } from "@/types/api";

const PAGE_SIZE = 25;

export default function TimelinePage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [offset, setOffset] = useState(0);

  const timeline = useTimeline({
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    event_type: eventType || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const columns: ColumnDef<TimelineEvent, unknown>[] = [
    {
      header: "Event Type",
      accessorKey: "event_type",
      cell: ({ row }) => (
        <Link to={`/timeline/${encodeURIComponent(row.original.id)}`} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
          {row.original.event_type || "event"}
        </Link>
      ),
    },
    {
      header: "Timestamp",
      accessorKey: "event_timestamp",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      header: "Entities",
      id: "entities",
      cell: ({ row }) => {
        const ev = row.original;
        const ids = ev.entity_id ? [ev.entity_id] : ev.entity_ids ?? [];
        if (!ids.length) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {ids.slice(0, 3).map((eid) => <EntityLink key={eid} id={eid} />)}
            {ids.length > 3 && <span className="text-xs text-muted-foreground">+{ids.length - 3}</span>}
          </div>
        );
      },
    },
    {
      header: "Properties",
      id: "prop_count",
      cell: ({ row }) => {
        const props = row.original.properties;
        return props ? `${Object.keys(props).length} props` : "—";
      },
    },
    {
      header: "Agent",
      id: "agent",
      cell: ({ row }) => (
        <AgentBadge provenance={row.original.provenance ?? null} />
      ),
    },
  ];

  const events = timeline.data?.events ?? [];
  const timelineTotal = timeline.data?.total;
  const { filterRows, AgentFilterControl } = useAgentAttributionFilter(events);
  const displayed = filterRows(events);
  const filtersActive = Boolean(startDate || endDate || eventType);

  if (!isApiUrlConfigured()) {
    return (
      <PageShell
        title="Timeline"
        description="Dates from source documents and temporal fields (event_timestamp), not when data was recorded in Neotoma"
      >
        <ApiNotConfiguredState />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Timeline"
      description="Dates from source documents and temporal fields (event_timestamp), not when data was recorded in Neotoma"
      actions={showBackgroundQueryRefresh(timeline) ? <QueryRefreshIndicator /> : undefined}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Start Date</label>
          <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setOffset(0); }} className="w-[160px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End Date</label>
          <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setOffset(0); }} className="w-[160px]" />
        </div>
        <Input placeholder="Event type…" value={eventType} onChange={(e) => { setEventType(e.target.value); setOffset(0); }} className="w-[160px]" />
        <AgentFilterControl />
      </div>

      {showInitialQuerySkeleton(timeline) ? (
        <DataTableSkeleton rows={12} cols={5} />
      ) : timeline.error ? (
        <QueryErrorAlert title="Could not load world-time events">{timeline.error.message}</QueryErrorAlert>
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={filtersActive ? "No events match these filters" : "No world-time events yet"}
          description={
            filtersActive
              ? "Widen the date range, try a different event type, or clear the agent filter."
              : "Timeline events appear here as records with explicit dates are ingested — meeting transcripts, calendar entries, dated documents, and similar source material."
          }
        />
      ) : (
        <>
          <DataTable columns={columns} data={displayed} />
          {(timelineTotal ?? 0) > PAGE_SIZE || events.length >= PAGE_SIZE ? (
            <Pagination
              offset={offset}
              limit={PAGE_SIZE}
              total={timelineTotal ?? offset + events.length + (events.length >= PAGE_SIZE ? 1 : 0)}
              onPageChange={setOffset}
            />
          ) : null}
        </>
      )}
    </PageShell>
  );
}
