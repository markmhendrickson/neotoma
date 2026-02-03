/**
 * Recent Activity Feed Component
 * 
 * Displays last 10 timeline events on the home page
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, ArrowRight } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useRealtimeTimeline } from "@/hooks/useRealtimeTimeline";
import { getApiClient } from "@/lib/api_client";

interface TimelineEvent {
  id: string;
  event_type: string;
  event_timestamp: string;
  entity_refs: Record<string, string>;
  source_id?: string | null;
  extracted_from_field?: string;
  created_at: string;
  user_id: string;
}

interface RecentActivityFeedProps {
  refreshKey?: number; // Trigger refresh when changed
}

export function RecentActivityFeed({ refreshKey }: RecentActivityFeedProps) {
  const [fetchedActivities, setFetchedActivities] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken } = useAuth();
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    fetchRecentActivity();
  }, [refreshKey, bearerToken, keysLoading, sessionToken, settings.bearerToken]);

  const fetchRecentActivity = async () => {
    setLoading(true);
    try {
      const api = getApiClient(bearerToken);
      const { data, error } = await api.GET("/api/timeline", {
        params: { query: { limit: 10 } },
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

  // Add real-time subscription
  const activities = useRealtimeTimeline(fetchedActivities, {
    onInsert: (event) => {
      console.log("New activity:", event);
    },
  }).slice(0, 10); // Keep only last 10 events

  const formatEventType = (eventType: string): string => {
    return eventType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getEntityName = (event: TimelineEvent): string => {
    // Extract entity name from entity_refs
    const refs = Object.values(event.entity_refs);
    if (refs.length > 0) {
      return refs[0]; // Use first entity reference as name
    }
    return event.event_type;
  };

  const getEntityLink = (event: TimelineEvent): string | null => {
    // Extract entity ID from entity_refs
    const entityIds = Object.keys(event.entity_refs);
    if (entityIds.length > 0) {
      return `/entity/${entityIds[0]}`;
    }
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest data updates</CardDescription>
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
            <CardDescription>Your latest data updates</CardDescription>
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
          <div className="space-y-3">
            {activities.map((activity) => {
              const entityLink = getEntityLink(activity);
              const entityName = getEntityName(activity);

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {formatEventType(activity.event_type)}
                      </Badge>
                      {entityLink ? (
                        <Link
                          to={entityLink}
                          className="text-sm font-medium hover:underline truncate"
                        >
                          {entityName}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium truncate">{entityName}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatTimestamp(activity.event_timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
