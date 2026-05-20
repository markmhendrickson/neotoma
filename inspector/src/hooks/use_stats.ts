import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getStats } from "@/api/endpoints/stats";

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
