import { useEffect, useState } from "react";
import { useRealtime } from "../contexts/RealtimeContext";
import { useAuth } from "../contexts/AuthContext";
import type { Relationship } from "../types";

export function useRealtimeRelationships(
  initialRelationships: Relationship[],
  options?: {
    relationshipType?: string;
    onInsert?: (relationship: Relationship) => void;
    onUpdate?: (relationship: Relationship) => void;
    onDelete?: (relationshipId: string) => void;
  }
) {
  const [relationships, setRelationships] = useState<Relationship[]>(initialRelationships);
  const { subscribe } = useRealtime();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const filter = options?.relationshipType
      ? `relationship_type=eq.${options.relationshipType},user_id=eq.${user.id}`
      : `user_id=eq.${user.id}`;

    const unsubscribe = subscribe({
      table: "relationships",
      event: "*",
      filter,
      callback: (payload) => {
        const { eventType, new: newRelationship, old: oldRelationship } = payload;

        if (eventType === "INSERT") {
          setRelationships((prev) => [...prev, newRelationship as Relationship]);
          options?.onInsert?.(newRelationship as Relationship);
        } else if (eventType === "UPDATE") {
          setRelationships((prev) =>
            prev.map((r) => (r.id === newRelationship.id ? (newRelationship as Relationship) : r))
          );
          options?.onUpdate?.(newRelationship as Relationship);
        } else if (eventType === "DELETE") {
          setRelationships((prev) => prev.filter((r) => r.id !== oldRelationship.id));
          options?.onDelete?.(oldRelationship.id);
        }
      },
    });

    return unsubscribe;
  }, [user, options?.relationshipType, subscribe]);

  useEffect(() => {
    setRelationships(initialRelationships);
  }, [initialRelationships]);

  return relationships;
}
