import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getComplianceScorecard } from "@/api/endpoints/compliance";

export function useComplianceScorecard(params?: {
  since?: string;
  until?: string;
  group_by?: string;
  min_turns?: number;
  min_backfill_rate?: number;
  top_missed_steps?: number;
  include_synthetic?: boolean;
}) {
  return useQuery({
    queryKey: ["compliance_scorecard", params],
    queryFn: () => getComplianceScorecard(params),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
