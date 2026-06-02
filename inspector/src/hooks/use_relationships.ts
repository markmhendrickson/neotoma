import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listRelationships, getRelationshipSnapshot } from "@/api/endpoints/relationships";

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
