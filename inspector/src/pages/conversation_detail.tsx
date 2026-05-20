import { Link, useParams } from "react-router-dom";
import { PageShell } from "@/components/layout/page_shell";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { TypeBadge } from "@/components/shared/type_badge";
import { AgentBadge } from "@/components/shared/agent_badge";
import { EntityOpenIconLink } from "@/components/shared/entity_link";
import {
  groupMessagesByTurn,
  HookActivityChip,
  messageRoleLabel,
  RelatedEntityRow,
  totalNestedRelatedEntitiesInConversation,
  totalNestedSourcesInConversation,
} from "@/components/shared/conversation_common";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { useRecentConversation } from "@/hooks/use_recent_conversation";
import { useConversationTurnIndex } from "@/hooks/use_conversation_turn_index";
import { TurnAnchorSections } from "@/components/conversation/turn_anchor_sections";
import { TurnTimelineSidebar } from "@/components/conversation/turn_timeline_sidebar";
import { WidgetHostDiscoveryPrompt } from "@/components/conversation/widget_host_discovery_prompt";
import {
  querySettledWithoutData,
  showBackgroundQueryRefresh,
  showRouteDetailSkeleton,
} from "@/lib/query_loading";
import { absoluteDateTime, shortId } from "@/lib/humanize";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { RecentConversationMessage } from "@/types/api";

