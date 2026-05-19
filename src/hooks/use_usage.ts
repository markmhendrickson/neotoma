import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getUsage } from "@/api/endpoints/usage";

export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
