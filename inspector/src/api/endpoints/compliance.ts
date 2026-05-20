import { get } from "../client";

export interface ComplianceCell {
  model: string;
  harness: string;
  profile: string;
  total_turns: number;
  backfilled_turns: number;
  backfill_rate: number;
  estimated_turns: number;
  estimated: boolean;
  daily_total: Record<string, number>;
  daily_backfill_rate: Record<string, number>;
  top_missed_steps: Array<{ step: string; count: number }>;
}

export interface ComplianceScorecard {
  generated_at: string;
  window: { since: string | null; until: string | null };
  group_by: string;
  cells: ComplianceCell[];
  summary: {
    total_turns: number;
    backfilled_turns: number;
    backfill_rate: number;
    estimated_turns: number;
    cell_count: number;
    top_missed_steps: Array<{ step: string; count: number }>;
  };
  estimated: boolean;
}

export function getComplianceScorecard(params?: {
  since?: string;
  until?: string;
  group_by?: string;
  min_turns?: number;
  min_backfill_rate?: number;
  top_missed_steps?: number;
  include_synthetic?: boolean;
}) {
  return get<ComplianceScorecard>(
    "/admin/compliance/scorecard",
    params as Record<string, string | number | undefined>,
  );
}
