import { useEffect, useState } from "react";
import { useRealtime } from "../contexts/RealtimeContext";
import { useAuth } from "../contexts/AuthContext";
import type { Observation } from "../types";

export function useRealtimeObservations(
  initialObservations: Observation[],
  options?: {
    entityId?: string;
    onInsert?: (observation: Observation) => void;
    onUpdate?: (observation: Observation) => void;
    onDelete?: (observationId: string) => void;
  }
) {
  const [observations, setObservations] = useState<Observation[]>(initialObservations);
  const { subscribe } = useRealtime();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const filter = options?.entityId
      ? `entity_id=eq.${options.entityId},user_id=eq.${user.id}`
      : `user_id=eq.${user.id}`;

    const unsubscribe = subscribe({
      table: "observations",
      event: "*",
      filter,
      callback: (payload) => {
        const { eventType, new: newObservation, old: oldObservation } = payload;

        if (eventType === "INSERT") {
          setObservations((prev) => [...prev, newObservation as Observation]);
          options?.onInsert?.(newObservation as Observation);
        } else if (eventType === "UPDATE") {
          setObservations((prev) =>
            prev.map((o) => (o.id === newObservation.id ? (newObservation as Observation) : o))
          );
          options?.onUpdate?.(newObservation as Observation);
        } else if (eventType === "DELETE") {
          setObservations((prev) => prev.filter((o) => o.id !== oldObservation.id));
          options?.onDelete?.(oldObservation.id);
        }
      },
    });

    return unsubscribe;
  }, [user, options?.entityId, subscribe]);

  useEffect(() => {
    setObservations(initialObservations);
  }, [initialObservations]);

  return observations;
}
