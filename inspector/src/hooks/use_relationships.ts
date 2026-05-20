import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listRelationships, getRelationshipSnapshot } from "@/api/endpoints/relationships";

export function useRelationships() {
  return useQuery({
    queryKey: ["relationships"],
    queryFn: listRelationships,
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useRelationshipSnapshot(type: string | undefined, sourceId: string | undefined, targetId: string | undefined) {
  return useQuery({
    queryKey: ["relationship-snapshot", type, sourceId, targetId],
    queryFn: () => getRelationshipSnapshot(type!, sourceId!, targetId!),
    enabled: isApiUrlConfigured() && !!type && !!sourceId && !!targetId,
  });
}
