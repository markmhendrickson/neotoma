/**
 * Attribution coverage summary shown on the Settings page.
 *
 * Phase 1 has no dedicated `/stats?group=attribution_tier` endpoint, so we
 * compute the rollup client-side from a recent batch of observations,
 * relationships, sources, timeline events, and interpretations. This gives
 * a useful at-a-glance picture even before the backend caches the summary.
 *
 * The component renders:
 * - Total rows sampled.
 * - One bar per trust tier (hardware / operator_attested / software /
 *   unverified_client / anonymous).
 * - A distinct-agent count (by thumbprint or client name).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { queryObservations } from "@/api/endpoints/observations";
import { listRelationships } from "@/api/endpoints/relationships";
import { listSources } from "@/api/endpoints/sources";
import { listTimeline } from "@/api/endpoints/timeline";
import { listInterpretations } from "@/api/endpoints/interpretations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineSkeleton } from "@/components/shared/query_status";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentBadge } from "./agent_badge";
import {
  extractAgentAttribution,
  getAttributionKey,
  getAttributionLabel,
} from "./agent_badge";
import type {
  AgentAttribution,
  AgentAttributionTier,
} from "@/types/api";

const SAMPLE_LIMIT = 200;

type RowWithProvenance = {
  provenance?: Record<string, unknown> | null;
  /**
   * Relationships expose AAuth attribution on a dedicated top-level field
   * because `provenance` there is reducer-only (field → observation_id).
   */
  agent_attribution?: Record<string, unknown> | null;
};

interface TierStats {
  total: number;
  by_tier: Record<AgentAttributionTier, number>;
  distinct_agents: Map<string, { label: string; tier: AgentAttributionTier; count: number }>;
}

function emptyStats(): TierStats {
  return {
    total: 0,
    by_tier: {
      hardware: 0,
      operator_attested: 0,
      software: 0,
      unverified_client: 0,
      anonymous: 0,
    },
    distinct_agents: new Map(),
  };
}

function accumulate(stats: TierStats, rows: RowWithProvenance[]): TierStats {
  for (const row of rows) {
    stats.total += 1;
    const attribution = extractAgentAttribution(
      row.agent_attribution ?? row.provenance ?? null
    );
    const tier: AgentAttributionTier =
      attribution?.attribution_tier ?? "anonymous";
    stats.by_tier[tier] += 1;

    const key = getAttributionKey(attribution);
    if (key) {
      const label = getAttributionLabel(attribution);
      const existing = stats.distinct_agents.get(key);
      if (existing) existing.count += 1;
      else stats.distinct_agents.set(key, { label, tier, count: 1 });
    }
  }
  return stats;
}

