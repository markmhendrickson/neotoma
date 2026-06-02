import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { TypeBadge } from "@/components/shared/type_badge";
import { AgentBadge } from "@/components/shared/agent_badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecordActivityItem, RecordActivityType } from "@/types/api";
import { humanizeEventType } from "@/components/shared/recent_activity_feed";

interface RecentRecordsFeedProps {
  items: RecordActivityItem[];
  emptyMessage?: string;
  compact?: boolean;
  showViewAll?: boolean;
  /**
   * When true, partition items into time buckets (Now / Today / Yesterday /
   * Older) with lightweight headings. Defaults to true on full pages and
   * false in compact dashboards.
   */
  showBuckets?: boolean;
}

function recordTypeLabel(t: RecordActivityType): string {
  switch (t) {
    case "entity":
      return "Entity";
    case "source":
      return "Source";
    case "observation":
      return "Observation";
    case "interpretation":
      return "Interpretation";
    case "timeline_event":
      return "Timeline";
    case "relationship":
      return "Relationship";
    default:
      return t;
  }
}

function linkForItem(item: RecordActivityItem): string {
  switch (item.record_type) {
    case "entity":
      return `/entities/${encodeURIComponent(item.id)}`;
    case "source":
      return `/sources/${encodeURIComponent(item.id)}`;
    case "observation":
      return "/observations";
    case "interpretation":
      return "/interpretations";
    case "timeline_event":
      return `/timeline/${encodeURIComponent(item.id)}`;
    case "relationship":
      return `/relationships/${encodeURIComponent(item.id)}`;
    default:
      return "/";
  }
}

function entityLink(id: string): string {
  return `/entities/${encodeURIComponent(id)}`;
}

function sourceLink(id: string): string {
  return `/sources/${encodeURIComponent(id)}`;
}

/**
 * Short, stable ID hint shown after an otherwise anonymous label. Keeps the
 * full ID accessible via `title` tooltip on the parent element so advanced
 * users can still copy it.
 */
function shortId(id: string | null | undefined): string {
  if (!id) return "";
  const trimmed = id.trim();
  if (trimmed.length <= 10) return trimmed;
  // Common prefix pattern: "ent_xxx..." or "src_xxx..."; keep prefix + 6 hex.
  const underscore = trimmed.indexOf("_");
  if (underscore > 0 && underscore < 6) {
    return `${trimmed.slice(0, underscore + 1)}${trimmed.slice(underscore + 1, underscore + 7)}…`;
  }
  return `${trimmed.slice(0, 6)}…`;
}

function humanizeType(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "";
  return humanizeEventType(raw);
}

/**
 * Produces the primary headline label for the row. When rich enrichment
 * fields are present we build a natural-language template; otherwise we
 * fall back to the legacy `title` behavior.
 */
function rowHeadline(item: RecordActivityItem): ReactNode {
  switch (item.record_type) {
    case "entity": {
      const name = item.entity_name ?? item.title;
      return (
        <span>
          <Link to={linkForItem(item)} className="font-medium hover:underline">
            {name}
          </Link>
        </span>
      );
    }
    case "source": {
      const filename = item.source_filename ?? item.title;
      return (
        <Link to={linkForItem(item)} className="font-medium hover:underline">
          {filename || "Untitled source"}
        </Link>
      );
    }
    case "observation": {
      const entityName = item.entity_name;
      const entityType = humanizeType(item.entity_type);
      if (entityName && item.entity_id) {
        return (
          <span>
            Observation of{" "}
            <Link to={entityLink(item.entity_id)} className="font-medium hover:underline">
              {entityName}
            </Link>
            {entityType ? (
              <span className="text-muted-foreground"> ({entityType})</span>
            ) : null}
          </span>
        );
      }
      if (entityType) {
        return (
          <span>
            Observation <span className="text-muted-foreground">({entityType})</span>
          </span>
        );
      }
      return <span>Observation</span>;
    }
    case "interpretation": {
      const status = humanizeType(item.status ?? item.title);
      const filename = item.source_filename;
      if (filename && item.source_id) {
        return (
          <span>
            {status || "Interpretation"} of{" "}
            <Link to={sourceLink(item.source_id)} className="font-medium hover:underline">
              {filename}
            </Link>
          </span>
        );
      }
      return <span>{status || "Interpretation"}</span>;
    }
    case "relationship": {
      const rel = humanizeType(item.relationship_type ?? item.title);
      const srcName = item.source_entity_name ?? shortId(item.source_entity_id);
      const tgtName = item.target_entity_name ?? shortId(item.target_entity_id);
      const srcNode =
        item.source_entity_id ? (
          <Link
            to={entityLink(item.source_entity_id)}
            className="font-medium hover:underline"
            title={item.source_entity_id}
          >
            {srcName}
          </Link>
        ) : (
          <span className="font-medium">{srcName}</span>
        );
      const tgtNode =
        item.target_entity_id ? (
          <Link
            to={entityLink(item.target_entity_id)}
            className="font-medium hover:underline"
            title={item.target_entity_id}
          >
            {tgtName}
          </Link>
        ) : (
          <span className="font-medium">{tgtName}</span>
        );
      return (
        <span>
          {srcNode} <span className="text-muted-foreground">{rel || "→"}</span> {tgtNode}
        </span>
      );
    }
    case "timeline_event": {
      const label = humanizeType(item.event_type ?? item.title) || "Event";
      const entityName = item.entity_name;
      if (entityName && item.entity_id) {
        return (
          <span>
            {label} —{" "}
            <Link to={entityLink(item.entity_id)} className="font-medium hover:underline">
              {entityName}
            </Link>
          </span>
        );
      }
      return (
        <Link to={linkForItem(item)} className="font-medium hover:underline">
          {label}
        </Link>
      );
    }
    default:
      return <span>{item.title}</span>;
  }
}

