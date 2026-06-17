import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { isApiUrlConfigured } from "@/api/client";
import { PageShell } from "@/components/layout/page_shell";
import { ApiNotConfiguredState } from "@/components/shared/api_not_configured_state";
import { EmptyState } from "@/components/shared/empty_state";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl, SegmentedControlItem } from "@/components/shared/segmented_control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityOpenIconLink } from "@/components/shared/entity_link";
import { TypeBadge } from "@/components/shared/type_badge";
import { AgentBadge } from "@/components/shared/agent_badge";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { shortId, truncate } from "@/lib/humanize";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { useRecentConversations } from "@/hooks/use_recent_conversations";
import { useAgents } from "@/hooks/use_agents";
import {
  groupMessagesByTurn,
  HookActivityChip,
  messageRoleLabel,
  RelatedEntityRow,
  totalNestedRelatedEntitiesInConversation,
  totalNestedSourcesInConversation,
} from "@/components/shared/conversation_common";
import { toast } from "sonner";
import type { RecentConversationItem, RecentConversationMessage } from "@/types/api";

const PAGE_SIZE = 25;

/** Select value for "no agent filter"; must not collide with real `agent_key` values from the API. */
const AGENT_FILTER_ALL = "__inspector_agent_all__";

type TimeRangeTab = "all" | "today" | "recent" | "custom";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function localDayStartIso(y: number, monthIndex: number, d: number): string {
  return new Date(y, monthIndex, d, 0, 0, 0, 0).toISOString();
}

function localDayEndIso(y: number, monthIndex: number, d: number): string {
  return new Date(y, monthIndex, d, 23, 59, 59, 999).toISOString();
}

function boundsForToday(): { activity_after: string; activity_before: string } {
  const n = new Date();
  const y = n.getFullYear();
  const m = n.getMonth();
  const d = n.getDate();
  return {
    activity_after: localDayStartIso(y, m, d),
    activity_before: localDayEndIso(y, m, d),
  };
}

function boundsLast7Days(): { activity_after: string; activity_before: string } {
  const end = new Date();
  const y = end.getFullYear();
  const m = end.getMonth();
  const d = end.getDate();
  const start = new Date(y, m, d - 6, 0, 0, 0, 0);
  return {
    activity_after: localDayStartIso(start.getFullYear(), start.getMonth(), start.getDate()),
    activity_before: localDayEndIso(y, m, d),
  };
}

function boundsFromDateInputs(
  startStr: string,
  endStr: string,
): { activity_after: string; activity_before: string } | null {
  const startTrim = startStr.trim();
  const endTrim = endStr.trim();
  if (!startTrim || !endTrim) return null;
  const startParts = startTrim.split("-").map((x) => parseInt(x, 10));
  const endParts = endTrim.split("-").map((x) => parseInt(x, 10));
  if (startParts.length !== 3 || endParts.length !== 3) return null;
  const sy = startParts[0];
  const sm = startParts[1];
  const sd = startParts[2];
  const ey = endParts[0];
  const em = endParts[1];
  const ed = endParts[2];
  if (![sy, sm, sd, ey, em, ed].every((n) => Number.isFinite(n))) return null;
  const activity_after = localDayStartIso(sy!, sm! - 1, sd!);
  const activity_before = localDayEndIso(ey!, em! - 1, ed!);
  if (activity_after > activity_before) return null;
  return { activity_after, activity_before };
}

