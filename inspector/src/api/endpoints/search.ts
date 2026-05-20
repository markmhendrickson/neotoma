import { post } from "../client";
import type { Entity } from "@/types/api";

export function retrieveEntityByIdentifier(identifier: string, entityType?: string) {
  return post<{ entities: Entity[]; total: number }>("/retrieve_entity_by_identifier", {
    identifier,
    ...(entityType ? { entity_type: entityType } : {}),
  });
}
