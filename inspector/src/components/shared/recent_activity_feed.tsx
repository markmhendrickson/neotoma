import { Link } from "react-router-dom";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { EntityLink } from "@/components/shared/entity_link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/types/api";

interface RecentActivityFeedProps {
  events: TimelineEvent[];
  emptyMessage?: string;
  compact?: boolean;
  showViewAll?: boolean;
}

export function RecentActivityFeed({
  events,
  emptyMessage = "No recent events.",
  compact = false,
  showViewAll = false,
}: RecentActivityFeedProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className={cn("space-y-3", compact && "space-y-1")}>
      <div className="space-y-1">
        {events.map((ev) => {
          const entityId = ev.entity_id || ev.entity_ids?.[0];
          const label = humanizeEventType(ev.event_type || "event");
          const activityTs = activityTimestamp(ev);
          const eventDate = shortDateIfPlausible(ev.event_timestamp);
          const entityLabel = entityDisplayLabel(ev);
          const detail = eventDetail(ev);
          const metadataChips = previewMetadataChips(ev);

          return (
            <div
              key={ev.id}
              className={cn(
                "flex items-start gap-3 rounded-md transition-colors hover:bg-muted/50",
                compact ? "px-1 py-1" : "px-3 py-2"
              )}
            >
              <LiveRelativeTime
                iso={activityTs}
                className={cn(
                  "inline-block shrink-0 text-right font-mono text-muted-foreground tabular-nums",
                  compact ? "w-12 text-xs" : "w-16 text-sm"
                )}
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/timeline/${encodeURIComponent(ev.id)}`}
                  className={cn("font-medium hover:underline", compact ? "text-xs" : "text-sm")}
                >
                  {label}
                </Link>
                <div
                  className={cn(
                    "mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  {entityId ? (
                    <EntityLink
                      id={entityId}
                      name={entityLabel}
                      className="relative z-10 text-inherit hover:text-foreground"
                    />
                  ) : entityLabel ? (
                    <span>{entityLabel}</span>
                  ) : null}
                  {detail ? <span className="truncate max-w-full">- {detail}</span> : null}
                  {eventDate ? <span>· {eventDate}</span> : null}
                </div>
                {!compact && metadataChips.length > 0 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {metadataChips.map((chip) => (
                      <span
                        key={`${ev.id}-${chip}`}
                        className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
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

export function humanizeEventType(raw: string): string {
  const labels: Record<string, string> = {
    TaskDue: "Task due",
    TaskStart: "Task started",
    TaskCompleted: "Task completed",
    InvoiceIssued: "Invoice issued",
    InvoiceDue: "Invoice due",
    EventStart: "Event started",
    EventEnd: "Event ended",
    TransactionDate: "Transaction",
    IncomeDate: "Income received",
    FlightDeparture: "Flight departure",
    FlightArrival: "Flight arrival",
  };
  if (labels[raw]) return labels[raw];
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/, (c) => c.toUpperCase())
    .replace(/\bDate\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim() || raw;
}

function calendarDayPrefix(ts: string): string | null {
  const m = ts.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

const PLACEHOLDER_EVENT_DATE_DAYS = new Set([
  "0001-01-01",
  "1900-01-01",
  "1970-01-01",
  "2000-01-01",
  "2001-01-01",
]);

function isPlaceholderEventTimestamp(ts: string | undefined | null): boolean {
  if (ts == null || !String(ts).trim()) return true;
  const s = String(ts).trim();
  const day = calendarDayPrefix(s);
  if (day && PLACEHOLDER_EVENT_DATE_DAYS.has(day)) return true;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return true;
  return d.getUTCFullYear() === 1970 && d.getUTCMonth() === 0 && d.getUTCDate() === 1;
}

function activityTimestamp(ev: TimelineEvent): string | undefined | null {
  if (ev.created_at && !isPlaceholderEventTimestamp(ev.created_at)) return ev.created_at;
  if (ev.event_timestamp && !isPlaceholderEventTimestamp(ev.event_timestamp)) return ev.event_timestamp;
  return ev.created_at ?? ev.event_timestamp;
}

function shortDateIfPlausible(ts: string | undefined | null): string | null {
  if (ts == null || isPlaceholderEventTimestamp(ts)) return null;
  return shortDate(ts);
}

function shortDate(ts: string | undefined | null): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return null;
  }
}

function entityDisplayLabel(ev: TimelineEvent): string | undefined {
  if (ev.entity_name && ev.entity_name.trim()) return ev.entity_name.trim();
  if (ev.entity_type && ev.entity_type.trim()) return humanizeEventType(ev.entity_type);
  return undefined;
}

const DETAIL_FIELDS = [
  "title",
  "name",
  "subject",
  "description",
  "status",
  "content",
  "summary",
  "value",
] as const;

function eventDetail(ev: TimelineEvent): string | undefined {
  const props = ev.properties ?? {};
  for (const key of DETAIL_FIELDS) {
    const value = props[key];
    if (typeof value === "string") {
      const compact = value.replace(/\s+/g, " ").trim();
      if (compact) return truncate(compact, 90);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  if (typeof ev.source_field === "string" && ev.source_field.trim()) {
    return humanizeEventType(ev.source_field);
  }
  return undefined;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const METADATA_FIELDS = ["role", "status", "entity_type", "source_type"] as const;

function previewMetadataChips(ev: TimelineEvent): string[] {
  const props = ev.properties ?? {};
  const chips: string[] = [];

  for (const field of METADATA_FIELDS) {
    const raw = props[field];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    chips.push(`${humanizeEventType(field)}: ${truncate(humanizeEventType(value), 28)}`);
  }

  if (ev.source_field?.trim()) {
    chips.push(`Field: ${humanizeEventType(ev.source_field.trim())}`);
  }

  const turnKey = props["turn_key"];
  if (typeof turnKey === "string" && turnKey.trim()) {
    chips.push(`Turn: ${truncate(turnKey.trim(), 24)}`);
  }

  return chips.slice(0, 4);
}
