import { useParams, Link } from "react-router-dom";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttributionCard } from "@/components/shared/attribution_card";
import { TypeBadge } from "@/components/shared/type_badge";
import { EntityLink } from "@/components/shared/entity_link";
import { CopyIdButton } from "@/components/shared/copy_id_button";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import {
  groupMessagesByTurn,
  HookActivityChip,
  messageRoleLabel,
  RelatedEntityRow,
} from "@/components/shared/conversation_common";
import { absoluteDateTime, humanizeRelationshipType, shortId } from "@/lib/humanize";
import { useTurn } from "@/hooks/use_turns";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import type {
  ConversationTurnDetail,
  ConversationTurnRelatedEntity,
} from "@/types/api";

export default function TurnDetailPage() {
  const { turnKey: rawTurnKey } = useParams<{ turnKey: string }>();
  const turnKey = rawTurnKey ? decodeURIComponent(rawTurnKey) : "";
  const detail = useTurn(turnKey || null);

  if (!turnKey) {
    return (
      <PageShell title="Turn">
        <QueryErrorAlert title="Missing turn key">
          Provide a `turn_key` in the URL to view turn details.
        </QueryErrorAlert>
      </PageShell>
    );
  }

  if (showInitialQuerySkeleton(detail)) {
    return (
      <PageShell title="Turn">
        <DetailPageSkeleton />
      </PageShell>
    );
  }

  if (detail.error) {
    return (
      <PageShell title="Turn">
        <QueryErrorAlert title="Could not load turn">
          {detail.error.message}
        </QueryErrorAlert>
      </PageShell>
    );
  }

  const turn = detail.data ?? null;
  if (!turn) {
    return (
      <PageShell title="Turn">
        <QueryErrorAlert title="Turn not found">
          {`No conversation_turn entity for turn_key "${turnKey}"`}
        </QueryErrorAlert>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={turn.turn_key ?? shortId(turn.entity_id, 12)}
      description={turn.harness ? `${turn.harness} turn` : undefined}
      actions={showBackgroundQueryRefresh(detail) ? <QueryRefreshIndicator /> : undefined}
    >
      <TurnDetailBody turn={turn} />
    </PageShell>
  );
}

function TurnDetailBody({ turn }: { turn: ConversationTurnDetail }) {
  const messages = turn.messages ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Turn key" value={turn.turn_key} mono />
          <Field label="Session" value={turn.session_id} mono />
          <Field label="Turn id" value={turn.turn_id} mono />
          <Field label="Harness" value={turn.harness} />
          <Field label="Harness version" value={turn.harness_version} />
          <Field label="Model" value={turn.model} />
          <Field
            label="Status"
            value={turn.status ? <TypeBadge type={turn.status} humanize /> : null}
          />
          <Field label="Started" value={turn.started_at} />
          <Field label="Ended" value={turn.ended_at} />
          <Field label="Last activity" value={<LiveRelativeTime iso={turn.activity_at} />} />
          <Field label="Working directory" value={turn.cwd} mono />
          <Field
            label="Entity id"
            value={
              <span className="inline-flex items-center gap-1 break-all">
                <EntityLink id={turn.entity_id} name={turn.entity_id} />
                <CopyIdButton id={turn.entity_id} />
              </span>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hook activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CounterGrid turn={turn} />

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hook events
            </h3>
            {turn.hook_events.length === 0 ? (
              <p className="mt-1 text-muted-foreground">
                No hook events accreted for this turn.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {turn.hook_events.map((evt, i) => (
                  <span
                    key={`${evt}-${i}`}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs"
                  >
                    {evt}
                  </span>
                ))}
              </div>
            )}
          </div>

          {turn.missed_steps.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Missed steps
              </h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {turn.missed_steps.map((m, i) => (
                  <span
                    key={`${m}-${i}`}
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {turn.injected_context_chars !== null &&
          turn.injected_context_chars !== undefined ? (
            <p className="text-muted-foreground">
              Injected additionalContext: {turn.injected_context_chars} chars
            </p>
          ) : null}

          {turn.failure_hint_shown ? (
            <p className="text-muted-foreground">Failure-hint reminder shown.</p>
          ) : null}

          {turn.safety_net_used ? (
            <p className="text-muted-foreground">
              Persistence safety net backfilled this turn.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No user or assistant messages are linked to this turn key.
            </p>
          ) : (
            <div className="space-y-4">
              {groupMessagesByTurn(messages).map((group) => (
                <TurnMessageGroupCard key={group.groupKey} group={group} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RelatedSection
        title="Stored entities"
        ids={turn.stored_entity_ids}
        related={turn.related_entities}
      />
      <RelatedSection
        title="Retrieved entities"
        ids={turn.retrieved_entity_ids}
        related={turn.related_entities}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related entities</CardTitle>
        </CardHeader>
        <CardContent>
          {turn.related_entities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No graph edges from this turn yet.
            </p>
          ) : (
            <div className="space-y-2">
              {turn.related_entities.map((rel) => (
                <RelatedRow
                  key={`${rel.direction}:${rel.relationship_type}:${rel.entity_id}`}
                  rel={rel}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AttributionCard
        provenance={turn.latest_write_provenance ?? null}
        title="Latest write attribution"
        description={
          turn.latest_write_provenance
            ? "Agent identity recorded on the most recent observation for this turn."
            : "The most recent observation does not carry agent attribution."
        }
      />

      {turn.conversation_id ? (
        <p className="text-sm text-muted-foreground">
          Linked conversation:{" "}
          <Link
            to={`/entities/${turn.conversation_id}`}
            className="text-foreground underline-offset-2 hover:underline"
          >
            {shortId(turn.conversation_id, 12)}
          </Link>
        </p>
      ) : null}
    </div>
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
    <section className="rounded-lg border bg-muted">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
            Turn exchange
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
              <TurnMessageCard key={message.message_id} message={message} variant="user" />
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
              <TurnMessageCard key={message.message_id} message={message} variant="agent" />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function TurnMessageCard({
  message,
  variant,
}: {
  message: ConversationTurnDetail["messages"][number];
  variant: "user" | "agent";
}) {
  const cardTone =
    variant === "user"
      ? "border-primary/25 bg-primary/5"
      : "border-muted bg-muted/20";

  return (
    <div className={`rounded-md border p-3 ${cardTone}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
          {messageRoleLabel(message)}
        </span>
        <LiveRelativeTime
          iso={message.activity_at}
          className="text-xs text-muted-foreground"
          title={absoluteDateTime(message.activity_at)}
        />
        <span className="text-xs text-muted-foreground">
          {message.related_entities.length} related
        </span>
        <EntityLink
          id={message.message_id}
          name={shortId(message.message_id, 10)}
          className="text-xs"
        />
      </div>
      {message.content ? (
        <div className="rounded bg-background/70 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No message body on snapshot.</p>
      )}

      <div className="mt-3">
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
    </div>
  );
}

function CounterGrid({ turn }: { turn: ConversationTurnDetail }) {
  const counters: Array<[string, number]> = [
    ["Hook events", turn.hook_summary.hook_event_count],
    ["Tool invocations", turn.tool_invocation_count],
    ["store_structured", turn.store_structured_calls],
    ["retrieve_*", turn.retrieve_calls],
    ["Stored entities", turn.hook_summary.stored_entity_count],
    ["Retrieved entities", turn.hook_summary.retrieved_entity_count],
    ["Neotoma tool failures", turn.neotoma_tool_failures],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {counters.map(([label, value]) => (
        <div
          key={label}
          className="rounded border bg-background px-3 py-2 text-sm"
        >
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

function RelatedSection({
  title,
  ids,
  related,
}: {
  title: string;
  ids: string[];
  related: ConversationTurnRelatedEntity[];
}) {
  if (ids.length === 0) return null;
  const byId = new Map(related.map((r) => [r.entity_id, r] as const));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {ids.map((id) => {
            const rel = byId.get(id);
            return (
              <div
                key={`${title}:${id}`}
                className="flex min-w-0 items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {rel?.entity_type ? (
                      <TypeBadge type={rel.entity_type} humanize />
                    ) : null}
                    {rel ? (
                      <span className="text-xs text-muted-foreground">
                        {humanizeRelationshipType(rel.relationship_type)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 min-w-0">
                    <EntityLink
                      id={id}
                      name={rel?.title || rel?.canonical_name || shortId(id, 12)}
                      className="truncate"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RelatedRow({ rel }: { rel: ConversationTurnRelatedEntity }) {
  const label = rel.title?.trim() || rel.canonical_name?.trim() || shortId(rel.entity_id, 10);
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {rel.direction === "outgoing" ? "→" : "←"}{" "}
            {humanizeRelationshipType(rel.relationship_type)}
          </span>
          {rel.entity_type ? <TypeBadge type={rel.entity_type} humanize /> : null}
        </div>
        <div className="mt-1 min-w-0">
          <EntityLink id={rel.entity_id} name={label} className="truncate" />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={
          mono
            ? "mt-0.5 break-all font-mono text-xs"
            : "mt-0.5 break-words text-sm"
        }
      >
        {value !== null && value !== undefined && value !== "" ? (
          value
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