function MessageDetailCard({
  message,
  variant = "default",
}: {
  message: RecentConversationMessage;
  variant?: "default" | "user" | "agent";
}) {
  const role = message.role?.trim();
  const sk = message.sender_kind?.trim();
  const headline = messageRoleLabel(message);
  const cardTone =
    variant === "user"
      ? "border-primary/25 bg-primary/5"
      : variant === "agent"
        ? "border-muted bg-muted/20"
        : undefined;

  return (
    <Card className={cardTone}>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                {headline}
              </span>
              {sk && role && sk.toLowerCase() !== role.toLowerCase() ? (
                <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                  sender_kind {sk}
                </span>
              ) : null}
              <LiveRelativeTime
                iso={message.activity_at}
                className="text-xs text-muted-foreground"
                title={absoluteDateTime(message.activity_at)}
              />
              <span className="text-xs text-muted-foreground">
                {message.related_entities.length} related
              </span>
              <HookActivityChip message={message} />
            </div>
            {message.turn_key ? (
              <p className="font-mono text-xs text-muted-foreground break-all">
                turn_key: {message.turn_key}
              </p>
            ) : null}
            {message.canonical_name?.trim() ? (
              <p className="text-xs text-muted-foreground">Label: {message.canonical_name}</p>
            ) : null}
          </div>
          <EntityOpenIconLink
            id={message.message_id}
            title={message.turn_key ?? message.message_id}
            className="h-8 w-8"
            iconClassName="h-4 w-4"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {message.content ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No message body on snapshot.</p>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Related entities
          </h3>
          {message.related_entities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No linked entities for this message.</p>
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
      </CardContent>
    </Card>
  );
}

function TurnMessageGroupCard({
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
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
            Turn
          </span>
          {activityAt ? (
            <LiveRelativeTime
              iso={activityAt}
              className="text-xs text-muted-foreground"
              title={absoluteDateTime(activityAt)}
            />
          ) : null}
          <span className="text-xs text-muted-foreground">
            {group.messages.length} {group.messages.length === 1 ? "message" : "messages"}
          </span>
          <span className="text-xs text-muted-foreground">{relatedCount} related</span>
          {firstMessage ? <HookActivityChip message={firstMessage} /> : null}
        </div>
        {group.turnKey ? (
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            turn_key: {group.turnKey}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-3">
          {group.userMessages.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No user message recorded for this turn.
            </p>
          ) : (
            group.userMessages.map((message) => (
              <MessageDetailCard key={message.message_id} message={message} variant="user" />
            ))
          )}
        </div>

        <div className="space-y-3 border-l-2 border-muted pl-4">
          {group.responseMessages.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No agent response recorded for this turn.
            </p>
          ) : (
            group.responseMessages.map((message) => (
              <MessageDetailCard key={message.message_id} message={message} variant="agent" />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default function ConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const q = useRecentConversation(conversationId);
  // FU-2026-05-003: per-turn anchor index. Used for the timeline sidebar
  // and the `#msg-N`/`#stored-N`/`#retrieved-N`/`#issues-N` anchor sections.
  const turnIndexQuery = useConversationTurnIndex(conversationId);

  const c = q.data;
  const showInitialSkeleton = showRouteDetailSkeleton(
    q,
    (row) => row.conversation_id === conversationId,
  );
  const title =
    showInitialSkeleton
      ? "Loading…"
      : c?.title?.trim() ||
        c?.canonical_name?.trim() ||
        (conversationId ? `Conversation ${shortId(conversationId, 8)}` : "Conversation");

  const nestedEntityCount = c ? totalNestedRelatedEntitiesInConversation(c) : 0;
  const nestedSourceCount = c ? totalNestedSourcesInConversation(c) : 0;
  const entityLabel = nestedEntityCount === 1 ? "1 entity" : `${nestedEntityCount} entities`;
  const sourceLabel = nestedSourceCount === 1 ? "1 source" : `${nestedSourceCount} sources`;
  const turnGroups = c ? groupMessagesByTurn(c.messages) : [];

  if (showInitialSkeleton) {
    return (
      <PageShell title={title} description="Loading…">
        <ListSkeleton rows={6} />
      </PageShell>
    );
  }

  if (q.error) {
    return (
      <PageShell title={title}>
        <QueryErrorAlert title="Could not load conversation">
          {q.error instanceof Error ? q.error.message : String(q.error)}
        </QueryErrorAlert>
      </PageShell>
    );
  }

  if (!c && querySettledWithoutData(q)) {
    return (
      <PageShell title={title}>
        <QueryErrorAlert title="Conversation not found">
          This id is not available for the current user.
        </QueryErrorAlert>
      </PageShell>
    );
  }

  if (!c) {
    return (
      <PageShell title={title} description="Loading…">
        <ListSkeleton rows={6} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={title}
      description={`${c.message_count} messages · ${entityLabel} · ${sourceLabel} · last activity ${absoluteDateTime(c.activity_at)}`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {showBackgroundQueryRefresh(q) ? <QueryRefreshIndicator /> : null}
          {conversationId ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/entities/${encodeURIComponent(conversationId)}`}>Open entity record</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <TypeBadge type="conversation" humanize />
                <AgentBadge provenance={c.latest_write_provenance ?? null} />
                <span>{c.message_count} messages</span>
                <span>{entityLabel}</span>
                <span>{sourceLabel}</span>
                <span className="inline-flex items-center gap-1">
                  last activity <LiveRelativeTime iso={c.activity_at} title={false} />
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link to="/conversations">All conversations</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {turnIndexQuery.data ? (
            <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
              <TurnTimelineSidebar
                index={turnIndexQuery.data}
                className="lg:sticky lg:top-4 lg:self-start"
              />
              <div className="space-y-6">
                <WidgetHostDiscoveryPrompt />

                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Turn anchors</h2>
                  <p className="text-xs text-muted-foreground">
                    Per-turn anchor sections with deterministic IDs (
                    <code className="font-mono">#msg-N</code>,{" "}
                    <code className="font-mono">#stored-N</code>,{" "}
                    <code className="font-mono">#retrieved-N</code>,{" "}
                    <code className="font-mono">#issues-N</code>). Click a turn in the timeline to
                    jump.
                  </p>
                  <TurnAnchorSections index={turnIndexQuery.data} />
                </section>

                <Separator />

                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">Messages</h2>
                  {c.messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No messages linked to this conversation.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {turnGroups.map((group) => (
                        <TurnMessageGroupCard key={group.groupKey} group={group} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Messages</h2>
              {c.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages linked to this conversation.</p>
              ) : (
                <div className="space-y-4">
                  {turnGroups.map((group) => (
                    <TurnMessageGroupCard key={group.groupKey} group={group} />
                  ))}
                </div>
              )}
              {turnIndexQuery.error ? (
                <p className="text-xs text-muted-foreground">
                  Turn index unavailable:{" "}
                  {turnIndexQuery.error instanceof Error
                    ? turnIndexQuery.error.message
                    : String(turnIndexQuery.error)}
                </p>
              ) : null}
            </div>
          )}
        </div>
    </PageShell>
  );
}
