/**
 * Reusable "Agent" filter control for Inspector list pages.
 *
 * Renders a `<select>` populated with every distinct attribution key seen
 * in the current page of rows, plus a pseudo-entry for each tier
 * ("Hardware", "Software", "Self-reported", "Anonymous"). Filtering is
 * client-side: Phase 1 does not yet have backend filter support, so we
 * only narrow the already-loaded page. This is good enough while most
 * deployments have one or two agents.
 *
 * Usage:
 *
 *   const { filter, setFilter, filterRows, AgentFilterControl } =
 *     useAgentAttributionFilter(rows);
 *   const displayed = filterRows(rows);
 *
 * Each row is inspected via a `provenance` accessor so the same filter
 * works across observations, relationships, sources, timeline events, and
 * interpretations.
 */

import { useMemo, useState } from "react";
import {
  extractAgentAttribution,
  getAttributionKey,
  getAttributionLabel,
} from "./agent_badge";
import type { AgentAttributionTier } from "@/types/api";

export type AgentFilterValue =
  | { kind: "all" }
  | { kind: "tier"; tier: AgentAttributionTier }
  | { kind: "agent"; key: string; label: string };

/**
 * Pull the attribution-bearing blob off a row regardless of type.
 *
 * Row types differ in where they carry agent attribution:
 * - Relationships expose it via the dedicated `agent_attribution` field,
 *   because `provenance` is reducer provenance (field → observation_id).
 * - Observations / sources / timeline events / interpretations stamp
 *   attribution directly into their existing `provenance` blob.
 *
 * Prefer `agent_attribution` when present; fall back to `provenance` so we
 * keep working on row types that stamp attribution inline.
 */
function rowProvenance(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { agent_attribution?: unknown; provenance?: unknown };
  if (
    r.agent_attribution &&
    typeof r.agent_attribution === "object" &&
    !Array.isArray(r.agent_attribution)
  ) {
    return r.agent_attribution as Record<string, unknown>;
  }
  return r.provenance &&
    typeof r.provenance === "object" &&
    !Array.isArray(r.provenance)
    ? (r.provenance as Record<string, unknown>)
    : null;
}

export interface UseAgentFilterResult<T> {
  filter: AgentFilterValue;
  setFilter: (value: AgentFilterValue) => void;
  filterRows: (rows: T[]) => T[];
  AgentFilterControl: React.FC<{ className?: string }>;
}

export function useAgentAttributionFilter<T>(
  rows: readonly T[] | undefined
): UseAgentFilterResult<T> {
  const [filter, setFilter] = useState<AgentFilterValue>({ kind: "all" });

  const agents = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const row of rows ?? []) {
      const attribution = extractAgentAttribution(rowProvenance(row));
      const key = getAttributionKey(attribution);
      if (!key) continue;
      const label = getAttributionLabel(attribution);
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { label, count: 1 });
    }
    return [...byKey.entries()]
      .map(([key, meta]) => ({ key, label: meta.label, count: meta.count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  function filterRows(input: T[]): T[] {
    if (filter.kind === "all") return input;
    return input.filter((row) => {
      const attribution = extractAgentAttribution(rowProvenance(row));
      if (filter.kind === "tier") {
        const tier: AgentAttributionTier =
          attribution?.attribution_tier ?? "anonymous";
        return tier === filter.tier;
      }
      const key = getAttributionKey(attribution);
      return key === filter.key;
    });
  }

  const AgentFilterControl: React.FC<{ className?: string }> = ({
    className,
  }) => {
    const currentValue =
      filter.kind === "all"
        ? "all"
        : filter.kind === "tier"
          ? `tier:${filter.tier}`
          : `agent:${filter.key}`;

    return (
      <div className={"flex flex-col gap-1.5 " + (className ?? "")}>
        <label
          htmlFor="agent-filter"
          className="text-xs font-medium text-muted-foreground"
        >
          Agent
        </label>
        <select
          id="agent-filter"
          value={currentValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "all") {
              setFilter({ kind: "all" });
            } else if (v.startsWith("tier:")) {
              setFilter({
                kind: "tier",
                tier: v.slice(5) as AgentAttributionTier,
              });
            } else if (v.startsWith("agent:")) {
              const key = v.slice(6);
              const agent = agents.find((a) => a.key === key);
              setFilter({
                kind: "agent",
                key,
                label: agent?.label ?? key,
              });
            }
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All agents</option>
          <optgroup label="By trust tier">
            <option value="tier:hardware">◆ Hardware-verified</option>
            <option value="tier:software">◇ Software-verified</option>
            <option value="tier:unverified_client">● Self-reported</option>
            <option value="tier:anonymous">○ Anonymous</option>
          </optgroup>
          {agents.length > 0 && (
            <optgroup label="By agent (this page)">
              {agents.map((a) => (
                <option key={a.key} value={`agent:${a.key}`}>
                  {a.label} ({a.count})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    );
  };

  return { filter, setFilter, filterRows, AgentFilterControl };
}