function todayDateInputValue(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

export default function RecentConversationsPage() {
  const [offset, setOffset] = useState(0);
  const [timeTab, setTimeTab] = useState<TimeRangeTab>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customApplied, setCustomApplied] = useState<{
    activity_after: string;
    activity_before: string;
  } | null>(null);
  const [agentKeyFilter, setAgentKeyFilter] = useState(AGENT_FILTER_ALL);

  const agentsQuery = useAgents();
  const agentsSorted = useMemo(() => {
    const list = agentsQuery.data?.agents ?? [];
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  }, [agentsQuery.data?.agents]);

  const queryParams = useMemo(() => {
    const base: {
      limit: number;
      offset: number;
      activity_after?: string;
      activity_before?: string;
      agent_key?: string;
    } = { limit: PAGE_SIZE, offset };
    if (agentKeyFilter !== AGENT_FILTER_ALL) {
      base.agent_key = agentKeyFilter;
    }
    if (timeTab === "today") {
      const b = boundsForToday();
      return { ...base, ...b };
    }
    if (timeTab === "recent") {
      const b = boundsLast7Days();
      return { ...base, ...b };
    }
    if (timeTab === "custom" && customApplied) {
      return { ...base, ...customApplied };
    }
    return base;
  }, [offset, timeTab, customApplied, agentKeyFilter]);

  const conversations = useRecentConversations(queryParams);

  const items = conversations.data?.items ?? [];
  const hasMore = conversations.data?.has_more ?? false;
  const showInitialSkeleton = showInitialQuerySkeleton(conversations);
  const showBackgroundRefresh = showBackgroundQueryRefresh(conversations);

  function handleTabChange(next: string) {
    if (!next) return;
    setTimeTab(next as TimeRangeTab);
    setOffset(0);
  }

  function handleApplyCustomRange() {
    const b = boundsFromDateInputs(customStart, customEnd);
    if (!b) {
      toast.error("Choose a valid start and end date (start must be on or before end).");
      return;
    }
    setCustomApplied(b);
    setOffset(0);
    toast.success("Date range applied.");
  }

  if (!isApiUrlConfigured()) {
    return (
      <PageShell title="Conversations">
        <ApiNotConfiguredState />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Conversations"
      actions={showBackgroundRefresh ? <QueryRefreshIndicator /> : undefined}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SegmentedControl
            type="single"
            size="sm"
            value={timeTab}
            onValueChange={handleTabChange}
            aria-label="Filter conversations by activity range"
            className="min-w-0 flex-1"
          >
            <SegmentedControlItem value="all">All</SegmentedControlItem>
            <SegmentedControlItem value="today">Today</SegmentedControlItem>
            <SegmentedControlItem value="recent">Recently</SegmentedControlItem>
            <SegmentedControlItem value="custom">Custom range</SegmentedControlItem>
          </SegmentedControl>
          <div className="flex flex-col gap-1.5 lg:w-72">
            <Select
              value={agentKeyFilter}
              onValueChange={(v) => {
                setAgentKeyFilter(v);
                setOffset(0);
              }}
              disabled={showInitialQuerySkeleton(agentsQuery)}
            >
              <SelectTrigger
                id="conv-agent-filter"
                className="h-9"
                aria-label="Filter conversations by agent"
              >
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AGENT_FILTER_ALL}>All agents</SelectItem>
                {agentsSorted.map((a) => (
                  <SelectItem key={a.agent_key} value={a.agent_key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {timeTab === "custom" ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="conv-range-start" className="text-xs">
                Start date
              </Label>
              <Input
                id="conv-range-start"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-[11rem]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="conv-range-end" className="text-xs">
                End date
              </Label>
              <Input
                id="conv-range-end"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-[11rem]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={handleApplyCustomRange}>
                Apply range
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCustomStart(todayDateInputValue());
                  setCustomEnd(todayDateInputValue());
                }}
              >
                Today (preset)
              </Button>
            </div>
            {!customApplied ? (
              <p className="w-full text-xs text-muted-foreground">
                Pick dates and click Apply range to filter. Until then, results match &quot;All&quot;.
              </p>
            ) : null}
          </div>
        ) : null}

        <Separator />

        {showInitialSkeleton ? (
          <ListSkeleton rows={6} />
        ) : conversations.error ? (
          <QueryErrorAlert title="Could not load conversations">{conversations.error.message}</QueryErrorAlert>
        ) : (
          <div className="space-y-4">
            {items.length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title={
                  timeTab === "all" && agentKeyFilter === AGENT_FILTER_ALL
                    ? "No conversations yet"
                    : "No conversations in this range"
                }
                description={
                  timeTab === "all" && agentKeyFilter === AGENT_FILTER_ALL
                    ? "Connect a harness (Cursor, Claude Code, Codex, or another MCP client) and the next chat turn will land here automatically."
                    : "Try a wider time range, choose a different agent, or clear the filters."
                }
              />
            ) : (
              items.map((conversation) => (
                <ConversationCard key={conversation.conversation_id} conversation={conversation} />
              ))
            )}

            {(offset > 0 || hasMore) && (
              <Pagination className="mx-0 w-full justify-between">
                <PaginationContent className="flex w-full flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {items.length === 0
                      ? "No conversations on this page."
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
                        <TooltipContent>Newer conversations</TooltipContent>
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
                        <TooltipContent>Older conversations</TooltipContent>
                      </Tooltip>
                    </PaginationItem>
                  </div>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function ConversationCard({ conversation }: { conversation: RecentConversationItem }) {
  const title =
    conversation.title?.trim() ||
    conversation.canonical_name?.trim() ||
    `Conversation ${shortId(conversation.conversation_id, 8)}`;
  const nestedEntityCount = totalNestedRelatedEntitiesInConversation(conversation);
  const nestedSourceCount = totalNestedSourcesInConversation(conversation);
  const entityLabel =
    nestedEntityCount === 1 ? "1 entity" : `${nestedEntityCount} entities`;
  const sourceLabel =
    nestedSourceCount === 1 ? "1 source" : `${nestedSourceCount} sources`;
  const turnGroups = groupMessagesByTurn(conversation.messages);

  return (
    <details className="rounded-lg border bg-card shadow-sm open:ring-1 open:ring-border">
      <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 text-base font-semibold text-foreground">
              <Link
                to={`/conversations/${encodeURIComponent(conversation.conversation_id)}`}
                className="inline-block max-w-full truncate align-middle text-base font-semibold text-foreground hover:underline"
                title={conversation.conversation_id}
              >
                {title}
              </Link>
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <TypeBadge type="conversation" humanize />
              <AgentBadge provenance={conversation.latest_write_provenance ?? null} />
              <span>{conversation.message_count} messages</span>
              <span>{entityLabel}</span>
              <span>{sourceLabel}</span>
              <LiveRelativeTime iso={conversation.activity_at} />
            </div>
          </div>
          <EntityOpenIconLink id={conversation.conversation_id} title={conversation.conversation_id} />
        </div>
      </summary>

      <div className="border-t px-4 py-3">
        {conversation.messages.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No messages found for this conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {turnGroups.map((group) => (
              <ConversationTurnGroupCard key={group.groupKey} group={group} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function ConversationTurnGroupCard({
  group,
}: {
  group: ReturnType<typeof groupMessagesByTurn>[number];
}) {
  const relatedCount = group.messages.reduce(
    (total, message) => total + message.related_entities.length,
    0,
  );
  const firstMessage = group.messages[0];
  const activityAt = group.messages[group.messages.length - 1]?.activity_at ?? firstMessage?.activity_at;

  return (
    <section className="rounded-md border bg-muted">
      <div className="border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
            Turn
          </span>
          {activityAt ? (
            <LiveRelativeTime iso={activityAt} className="text-xs text-muted-foreground" />
          ) : null}
          <span className="text-xs text-muted-foreground">
            {group.messages.length} {group.messages.length === 1 ? "message" : "messages"}
          </span>
          <span className="text-xs text-muted-foreground">{relatedCount} related</span>
          {firstMessage ? <HookActivityChip message={firstMessage} /> : null}
        </div>
        {group.turnKey ? (
          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
            {group.turnKey}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        <div className="space-y-2">
          {group.userMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground">No user message recorded for this turn.</p>
          ) : (
            group.userMessages.map((message) => (
              <MessageCard key={message.message_id} message={message} variant="user" />
            ))
          )}
        </div>

        <div className="space-y-2 border-l-2 border-muted pl-3">
          {group.responseMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground">No agent response recorded for this turn.</p>
          ) : (
            group.responseMessages.map((message) => (
              <MessageCard key={message.message_id} message={message} variant="agent" />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function MessageCard({
  message,
  variant = "default",
}: {
  message: RecentConversationMessage;
  variant?: "default" | "user" | "agent";
}) {
  const role = messageRoleLabel(message);
  const preview = truncate(
    message.content?.trim() || message.canonical_name?.trim() || shortId(message.message_id, 10),
    120
  );
  const boxTone =
    variant === "user"
      ? "border-primary/25 bg-primary/5"
      : variant === "agent"
        ? "border-muted bg-muted/20"
        : "border bg-card";

  return (
    <details className={`rounded-md ${boxTone}`}>
      <summary className="cursor-pointer list-none px-3 py-2 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                {role}
              </span>
              <LiveRelativeTime
                iso={message.activity_at}
                className="text-xs text-muted-foreground"
              />
              <span className="text-xs text-muted-foreground">
                {message.related_entities.length} related
              </span>
              <HookActivityChip message={message} />
            </div>
            <p className="mt-1 break-words text-sm">{preview}</p>
          </div>
          <EntityOpenIconLink
            id={message.message_id}
            title={message.turn_key ?? message.message_id}
            className="h-7 w-7"
            iconClassName="h-3.5 w-3.5"
          />
        </div>
      </summary>

      <div className="border-t px-3 py-3">
        {message.content ? (
          <div className="mb-3 rounded bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Related entities
          </h3>
          {message.related_entities.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No linked entities for this message.
            </div>
          ) : (
            <div className="space-y-2">
              {message.related_entities.map((entity) => (
                <RelatedEntityRow
                  key={`${message.message_id}:${entity.relationship_type}:${entity.entity_id}`}
                  entity={entity}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

