import { useEffect, useState } from "react";
import { useRealtime } from "../contexts/RealtimeContext";
import { useAuth } from "../contexts/AuthContext";
import type { TimelineEvent } from "../types";

export function useRealtimeTimeline(
  initialEvents: TimelineEvent[],
  options?: {
    onInsert?: (event: TimelineEvent) => void;
    onUpdate?: (event: TimelineEvent) => void;
    onDelete?: (eventId: string) => void;
  }
) {
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const { subscribe } = useRealtime();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const filter = `user_id=eq.${user.id}`;

    const unsubscribe = subscribe({
      table: "timeline_events",
      event: "*",
      filter,
      callback: (payload) => {
        const { eventType, new: newEvent, old: oldEvent } = payload;

        if (eventType === "INSERT") {
          setEvents((prev) => [newEvent as TimelineEvent, ...prev]);
          options?.onInsert?.(newEvent as TimelineEvent);
        } else if (eventType === "UPDATE") {
          setEvents((prev) =>
            prev.map((e) => (e.id === newEvent.id ? (newEvent as TimelineEvent) : e))
          );
          options?.onUpdate?.(newEvent as TimelineEvent);
        } else if (eventType === "DELETE") {
          setEvents((prev) => prev.filter((e) => e.id !== oldEvent.id));
          options?.onDelete?.(oldEvent.id);
        }
      },
    });

    return unsubscribe;
  }, [user, subscribe]);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  return events;
}
