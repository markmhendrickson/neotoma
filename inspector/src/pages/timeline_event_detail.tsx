import { useParams } from "react-router-dom";
import { useTimelineEvent } from "@/hooks/use_timeline";
import { PageShell } from "@/components/layout/page_shell";
import { DetailPageSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityLink } from "@/components/shared/entity_link";
import { SourceLink } from "@/components/shared/source_link";
import { JsonViewer } from "@/components/shared/json_viewer";
import { formatDate } from "@/lib/utils";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { PinPrimitiveButton } from "@/components/shared/pin_primitive_button";

export default function TimelineEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const event = useTimelineEvent(id);

  const ev = event.data?.event;

  if (showInitialQuerySkeleton(event))
    return (
      <PageShell title="Loading…">
        <DetailPageSkeleton />
      </PageShell>
    );
  if (event.error)
    return (
      <PageShell title="Error">
        <QueryErrorAlert title="Could not load event">{event.error.message}</QueryErrorAlert>
      </PageShell>
    );
  if (!ev) return <PageShell title="Not Found"><div className="text-muted-foreground">Event not found.</div></PageShell>;

  return (
    <PageShell
      title={ev.event_type || "Event"}
      description={`Timeline event · ${formatDate(ev.event_timestamp)}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showBackgroundQueryRefresh(event) ? <QueryRefreshIndicator /> : null}
          <PinPrimitiveButton
            kind="timeline_event"
            href={`/timeline/${encodeURIComponent(ev.id)}`}
            label={ev.event_type || ev.id}
            subtitle={formatDate(ev.event_timestamp)}
          />
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="font-mono text-xs">{ev.id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{ev.event_type || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Event date</span><span>{formatDate(ev.event_timestamp)}</span></div>
            {ev.created_at && (
              <div className="flex justify-between"><span className="text-muted-foreground">Indexed at</span><span>{formatDate(ev.created_at)}</span></div>
            )}
            {ev.source_id && (
              <div className="flex justify-between"><span className="text-muted-foreground">Source</span><SourceLink id={ev.source_id} /></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Linked Entities</CardTitle></CardHeader>
          <CardContent>
            {(ev.entity_id || ev.entity_ids?.length) ? (
              <div className="space-y-1">
                {(ev.entity_id ? [ev.entity_id] : ev.entity_ids ?? []).map((eid) => (
                  <div key={eid}><EntityLink id={eid} /></div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No linked entities.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {ev.properties && Object.keys(ev.properties).length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-base">Properties</CardTitle></CardHeader>
          <CardContent><JsonViewer data={ev.properties} defaultExpanded /></CardContent>
        </Card>
      )}
    </PageShell>
  );
}
