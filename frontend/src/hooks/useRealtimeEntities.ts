import { useEffect, useState } from "react";
import { useRealtime } from "../contexts/RealtimeContext";
import { useAuth } from "../contexts/AuthContext";
import type { Entity } from "../types";

export function useRealtimeEntities(
  initialEntities: Entity[],
  options?: {
    entityType?: string;
    onInsert?: (entity: Entity) => void;
    onUpdate?: (entity: Entity) => void;
    onDelete?: (entityId: string) => void;
  }
) {
  const [entities, setEntities] = useState<Entity[]>(initialEntities);
  const { subscribe } = useRealtime();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const filter = options?.entityType
      ? `entity_type=eq.${options.entityType},user_id=eq.${user.id}`
      : `user_id=eq.${user.id}`;

    const unsubscribe = subscribe({
      table: "entities",
      event: "*",
      filter,
      callback: (payload) => {
        const { eventType, new: newEntity, old: oldEntity } = payload;

        if (eventType === "INSERT") {
          setEntities((prev) => [...prev, newEntity as Entity]);
          options?.onInsert?.(newEntity as Entity);
        } else if (eventType === "UPDATE") {
          setEntities((prev) =>
            prev.map((e) => (e.id === newEntity.id ? (newEntity as Entity) : e))
          );
          options?.onUpdate?.(newEntity as Entity);
        } else if (eventType === "DELETE") {
          setEntities((prev) => prev.filter((e) => e.id !== oldEntity.id));
          options?.onDelete?.(oldEntity.id);
        }
      },
    });

    return unsubscribe;
  }, [user, options?.entityType, subscribe]);

  useEffect(() => {
    setEntities(initialEntities);
  }, [initialEntities]);

  return entities;
}
