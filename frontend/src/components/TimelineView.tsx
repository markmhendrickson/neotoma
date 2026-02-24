/**
 * Timeline View Component (FU-303)
 * 
 * Chronological display of timeline events with filtering
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, ExternalLink, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
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

interface TimelineViewProps {
  onNavigateToSource?: (sourceId: string) => void;
  onNavigateToEntity?: (entityId: string) => void;
}

export function TimelineView({ onNavigateToSource, onNavigateToEntity }: TimelineViewProps) {
  const [fetchedEvents, setFetchedEvents] = useState<TimelineEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEventType, setSelectedEventType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();

  // Prefer session token, fallback to keys token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  // Fetch timeline events
  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    async function fetchTimeline() {
      setLoading(true);
      try {
        const api = getApiClient(bearerToken);
        const { data, error } = await api.GET("/timeline", {
          params: {
            query: {
              limit,
              offset,
              start_date: startDate || undefined,
              end_date: endDate || undefined,
              event_type: selectedEventType || undefined,
              user_id: user?.id || undefined,
            },
          },
        });

        if (error) {
          throw new Error("Failed to fetch timeline events");
        }
        
        setFetchedEvents(data.events || []);
        setTotalCount(data.total || 0);
        
        // Extract unique event types
        const types = Array.from(
          new Set((data.events || []).map((e: TimelineEvent) => e.event_type))
        ).sort();
        setEventTypes(types);
      } catch (error) {
        console.error("Failed to fetch timeline:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTimeline();
  }, [startDate, endDate, selectedEventType, offset, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription
  const events = useRealtimeTimeline(fetchedEvents, {
    onInsert: (event) => {
      console.log("New timeline event:", event);
    },
  });

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Timeline Filters
          </CardTitle>
          <CardDescription>Filter events by date range and type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Event Type</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full">
                    {selectedEventType || "All Event Types"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Filter by event type</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selectedEventType}
                    onValueChange={(value) => {
                      setSelectedEventType(value);
                      setOffset(0);
                    }}
                  >
                    <DropdownMenuRadioItem value="">All Types</DropdownMenuRadioItem>
                    {eventTypes.map((type) => (
                      <DropdownMenuRadioItem key={type} value={type}>
                        {type}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {(startDate || endDate || selectedEventType) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setSelectedEventType("");
                setOffset(0);
              }}
            >
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Event Count */}
      <div className="text-sm text-muted-foreground px-2">
        {totalCount} event{totalCount === 1 ? "" : "s"}
      </div>

      {/* Events List */}
      <div className="flex-1 space-y-3 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No events found</p>
              {(startDate || endDate || selectedEventType) && (
                <p className="text-sm mt-2">Try adjusting your filters</p>
              )}
            </div>
          </div>
        ) : (
          events.map((event) => (
            <Card key={event.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{event.event_type}</Badge>
                      {event.extracted_from_field && (
                        <span className="text-xs text-muted-foreground">
                          from: {event.extracted_from_field}
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-lg mt-2">
                      {new Date(event.event_timestamp).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Entity References */}
                {Object.keys(event.entity_refs).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Related Entities</h4>
                    <div className="space-y-1">
                      {Object.entries(event.entity_refs).map(([role, entityId]) => (
                        <div key={role} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{role}:</span>
                          <code className="text-xs">{entityId.substring(0, 16)}...</code>
                          {onNavigateToEntity && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => onNavigateToEntity(entityId)}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source Link */}
                {event.source_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Source:</span>
                    <code className="text-xs">{event.source_id.substring(0, 16)}...</code>
                    {onNavigateToSource && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => onNavigateToSource(event.source_id!)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}

                {/* Event ID */}
                <div className="text-xs text-muted-foreground">
                  ID: <code>{event.id}</code>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center pt-2 border-t">
        <Button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Showing {offset + 1}-{Math.min(offset + limit, totalCount)} of {totalCount}
        </span>
        <Button
          onClick={() => setOffset(offset + limit)}
          disabled={offset + limit >= totalCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