/**
 * Optional secondary line: compact supporting context (source filename,
 * turn key, status). Kept short and de-emphasized so it doesn't compete
 * with the headline.
 */
function rowContextChips(item: RecordActivityItem): string[] {
  const chips: string[] = [];

  if (item.record_type === "observation" || item.record_type === "timeline_event") {
    if (item.source_filename) chips.push(item.source_filename);
    else if (item.source_type) chips.push(humanizeType(item.source_type));
  }

  if (item.record_type === "interpretation" && item.status) {
    // Already in headline; skip unless it's the fallback.
  }

  if (item.record_type === "source" && item.source_type) {
    chips.push(humanizeType(item.source_type));
  }

  if (item.record_type === "entity" && item.entity_type) {
    chips.push(humanizeType(item.entity_type));
  }

  if (item.turn_key) {
    chips.push(`turn ${truncate(item.turn_key, 24)}`);
  }

  return chips.slice(0, 3);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

type TimeBucket = "now" | "today" | "yesterday" | "older";

function bucketFor(ts: string | undefined | null): TimeBucket {
  if (!ts) return "older";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "older";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60 * 60 * 1000) return "now";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const t = d.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfYesterday) return "yesterday";
  return "older";
}

const BUCKET_LABEL: Record<TimeBucket, string> = {
  now: "Just now",
  today: "Today",
  yesterday: "Yesterday",
  older: "Older",
};

const BUCKET_ORDER: TimeBucket[] = ["now", "today", "yesterday", "older"];

export function RecentRecordsFeed({
  items,
  emptyMessage = "No records yet.",
  compact = false,
  showViewAll = false,
  showBuckets,
}: RecentRecordsFeedProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const useBuckets = showBuckets ?? !compact;

  // Stable partition preserving input order (which is `activity_at DESC`).
  const grouped = new Map<TimeBucket, RecordActivityItem[]>();
  for (const item of items) {
    const b = bucketFor(item.activity_at);
    const arr = grouped.get(b);
    if (arr) arr.push(item);
    else grouped.set(b, [item]);
  }

  const renderRow = (item: RecordActivityItem, prev: RecordActivityItem | null) => {
    const sameGroup = prev != null && !!item.group_key && item.group_key === prev.group_key;
    return (
      <div
        key={`${item.record_type}-${item.id}`}
        className={cn(
          "flex items-start gap-3 rounded-md transition-colors hover:bg-muted/50",
          compact ? "px-1 py-1" : "px-3 py-2",
          sameGroup && "border-l-2 border-muted-foreground/20 pl-3"
        )}
        title={`${recordTypeLabel(item.record_type)} ${item.id}`}
      >
        <LiveRelativeTime
          iso={item.activity_at}
          className={cn(
            "inline-block shrink-0 text-right font-mono text-muted-foreground tabular-nums",
            compact ? "w-12 text-xs" : "w-16 text-sm"
          )}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              compact ? "text-xs" : "text-sm"
            )}
          >
            <TypeBadge type={recordTypeLabel(item.record_type)} />
            <div className="min-w-0 flex-1 break-words">{rowHeadline(item)}</div>
            {item.attribution_tier || item.agent_label ? (
              <AgentBadge
                attribution={{
                  attribution_tier: item.attribution_tier ?? undefined,
                  client_name: item.agent_label ?? undefined,
                }}
              />
            ) : null}
          </div>
          {(() => {
            const chips = rowContextChips(item);
            if (chips.length === 0) return null;
            return (
              <div
                className={cn(
                  "mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground",
                  compact ? "text-xs" : "text-xs"
                )}
              >
                {chips.map((chip, idx) => (
                  <span
                    key={`${item.record_type}-${item.id}-chip-${idx}`}
                    className="rounded bg-muted px-1.5 py-0.5"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  if (!useBuckets) {
    let prev: RecordActivityItem | null = null;
    return (
      <div className={cn("space-y-3", compact && "space-y-1")}>
        <div className="space-y-1">
          {items.map((item) => {
            const node = renderRow(item, prev);
            prev = item;
            return node;
          })}
        </div>
        {showViewAll ? (
          <Link to="/activity" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View all records
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {BUCKET_ORDER.map((bucket) => {
        const arr = grouped.get(bucket);
        if (!arr || arr.length === 0) return null;
        let prev: RecordActivityItem | null = null;
        return (
          <section key={bucket} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {BUCKET_LABEL[bucket]}
              <span className="ml-2 font-normal normal-case tracking-normal">
                ({arr.length})
              </span>
            </h3>
            <div className="space-y-1">
              {arr.map((item) => {
                const node = renderRow(item, prev);
                prev = item;
                return node;
              })}
            </div>
          </section>
        );
      })}
      {showViewAll ? (
        <Link to="/activity" className={buttonVariants({ variant: "outline", size: "sm" })}>
          View all records
        </Link>
      ) : null}
    </div>
  );
}

