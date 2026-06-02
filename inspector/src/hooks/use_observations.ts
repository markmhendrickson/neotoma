import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { queryObservations } from "@/api/endpoints/observations";
import type { ObservationsQueryParams } from "@/types/api";

export function useObservationsQuery(params: ObservationsQueryParams) {
  return useQuery({
    queryKey: ["observations", params],
    queryFn: ({ signal }) => queryObservations(params, { signal }),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
