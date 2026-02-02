import { useEffect, useState } from "react";
import { useRealtime } from "../contexts/RealtimeContext";
import { useAuth } from "../contexts/AuthContext";
import type { Source } from "../types";

export function useRealtimeSources(
  initialSources: Source[],
  options?: {
    onInsert?: (source: Source) => void;
    onUpdate?: (source: Source) => void;
    onDelete?: (sourceId: string) => void;
  }
) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const { subscribe } = useRealtime();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const filter = `user_id=eq.${user.id}`;

    const unsubscribe = subscribe({
      table: "sources",
      event: "*",
      filter,
      callback: (payload) => {
        const { eventType, new: newSource, old: oldSource } = payload;

        if (eventType === "INSERT") {
          setSources((prev) => [...prev, newSource as Source]);
          options?.onInsert?.(newSource as Source);
        } else if (eventType === "UPDATE") {
          setSources((prev) =>
            prev.map((s) => (s.id === newSource.id ? (newSource as Source) : s))
          );
          options?.onUpdate?.(newSource as Source);
        } else if (eventType === "DELETE") {
          setSources((prev) => prev.filter((s) => s.id !== oldSource.id));
          options?.onDelete?.(oldSource.id);
        }
      },
    });

    return unsubscribe;
  }, [user, subscribe]);

  useEffect(() => {
    setSources(initialSources);
  }, [initialSources]);

  return sources;
}
