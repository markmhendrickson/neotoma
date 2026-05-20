import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Eye, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { TimelineLayerHeader } from "@/components/shared/timeline_layer_header";
import { ObservationTimeline } from "@/components/shared/observation_timeline";
import { WorldTimeEventTimeline } from "@/components/shared/world_time_event_timeline";
import type { Observation, TimelineEvent } from "@/types/api";

const OBSERVATION_HISTORY_BLURB =
  "Immutable writes that built or changed this entity, ordered by when Neotoma recorded them (observed_at). Use this for audit and provenance.";

const WORLD_TIME_BLURB =
  "Dates taken from source documents and temporal fields on the snapshot (event_timestamp), not when data was ingested. Use this for what happened in the world.";

export function ObservationHistorySection({
  entityId,
  observations,
  total,
  loading,
  error,
  showFullPageLink = true,
  footerAction,
}: {
  entityId: string;
  observations: Observation[];
  total: number;
  loading?: boolean;
  error?: Error | null;
  showFullPageLink?: boolean;
  footerAction?: ReactNode;
}) {
  const hasMore = total > observations.length;
  const historyHref = `/entities/${encodeURIComponent(entityId)}/history?layer=observations`;

  return (
    <section className="space-y-4" aria-labelledby="entity-observation-history-heading">
      <TimelineLayerHeader
        icon={Eye}
        title="Observation history"
        description={OBSERVATION_HISTORY_BLURB}
        count={total}
        countLabel="observations"
        fullPageHref={showFullPageLink && hasMore ? historyHref : undefined}
        fullPageLinkText={
          hasMore ? `View all ${total.toLocaleString()} observations` : undefined
        }
      />
      <h2 id="entity-observation-history-heading" className="sr-only">
        Observation history
      </h2>
      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <QueryErrorAlert title="Could not load observation history">{error.message}</QueryErrorAlert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <ObservationTimeline observations={observations} developerView={false} />
            {footerAction ??
              (hasMore && showFullPageLink ? (
                <div className="mt-4 border-t pt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={historyHref}>Open full observation history</Link>
                  </Button>
                </div>
              ) : null)}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

export function WorldTimeEventsSection({
  entityId,
  events,
  total,
  loading,
  error,
  showFullPageLink = true,
  footerAction,
}: {
  entityId: string;
  events: TimelineEvent[];
  total: number;
  loading?: boolean;
  error?: Error | null;
  showFullPageLink?: boolean;
  footerAction?: ReactNode;
}) {
  const hasMore = total > events.length;
  const historyHref = `/entities/${encodeURIComponent(entityId)}/history?layer=world-time`;

  return (
    <section className="space-y-4" aria-labelledby="entity-world-time-heading">
      <TimelineLayerHeader
        icon={CalendarClock}
        title="World-time dates"
        description={WORLD_TIME_BLURB}
        count={total}
        countLabel="events"
        fullPageHref={showFullPageLink && hasMore ? historyHref : undefined}
        fullPageLinkText={hasMore ? `View all ${total.toLocaleString()} events` : undefined}
      />
      <h2 id="entity-world-time-heading" className="sr-only">
        World-time dates
      </h2>
      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <QueryErrorAlert title="Could not load world-time events">{error.message}</QueryErrorAlert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <WorldTimeEventTimeline events={events} />
            {footerAction ??
              (hasMore && showFullPageLink ? (
                <div className="mt-4 border-t pt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={historyHref}>Open all world-time dates</Link>
                  </Button>
                </div>
              ) : null)}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
