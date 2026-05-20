/**
 * Agents directory.
 *
 * Lists every distinct writer that has stamped `AgentAttribution`
 * provenance across the write-path tables. Clicking a row opens the
 * agent detail view at `/agents/:key`.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { PageShell } from "@/components/layout/page_shell";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { AgentAdmissionGrantsCell } from "@/components/shared/agent_admission_grants_cell";
import { AgentBadge } from "@/components/shared/agent_badge";
import { AgentObservationUsageCell } from "@/components/shared/agent_observation_usage_cell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { useAgentGrants, useAgents } from "@/hooks/use_agents";
import {
  formatAgentGrantCapabilitiesLine,
  grantDerivedAgentKey,
  grantsMatchingAgentKey,
} from "@/lib/agent_grant_key";
import type { AgentDirectoryEntry, AgentGrant, RecordActivityType } from "@/types/api";

function countLabel(
  counts: AgentDirectoryEntry["record_counts"],
  key: RecordActivityType,
): string {
  return String(counts[key] ?? 0);
}

export default function AgentsPage() {
  const [query, setQuery] = useState("");
  const agentsQ = useAgents();
  const grantsQ = useAgentGrants({ status: "all" });

  const knownAgentKeys = useMemo(
    () => new Set((agentsQ.data?.agents ?? []).map((a) => a.agent_key)),
    [agentsQ.data],
  );

  const grants: AgentGrant[] = grantsQ.data?.grants ?? [];

  const filtered = useMemo(() => {
    const items = agentsQ.data?.agents ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => {
      const entityTypes = Object.keys(a.observation_entity_type_counts ?? {});
      const grantLabels = grantsMatchingAgentKey(grants, a.agent_key).map((g) => g.label);
      const tokens = [
        a.label,
        a.agent_thumbprint,
        a.agent_sub,
        a.client_name,
        a.client_version,
        a.agent_iss,
        a.agent_key,
        ...entityTypes,
        ...grantLabels,
      ].filter(Boolean) as string[];
      return tokens.some((v) => v.toLowerCase().includes(q));
    });
  }, [agentsQ.data, grants, query]);

  const columns: ColumnDef<AgentDirectoryEntry, unknown>[] = [
    {
      header: "Agent",
      id: "agent",
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex items-center gap-2">
            <AgentBadge
              attribution={{
                attribution_tier: a.tier,
                client_name: a.client_name ?? undefined,
                client_version: a.client_version ?? undefined,
                agent_sub: a.agent_sub ?? undefined,
                agent_iss: a.agent_iss ?? undefined,
                agent_algorithm: a.agent_algorithm ?? undefined,
                agent_thumbprint: a.agent_thumbprint ?? undefined,
                agent_public_key: a.agent_public_key ?? undefined,
              }}
            />
            <Link
              to={`/agents/${encodeURIComponent(a.agent_key)}`}
              className="font-medium text-foreground hover:underline"
            >
              {a.label}
            </Link>
          </div>
        );
      },
    },
    {
      header: "Tier",
      accessorKey: "tier",
      cell: ({ getValue }) => <Badge variant="secondary">{getValue() as string}</Badge>,
    },
    {
      header: () => (
        <span className="block max-w-[9rem] leading-tight">
          Writes by type
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            Observations → entity_type
          </span>
        </span>
      ),
      id: "entity_usage",
      cell: ({ row }) => <AgentObservationUsageCell agent={row.original} />,
    },
    {
      header: () => (
        <span className="block max-w-[9rem] leading-tight">
          Admission grants
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            Permissions (ops / types)
          </span>
        </span>
      ),
      id: "admission_grants",
      cell: ({ row }) => (
        <AgentAdmissionGrantsCell agentKey={row.original.agent_key} grants={grants} />
      ),
    },
    { header: "Total", accessorKey: "total_records" },
    {
      header: "Obs",
      id: "obs",
      cell: ({ row }) => countLabel(row.original.record_counts, "observation"),
    },
    {
      header: "Sources",
      id: "sources",
      cell: ({ row }) => countLabel(row.original.record_counts, "source"),
    },
    {
      header: "Rels",
      id: "rels",
      cell: ({ row }) => countLabel(row.original.record_counts, "relationship"),
    },
    {
      header: "Interp",
      id: "interp",
      cell: ({ row }) =>
        countLabel(row.original.record_counts, "interpretation"),
    },
    {
      header: "Timeline",
      id: "timeline",
      cell: ({ row }) =>
        countLabel(row.original.record_counts, "timeline_event"),
    },
    {
      header: "First seen",
      accessorKey: "first_seen_at",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      header: "Last seen",
      accessorKey: "last_seen_at",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
  ];

  return (
    <PageShell
      title="Agents"
      description="Distinct writers from AAuth / clientInfo provenance. Writes by type = observation volume grouped by the target entity's entity_type (activity). Admission grants = capabilities bound to that identity (permission); the panel below is the same grant list in full."
      actions={
        showBackgroundQueryRefresh(agentsQ) || showBackgroundQueryRefresh(grantsQ) ? (
          <QueryRefreshIndicator />
        ) : undefined
      }
    >
      {grants.length > 0 ? (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <h2 className="text-sm font-semibold">Admission grants (permissioned operations)</h2>
          <p className="text-xs text-muted-foreground">
            Each grant binds an identity (thumbprint or JWT subject) to allowed MCP-style operations
            (e.g. <code className="text-xs">store</code> on <code className="text-xs">agent_grant</code>
            ). Open the matching agent row to see their full write history.
          </p>
          <ul className="divide-y divide-border rounded-md border border-border bg-background text-sm">
            {grants.map((g) => {
              const key = grantDerivedAgentKey(g);
              const hasRow = key !== "anonymous" && knownAgentKeys.has(key);
              return (
                <li key={g.grant_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                  <span className="font-medium">{g.label}</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    {g.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono truncate max-w-[min(100%,280px)]">
                    {g.match_thumbprint
                      ? `thumb:${g.match_thumbprint}`
                      : g.match_sub
                        ? `sub:${g.match_sub}${g.match_iss ? ` @ ${g.match_iss}` : ""}`
                        : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-auto">
                    {formatAgentGrantCapabilitiesLine(g)}
                  </span>
                  {hasRow ? (
                    <Link
                      to={`/agents/${encodeURIComponent(key)}`}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Agent directory →
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : grantsQ.isSuccess ? (
        <p className="mb-4 text-xs text-muted-foreground">
          No admission grants configured. The Admission grants column will be empty; Writes by type
          still shows observation activity (including on <code>agent_grant</code> entities if any).
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search by name, subject, thumbprint…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-[320px]"
        />
        {agentsQ.data && (
          <p className="text-sm text-muted-foreground">
            {agentsQ.data.total} agent{agentsQ.data.total === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {showInitialQuerySkeleton(agentsQ) ? (
        <DataTableSkeleton rows={12} cols={11} />
      ) : agentsQ.error ? (
        <QueryErrorAlert title="Could not load agents">{agentsQ.error.message}</QueryErrorAlert>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}
    </PageShell>
  );
}
