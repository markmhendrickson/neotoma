import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import {
  listRelationships,
  getRelationshipSnapshot,
  listRelationshipTypes,
} from "@/api/endpoints/relationships";

export function useRelationships() {
  return useQuery({
    queryKey: ["relationships"],
    queryFn: ({ signal }) => listRelationships({ signal }),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useRelationshipSnapshot(type: string | undefined, sourceId: string | undefined, targetId: string | undefined) {
  return useQuery({
    queryKey: ["relationship-snapshot", type, sourceId, targetId],
    queryFn: ({ signal }) => getRelationshipSnapshot(type!, sourceId!, targetId!, { signal }),
    enabled: isApiUrlConfigured() && !!type && !!sourceId && !!targetId,
  });
}

/**
 * The relationship-type vocabulary, read from the registry rather than a
 * hardcoded constant (#1972 / G25). Callers must render the error state on
 * failure — never a static fallback list.
 */
export function useRelationshipTypes() {
  return useQuery({
    queryKey: ["relationship-types"],
    queryFn: ({ signal }) => listRelationshipTypes({ signal }),
    enabled: isApiUrlConfigured(),
  });
}
