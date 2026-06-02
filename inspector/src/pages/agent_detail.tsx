/**
 * Agent detail view.
 *
 * Header: identity card (tier, label, verified keys, first/last seen).
 * Body:   per-record-type counts + a scrollable feed of this agent's
 *         writes (reusing `RecentRecordsFeed` for parity with the
 *         global activity view).
 */

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "@/components/layout/page_shell";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentBadge } from "@/components/shared/agent_badge";
import { AttestationEnvelopePanel } from "@/components/shared/attestation_envelope_panel";
import { RecentRecordsFeed } from "@/components/shared/recent_records_feed";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { useAgent, useAgentRecords } from "@/hooks/use_agents";
import type { RecordActivityType } from "@/types/api";
import { ArrowLeft, KeyRound } from "lucide-react";

const PAGE_SIZE = 50;

const RECORD_TYPES: ReadonlyArray<{ key: RecordActivityType; label: string }> = [
  { key: "observation", label: "Observations" },
  { key: "source", label: "Sources" },
  { key: "relationship", label: "Relationships" },
  { key: "interpretation", label: "Interpretations" },
  { key: "timeline_event", label: "Timeline events" },
];

export default function AgentDetailPage() {
  const { key } = useParams<{ key: string }>();
  const agentKey = key ?? "";
  const agentQ = useAgent(agentKey);
  const [offset, setOffset] = useState(0);
  const recordsQ = useAgentRecords(agentKey, { limit: PAGE_SIZE, offset });

  const attribution = useMemo(() => {
    const a = agentQ.data?.agent;
    if (!a) return null;
    return {
      attribution_tier: a.tier,
      client_name: a.client_name ?? undefined,
      client_version: a.client_version ?? undefined,
      agent_sub: a.agent_sub ?? undefined,
      agent_iss: a.agent_iss ?? undefined,
      agent_algorithm: a.agent_algorithm ?? undefined,
      agent_thumbprint: a.agent_thumbprint ?? undefined,
      agent_public_key: a.agent_public_key ?? undefined,
      attestation: a.attestation ?? null,
      operator_allowlist_source: a.operator_allowlist_source ?? null,
    };
  }, [agentQ.data]);

  if (showInitialQuerySkeleton(agentQ)) {
    return (
      <PageShell title="Agent">
        <ListSkeleton rows={5} />
      </PageShell>
    );
  }

  if (agentQ.error) {
    return (
      <PageShell title="Agent">
        <QueryErrorAlert title="Could not load agent">{agentQ.error.message}</QueryErrorAlert>
      </PageShell>
    );
  }

  if (!agentQ.data) {
    return (
      <PageShell title="Agent">
        <div className="text-muted-foreground">No agent data.</div>
      </PageShell>
    );
  }

  const agent = agentQ.data.agent;
  const items = recordsQ.data?.items ?? [];
  const hasMore = recordsQ.data?.has_more ?? false;

  const identityRows: Array<[string, string | null | undefined]> = [
    ["Agent key", agent.agent_key],
    ["Client", agent.client_name],
    ["Client version", agent.client_version],
    ["Subject (sub)", agent.agent_sub],
    ["Issuer (iss)", agent.agent_iss],
    ["Algorithm", agent.agent_algorithm],
    ["Thumbprint", agent.agent_thumbprint],
    ["Public key", agent.agent_public_key],
  ];

  return (
    <PageShell
      title={agent.label}
      description={
        <span>
          Agent detail view — writes stamped with this identity across
          observations, sources, relationships, interpretations, and
          timeline events.
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showBackgroundQueryRefresh(agentQ) || showBackgroundQueryRefresh(recordsQ) ? (
            <QueryRefreshIndicator />
          ) : null}
          {(() => {
            const params = new URLSearchParams();
            params.set("promote", "1");
            if (agent.label) params.set("label", agent.label);
            if (agent.agent_sub) params.set("sub", agent.agent_sub);
            if (agent.agent_iss) params.set("iss", agent.agent_iss);
            if (agent.agent_thumbprint)
              params.set("thumbprint", agent.agent_thumbprint);
            const canPromote = Boolean(
              agent.agent_sub || agent.agent_thumbprint,
            );
            return canPromote ? (
              <Button asChild variant="default" size="sm">
                <Link to={`/agents/grants?${params.toString()}`}>
                  <KeyRound className="mr-1 h-4 w-4" />
                  Promote to grant
                </Link>
              </Button>
            ) : null;
          })()}
          <Button asChild variant="ghost" size="sm">
            <Link to="/agents">
              <ArrowLeft className="mr-1 h-4 w-4" />
              All agents
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Identity</CardTitle>
            {attribution && <AgentBadge attribution={attribution} />}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              {identityRows
                .filter(([, value]) => !!value)
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-all font-mono">{value}</dd>
                  </div>
                ))}
              <div className="contents">
                <dt className="text-muted-foreground">First seen</dt>
                <dd>{formatDate(agent.first_seen_at ?? undefined)}</dd>
              </div>
              <div className="contents">
                <dt className="text-muted-foreground">Last seen</dt>
                <dd>{formatDate(agent.last_seen_at ?? undefined)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record counts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <Badge variant="secondary">{agent.total_records}</Badge>
              </li>
              {RECORD_TYPES.map(({ key: type, label }) => (
                <li key={type} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <Badge variant="outline">
                    {agent.record_counts[type] ?? 0}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <AttestationEnvelopePanel
        attestation={agent.attestation ?? null}
        operatorAllowlistSource={agent.operator_allowlist_source ?? null}
      />

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showInitialQuerySkeleton(recordsQ) ? (
            <ListSkeleton rows={6} />
          ) : recordsQ.error ? (
            <QueryErrorAlert title="Could not load records">{recordsQ.error.message}</QueryErrorAlert>
          ) : (
            <>
              <RecentRecordsFeed
                items={items}
                emptyMessage="No records attributed to this agent."
              />
              {(offset > 0 || hasMore) && (
                <Pagination className="mx-0 w-full justify-between">
                  <PaginationContent className="flex w-full flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {items.length === 0
                        ? "No rows on this page."
                        : `Showing ${offset + 1}–${offset + items.length}`}
                    </p>
                    <div className="flex items-center gap-1">
                      <PaginationItem>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <PaginationPrevious
                                size="icon"
                                disabled={offset === 0}
                                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Newer records</TooltipContent>
                        </Tooltip>
                      </PaginationItem>
                      <PaginationItem>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <PaginationNext
                                size="icon"
                                disabled={!hasMore}
                                onClick={() => setOffset(offset + PAGE_SIZE)}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Older records</TooltipContent>
                        </Tooltip>
                      </PaginationItem>
                    </div>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