export function AttributionSummary() {
  const obs = useQuery({
    queryKey: ["attribution-summary", "observations"],
    queryFn: () => queryObservations({ limit: SAMPLE_LIMIT }),
    staleTime: 60_000,
    enabled: isApiUrlConfigured(),
  });
  const rels = useQuery({
    queryKey: ["attribution-summary", "relationships"],
    queryFn: () => listRelationships(),
    staleTime: 60_000,
    enabled: isApiUrlConfigured(),
  });
  const srcs = useQuery({
    queryKey: ["attribution-summary", "sources"],
    queryFn: () => listSources({ limit: SAMPLE_LIMIT }),
    staleTime: 60_000,
    enabled: isApiUrlConfigured(),
  });
  const tl = useQuery({
    queryKey: ["attribution-summary", "timeline"],
    queryFn: () => listTimeline({ limit: SAMPLE_LIMIT }),
    staleTime: 60_000,
    enabled: isApiUrlConfigured(),
  });
  const interps = useQuery({
    queryKey: ["attribution-summary", "interpretations"],
    queryFn: () => listInterpretations({ limit: SAMPLE_LIMIT }),
    staleTime: 60_000,
    enabled: isApiUrlConfigured(),
  });

  const summary = useMemo(() => {
    const stats = emptyStats();
    if (obs.data?.observations) accumulate(stats, obs.data.observations as RowWithProvenance[]);
    if (rels.data?.relationships) accumulate(stats, rels.data.relationships as RowWithProvenance[]);
    if (srcs.data?.sources) accumulate(stats, srcs.data.sources as RowWithProvenance[]);
    if (tl.data?.events) accumulate(stats, tl.data.events as RowWithProvenance[]);
    if (interps.data?.interpretations)
      accumulate(stats, interps.data.interpretations as RowWithProvenance[]);
    return stats;
  }, [obs.data, rels.data, srcs.data, tl.data, interps.data]);

  const initialLoading =
    showInitialQuerySkeleton(obs) ||
    showInitialQuerySkeleton(rels) ||
    showInitialQuerySkeleton(srcs) ||
    showInitialQuerySkeleton(tl) ||
    showInitialQuerySkeleton(interps);

  const attributionRefreshing =
    showBackgroundQueryRefresh(obs) ||
    showBackgroundQueryRefresh(rels) ||
    showBackgroundQueryRefresh(srcs) ||
    showBackgroundQueryRefresh(tl) ||
    showBackgroundQueryRefresh(interps);

  const topAgents = useMemo(() => {
    return [...summary.distinct_agents.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [summary]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Attribution Coverage</CardTitle>
          {attributionRefreshing ? <QueryRefreshIndicator /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {initialLoading && summary.total === 0 ? (
          <div className="space-y-2">
            <InlineSkeleton className="h-4 w-full max-w-xs" />
            <InlineSkeleton className="h-4 w-full max-w-sm" />
            <InlineSkeleton className="h-4 w-full max-w-md" />
          </div>
        ) : summary.total === 0 ? (
          <span className="text-muted-foreground">
            No rows yet. Attribution appears once writes are made.
          </span>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rows sampled</span>
              <span className="font-medium">{summary.total.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <TierBar
                tier="hardware"
                count={summary.by_tier.hardware}
                total={summary.total}
              />
              <TierBar
                tier="operator_attested"
                count={summary.by_tier.operator_attested}
                total={summary.total}
              />
              <TierBar
                tier="software"
                count={summary.by_tier.software}
                total={summary.total}
              />
              <TierBar
                tier="unverified_client"
                count={summary.by_tier.unverified_client}
                total={summary.total}
              />
              <TierBar
                tier="anonymous"
                count={summary.by_tier.anonymous}
                total={summary.total}
              />
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">Distinct agents</span>
              <span className="font-medium">
                {summary.distinct_agents.size}
              </span>
            </div>
            {topAgents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Top agents (by write volume)
                </p>
                <ul className="space-y-1">
                  {topAgents.map((a) => (
                    <li
                      key={a.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <AgentBadge
                        attribution={fakeAttribution(a.label, a.tier)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {a.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Sampled from the most recent {SAMPLE_LIMIT} rows of each record
              type. A dedicated backend rollup is planned.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Long-form tier meanings (aligned with {@link AgentBadge} tooltips). */
const TIER_DESCRIPTION: Record<AgentAttributionTier, string> = {
  hardware:
    "AAuth-verified writes whose key is cryptographically attested to live in a hardware root of trust (for example Secure Enclave, TPM, or a security key).",
  operator_attested:
    "AAuth-verified writes whose issuer (or issuer:subject) is in the operator-managed allowlist; trust is operator-vouched, not hardware-attested.",
  software: "AAuth-verified writes stamped with a software-only cryptographic key.",
  unverified_client:
    "Writes attributed from MCP initialize clientInfo (name and version). Self-reported, not cryptographically verified.",
  anonymous:
    "Writes with no meaningful agent identity (no AAuth stamp and no usable clientInfo).",
};

function TierBar({
  tier,
  count,
  total,
}: {
  tier: AgentAttributionTier;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const color: Record<AgentAttributionTier, string> = {
    hardware: "bg-emerald-500",
    operator_attested: "bg-teal-500",
    software: "bg-sky-500",
    unverified_client: "bg-amber-500",
    anonymous: "bg-zinc-400",
  };
  const label: Record<AgentAttributionTier, string> = {
    hardware: "Hardware-verified",
    operator_attested: "Operator-attested",
    software: "Software-verified",
    unverified_client: "Self-reported",
    anonymous: "Anonymous",
  };
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help border-b border-dotted border-muted-foreground/50 text-muted-foreground">
              {label[tier]}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs text-left">
            <p className="text-xs leading-snug">{TIER_DESCRIPTION[tier]}</p>
          </TooltipContent>
        </Tooltip>
        <span className="font-mono">
          {count.toLocaleString()} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={"h-full " + color[tier]}
          style={{ width: `${pct.toFixed(2)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Reconstruct a minimal {@link AgentAttribution} for rendering the agent
 * pill given a label + tier. We do not carry the full identity into the
 * rollup (it would require a second pass), and this is enough for the
 * Settings summary.
 */
function fakeAttribution(
  label: string,
  tier: AgentAttributionTier
): AgentAttribution {
  if (tier === "anonymous") {
    return { attribution_tier: tier };
  }
  if (tier === "unverified_client") {
    return { attribution_tier: tier, client_name: label };
  }
  // hardware / operator_attested / software — prefer parsing back out of
  // the label so the AgentBadge can re-render the same tooltip rows.
  if (label.startsWith("key:")) {
    return { attribution_tier: tier, agent_thumbprint: label.slice(4) };
  }
  return { attribution_tier: tier, agent_sub: label };
}
