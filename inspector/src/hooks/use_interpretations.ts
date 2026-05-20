import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listInterpretations } from "@/api/endpoints/interpretations";

export function useInterpretations(params?: { source_id?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["interpretations", params],
    queryFn: ({ signal }) => listInterpretations(params, { signal }),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
