import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDateTime } from "@/lib/utils";
import { absoluteDateTime, dayBucketLabel, humanizeKey, shortId } from "@/lib/humanize";
import { AgentBadge } from "./agent_badge";
import type { TimelineEvent } from "@/types/api";

interface WorldTimeEventTimelineProps {
  events: TimelineEvent[];
}

interface Bucket {
  key: string;
  label: string;
  earliest: string;
  items: TimelineEvent[];
}

export function WorldTimeEventTimeline({ events }: WorldTimeEventTimelineProps) {
  const buckets = useMemo(() => groupByDay(events), [events]);

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No world-time dates derived from this entity&apos;s sources yet. Dates appear when temporal
        fields (for example due dates or signed dates) are set on observations linked to a source.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {buckets.map((bucket) => (
        <div key={bucket.key}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">{bucket.label}</h3>
            <span className="text-xs text-muted-foreground">
              {bucket.items.length} event{bucket.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <ol className="relative border-l border-amber-700/25 pl-4 dark:border-amber-500/30">
            {bucket.items.map((ev) => (
              <WorldTimeRow key={ev.id} event={ev} />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function WorldTimeRow({ event }: { event: TimelineEvent }) {
  const when = event.event_timestamp || event.event_date || "";
  const sourceField = event.source_field?.trim();
  const eventType = event.event_type?.trim() || "event";

  return (
    <li className="relative ml-1 pb-4 last:pb-0">
      <span
        className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-amber-700 dark:bg-amber-500"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium" title={absoluteDateTime(when) || undefined}>
          {formatDateTime(when)}
        </span>
        <Link
          to={`/timeline/${encodeURIComponent(event.id)}`}
          className="text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {humanizeKey(eventType)}
        </Link>
        {sourceField ? (
          <span
            className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-950 dark:text-amber-100"
            title="Source field"
          >
            {humanizeKey(sourceField)}
          </span>
        ) : null}
        {event.source_id ? (
          <Link
            to={`/sources/${encodeURIComponent(event.source_id)}`}
            className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] hover:bg-muted/70"
            title={event.source_id}
          >
            source {shortId(event.source_id, 8)}
          </Link>
        ) : null}
        <AgentBadge provenance={event.provenance ?? null} />
      </div>
    </li>
  );
}

function groupByDay(events: TimelineEvent[]): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const ev of events) {
    const ts = ev.event_timestamp || ev.event_date || "";
    const label = dayBucketLabel(ts);
    const key = label;
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, earliest: ts, items: [] };
      buckets.set(key, b);
    }
    b.items.push(ev);
    if (ts && (!b.earliest || ts > b.earliest)) b.earliest = ts;
  }
  const arr = Array.from(buckets.values());
  arr.sort((a, b) => {
    if (a.label === "Today") return -1;
    if (b.label === "Today") return 1;
    if (a.label === "Yesterday") return -1;
    if (b.label === "Yesterday") return 1;
    return b.earliest.localeCompare(a.earliest);
  });
  for (const b of arr) {
    b.items.sort((x, y) =>
      (y.event_timestamp || y.event_date || "").localeCompare(
        x.event_timestamp || x.event_date || "",
      ),
    );
  }
  return arr;
}
