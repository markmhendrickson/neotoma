/**
 * Recent Activity Feed Component
 *
 * Displays last 10 timeline events on the home page, sorted by ingest time.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calendar, ArrowRight } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useRealtimeTimeline } from "@/hooks/useRealtimeTimeline";
import { getApiClient } from "@/lib/api_client";

interface TimelineEvent {
  id?: string;
  event_type?: string;
  event_timestamp?: string;
  entity_id?: string | null;
  entity_name?: string | null;
  entity_type?: string | null;
  entity_refs?: Record<string, string>;
  source_id?: string | null;
  source_field?: string | null;
  created_at?: string;
  user_id?: string;
}

interface RecentActivityFeedProps {
  refreshKey?: number;
}

export function RecentActivityFeed({ refreshKey }: RecentActivityFeedProps) {
  const [fetchedActivities, setFetchedActivities] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken } = useAuth();
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  useEffect(() => {
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }
    fetchRecentActivity();
  }, [refreshKey, bearerToken, keysLoading, sessionToken, settings.bearerToken]);

  const fetchRecentActivity = async () => {
    setLoading(true);
    try {
      const api = getApiClient(bearerToken);
      const { data, error } = await api.GET("/timeline", {
        params: { query: { limit: 10, order_by: "created_at" } },
      });

      if (error) {
        setFetchedActivities([]);
        return;
      }

      setFetchedActivities(data?.events || []);
    } catch (error) {
      console.error("Failed to fetch recent activity:", error);
      setFetchedActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const activities = useRealtimeTimeline(fetchedActivities, {
    onInsert: (event) => {
      console.log("New activity:", event);
    },
  }).slice(0, 10);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest timeline updates</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest timeline updates</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/timeline">
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No recent activity</p>
            <p className="text-sm mt-2">Upload a file or add data to get started</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activities.map((activity, i) => (
              <ActivityRow key={activity.id || i} event={activity} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityRow({ event }: { event: TimelineEvent }) {
  const entityLink = event.entity_id ? `/entity/${event.entity_id}` : null;
  const description = buildDescription(event);
  const eventDate = formatDateOnly(event.event_timestamp);
  const indexedAgo = formatRelativeTime(event.created_at || event.event_timestamp);

  return (
    <div className="flex items-baseline gap-3 py-2.5 px-1 rounded-md hover:bg-muted/50 transition-colors group">
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 w-16 text-right tabular-nums">
        {indexedAgo}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm">
          <span className="font-medium">{description.action}</span>
          {description.entityName && (
            <>
              {" "}
              {entityLink ? (
                <Link
                  to={entityLink}
                  className="text-primary hover:underline font-medium"
                >
                  {description.entityName}
                </Link>
              ) : (
                <span className="font-medium">{description.entityName}</span>
              )}
            </>
          )}
          {eventDate && (
            <span className="text-muted-foreground"> — {eventDate}</span>
          )}
        </span>
      </div>
    </div>
  );
}

/** Build a human-readable action + entity name from the raw event. */
function buildDescription(event: TimelineEvent): {
  action: string;
  entityName: string | null;
} {
  const rawType = event.event_type || "Event";
  const action = humanizeEventType(rawType);

  let entityName: string | null = null;
  if (event.entity_name) {
    entityName = event.entity_name;
  } else if (event.entity_refs) {
    const refs = Object.values(event.entity_refs);
    if (refs.length > 0) entityName = refs[0];
  }

  return { action, entityName };
}

/** Convert PascalCase / snake_case event types to readable labels. */
function humanizeEventType(eventType: string): string {
  const EVENT_TYPE_LABELS: Record<string, string> = {
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

  if (EVENT_TYPE_LABELS[eventType]) {
    return EVENT_TYPE_LABELS[eventType];
  }

  // Split PascalCase ("CreatedDate" → "Created date") and snake_case
  return eventType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/, (c) => c.toUpperCase())
    .replace(/\bDate\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim() || eventType;
}

/** Format an ISO timestamp as a short date: "Apr 7", "Dec 15, 2024". Omits year if current. */
function formatDateOnly(timestamp: string | undefined | null): string | null {
  if (!timestamp) return null;
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return null;
  }
}

/** "3m ago", "2h ago", "5d ago", or a short date. */
function formatRelativeTime(timestamp: string | undefined | null): string {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
