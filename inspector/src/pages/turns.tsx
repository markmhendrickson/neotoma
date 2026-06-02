import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/page_shell";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AgentBadge } from "@/components/shared/agent_badge";
import { TypeBadge } from "@/components/shared/type_badge";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { shortId } from "@/lib/humanize";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { useTurns } from "@/hooks/use_turns";
import { useAgents } from "@/hooks/use_agents";
import type { ConversationTurnSummary } from "@/types/api";

const PAGE_SIZE = 25;

const HARNESS_OPTIONS = [
  "all",
  "cursor",
  "claude-code",
  "codex-cli",
  "opencode",
  "claude-agent-sdk",
];

const STATUS_OPTIONS = [
  "all",
  "happy_path",
  "backfilled_by_hook",
];

export default function TurnsPage() {
  const [offset, setOffset] = useState(0);
  const [harness, setHarness] = useState("all");
  const [status, setStatus] = useState("all");
  const [agentKey, setAgentKey] = useState("all");

  const agentsQuery = useAgents();
  const agentsSorted = useMemo(() => {
    const list = agentsQuery.data?.agents ?? [];
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  }, [agentsQuery.data?.agents]);

  const queryParams = useMemo(() => {
    const base: {
      limit: number;
      offset: number;
      harness?: string;
      status?: string;
      agent_key?: string;
    } = { limit: PAGE_SIZE, offset };
    if (harness !== "all") base.harness = harness;
    if (status !== "all") base.status = status;
    if (agentKey !== "all") base.agent_key = agentKey;
    return base;
  }, [offset, harness, status, agentKey]);

  const turns = useTurns(queryParams);
  const items = turns.data?.items ?? [];
  const hasMore = turns.data?.has_more ?? false;

  return (
    <PageShell
      title="Turns"
      description="Per-turn telemetry accreted from Neotoma harness hooks. One row per (session_id, turn_id) — covers conversation_turn plus the legacy turn_compliance / turn_activity aliases."
      actions={showBackgroundQueryRefresh(turns) ? <QueryRefreshIndicator /> : undefined}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="turns-harness" className="text-xs text-muted-foreground">
              Harness
            </Label>
            <Select
              value={harness}
              onValueChange={(v) => {
                setHarness(v);
                setOffset(0);
              }}
            >
              <SelectTrigger id="turns-harness" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HARNESS_OPTIONS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h === "all" ? "All harnesses" : h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="turns-status" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setOffset(0);
              }}
            >
              <SelectTrigger id="turns-status" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All statuses" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="turns-agent" className="text-xs text-muted-foreground">
              Agent
            </Label>
            <Select
              value={agentKey}
              onValueChange={(v) => {
                setAgentKey(v);
                setOffset(0);
              }}
              disabled={showInitialQuerySkeleton(agentsQuery)}
            >
              <SelectTrigger id="turns-agent" className="h-9">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agentsSorted.map((a) => (
                  <SelectItem key={a.agent_key} value={a.agent_key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {showInitialQuerySkeleton(turns) ? (
          <ListSkeleton rows={6} />
        ) : turns.error ? (
          <QueryErrorAlert title="Could not load turns">{turns.error.message}</QueryErrorAlert>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No turns recorded yet for this filter.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Turn</th>
                  <th className="px-3 py-2">Harness</th>
                  <th className="px-3 py-2">Hook events</th>
                  <th className="px-3 py-2 text-right">Tools</th>
                  <th className="px-3 py-2 text-right">Stored</th>
                  <th className="px-3 py-2 text-right">Retrieved</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Activity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((turn) => (
                  <TurnRow key={turn.entity_id} turn={turn} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(offset > 0 || hasMore) && (
          <Pagination className="mx-0 w-full justify-between">
            <PaginationContent className="flex w-full flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {items.length === 0
                  ? "No turns on this page."
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
                    <TooltipContent>Newer turns</TooltipContent>
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
                    <TooltipContent>Older turns</TooltipContent>
                  </Tooltip>
                </PaginationItem>
              </div>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </PageShell>
  );
}

function TurnRow({ turn }: { turn: ConversationTurnSummary }) {
  const turnKey = turn.turn_key ?? turn.entity_id;
  const label = turn.turn_key ?? shortId(turn.entity_id, 10);
  const hookEvents = turn.hook_events.slice(0, 4);
  const remaining = Math.max(0, turn.hook_events.length - hookEvents.length);
  return (
    <tr className="border-t">
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-1">
          <Link
            to={`/turns/${encodeURIComponent(turnKey)}`}
            className="break-all font-medium text-foreground hover:underline"
          >
            {label}
          </Link>
          <AgentBadge provenance={turn.latest_write_provenance ?? null} />
        </div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {turn.harness ?? "—"}
        {turn.model ? <div>{turn.model}</div> : null}
      </td>
      <td className="px-3 py-2 align-top">
        {hookEvents.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {hookEvents.map((evt) => (
              <span
                key={evt}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
              >
                {evt}
              </span>
            ))}
            {remaining > 0 ? (
              <span className="text-[11px] text-muted-foreground">+{remaining}</span>
            ) : null}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right align-top tabular-nums">
        {turn.tool_invocation_count}
      </td>
      <td className="px-3 py-2 text-right align-top tabular-nums">
        {turn.hook_summary.stored_entity_count}
      </td>
      <td className="px-3 py-2 text-right align-top tabular-nums">
        {turn.hook_summary.retrieved_entity_count}
      </td>
      <td className="px-3 py-2 align-top">
        {turn.status ? <TypeBadge type={turn.status} humanize /> : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        <LiveRelativeTime iso={turn.activity_at} />
      </td>
    </tr>
  );
}
