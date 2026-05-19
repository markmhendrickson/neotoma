import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { absoluteDateTime, dayBucketLabel, humanizeKey, shortId, truncate } from "@/lib/humanize";
import { AgentBadge } from "./agent_badge";
import type { Observation } from "@/types/api";

interface ObservationTimelineProps {
  observations: Observation[];
  /** When true, surface developer-only columns (priority, specificity, ids). */
  developerView?: boolean;
}

const EXCLUDED_FIELD_KEYS = new Set([
  "_deleted",
  "schema_version",
  "entity_type",
  "canonical_name",
]);

interface Bucket {
  key: string;
  label: string;
  earliest: string;
  items: Observation[];
}

export function ObservationTimeline({ observations, developerView }: ObservationTimelineProps) {
  const buckets = useMemo(() => groupByDay(observations), [observations]);

  if (observations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No observations yet.
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
              {bucket.items.length} observation{bucket.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <ol className="relative border-l pl-4">
            {bucket.items.map((obs) => (
              <TimelineRow key={obs.id} observation={obs} developerView={developerView} />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({
  observation,
  developerView,
}: {
  observation: Observation;
  developerView?: boolean;
}) {
  const when = observation.observed_at || "";
  const sourceLabel =
    (observation.source && observation.source.trim()) ||
    (observation.source_id ? shortId(observation.source_id) : null);

  const fields = observation.fields ?? {};
  const changedKeys = Object.keys(fields).filter((k) => !EXCLUDED_FIELD_KEYS.has(k));
  const previewKeys = changedKeys.slice(0, 3);
  const extra = changedKeys.length - previewKeys.length;
  const turnKey = typeof fields.turn_key === "string" ? fields.turn_key : undefined;

  return (
    <li className="relative ml-1 pb-4 last:pb-0">
      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium" title={absoluteDateTime(when) || undefined}>
          {formatDate(when)}
        </span>
        {sourceLabel ? (
          <SourceChip
            label={sourceLabel}
            sourceId={observation.source_id ?? undefined}
          />
        ) : null}
        {turnKey ? (
          <span
            className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
            title={turnKey}
          >
            turn {truncate(turnKey, 24)}
          </span>
        ) : null}
        <AgentBadge provenance={observation.provenance ?? null} />
        {developerView && observation.observation_source ? (
          <span
            className="inline-flex items-center rounded border border-dashed px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            title="observation_source"
          >
            src:{observation.observation_source}
          </span>
        ) : null}
        {developerView && observation.source_peer_id ? (
          <span
            className="inline-flex items-center rounded border border-dashed px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            title="source_peer_id"
          >
            peer:{truncate(observation.source_peer_id, 20)}
          </span>
        ) : null}
      </div>
      {changedKeys.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
          {previewKeys.map((k) => (
            <span
              key={k}
              className="inline-flex items-center rounded border px-1.5 py-0.5"
              title={`Observed value: ${JSON.stringify(fields[k])}`}
            >
              {humanizeKey(k)}
            </span>
          ))}
          {extra > 0 ? (
            <span className="text-muted-foreground">+{extra} more</span>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground italic">No field changes recorded.</div>
      )}
      {developerView ? (
        <div className="mt-1 flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
          <span title={observation.id}>obs {shortId(observation.id, 8)}</span>
          {typeof observation.source_priority === "number" ? (
            <span>priority {observation.source_priority}</span>
          ) : null}
          {typeof observation.specificity_score === "number" ? (
            <span>specificity {observation.specificity_score.toFixed(2)}</span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function SourceChip({ label, sourceId }: { label: string; sourceId?: string }) {
  const className =
    "inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] hover:bg-muted/70";
  if (sourceId) {
    return (
      <Link to={`/sources/${encodeURIComponent(sourceId)}`} className={className} title={sourceId}>
        {truncate(label, 40)}
      </Link>
    );
  }
  return <span className={className}>{truncate(label, 40)}</span>;
}

function groupByDay(observations: Observation[]): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const obs of observations) {
    const ts = obs.observed_at || "";
    const label = dayBucketLabel(ts);
    const key = label;
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, earliest: ts, items: [] };
      buckets.set(key, b);
    }
    b.items.push(obs);
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
    b.items.sort((x, y) => (y.observed_at || "").localeCompare(x.observed_at || ""));
  }
  return arr;
}
