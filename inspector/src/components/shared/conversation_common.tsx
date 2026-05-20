import { Link } from "react-router-dom";
import { EntityLink } from "@/components/shared/entity_link";
import { TypeBadge } from "@/components/shared/type_badge";
import { humanizeEntityType, humanizeRelationshipType, shortId } from "@/lib/humanize";
import type {
  RecentConversationItem,
  RecentConversationMessage,
  RecentConversationRelatedEntity,
} from "@/types/api";

/** Total related-entity rows across all messages (same entity may appear more than once). */
export function totalNestedRelatedEntitiesInConversation(conversation: RecentConversationItem): number {
  let n = 0;
  for (const message of conversation.messages) {
    n += message.related_entities.length;
  }
  return n;
}

function isNestedSourceRelatedEntity(entity: RecentConversationRelatedEntity): boolean {
  const type = entity.entity_type?.trim().toLowerCase() ?? "";
  const rt = entity.relationship_type?.trim().toUpperCase() ?? "";
  return type === "source" || rt === "EMBEDS";
}

export function totalNestedSourcesInConversation(conversation: RecentConversationItem): number {
  let n = 0;
  for (const message of conversation.messages) {
    for (const rel of message.related_entities) {
      if (isNestedSourceRelatedEntity(rel)) n += 1;
    }
  }
  return n;
}

export interface ConversationMessageTurnGroup {
  groupKey: string;
  turnKey: string | null;
  messages: RecentConversationMessage[];
  userMessages: RecentConversationMessage[];
  responseMessages: RecentConversationMessage[];
}

export function messageRoleLabel(message: RecentConversationMessage): string {
  const role = message.role?.trim();
  const senderKind = message.sender_kind?.trim();
  if (senderKind && (!role || role.toLowerCase() === senderKind.toLowerCase())) {
    return senderKind.toUpperCase();
  }
  if (role) return role.toUpperCase();
  if (senderKind) return senderKind.toUpperCase();
  return "MESSAGE";
}

export function baseTurnKeyForMessage(message: RecentConversationMessage): string | null {
  const turnKey = message.turn_key?.trim();
  if (!turnKey) return null;
  return turnKey.endsWith(":assistant") ? turnKey.slice(0, -":assistant".length) : turnKey;
}

function isUserMessage(message: RecentConversationMessage): boolean {
  const sender = (message.sender_kind ?? message.role ?? "").trim().toLowerCase();
  return sender === "user";
}

export function groupMessagesByTurn(
  messages: RecentConversationMessage[],
): ConversationMessageTurnGroup[] {
  const groups: ConversationMessageTurnGroup[] = [];
  const byKey = new Map<string, ConversationMessageTurnGroup>();

  for (const message of messages) {
    const turnKey = baseTurnKeyForMessage(message);
    const groupKey = turnKey ?? `message:${message.message_id}`;
    let group = byKey.get(groupKey);
    if (!group) {
      group = {
        groupKey,
        turnKey,
        messages: [],
        userMessages: [],
        responseMessages: [],
      };
      groups.push(group);
      byKey.set(groupKey, group);
    }

    group.messages.push(message);
    if (isUserMessage(message)) {
      group.userMessages.push(message);
    } else {
      group.responseMessages.push(message);
    }
  }

  return groups;
}

export function RelatedEntityRow({ entity }: { entity: RecentConversationRelatedEntity }) {
  const label =
    entity.title?.trim() || entity.canonical_name?.trim() || shortId(entity.entity_id, 10);

  return (
    <div className="flex items-center justify-between gap-3 rounded border px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {humanizeRelationshipType(entity.relationship_type)}
          </span>
          {entity.entity_type ? (
            <TypeBadge
              type={entity.entity_type}
              label={humanizeEntityType(entity.entity_type)}
              humanize
            />
          ) : null}
        </div>
        <div className="mt-1 min-w-0">
          <EntityLink id={entity.entity_id} name={label} className="truncate" />
        </div>
      </div>
    </div>
  );
}

export function HookActivityChip({ message }: { message: RecentConversationMessage }) {
  const summary = message.hook_summary;
  if (!summary) return null;
  const turnKey = message.turn_key;
  const totalActivity =
    summary.hook_event_count +
    summary.tool_invocation_count +
    summary.store_structured_calls +
    summary.retrieve_calls +
    summary.stored_entity_count +
    summary.retrieved_entity_count +
    summary.neotoma_tool_failures;
  if (totalActivity === 0) return null;

  const parts: string[] = [];
  if (summary.hook_event_count > 0) {
    parts.push(`${summary.hook_event_count} hook${summary.hook_event_count === 1 ? "" : "s"}`);
  }
  if (summary.tool_invocation_count > 0) {
    parts.push(
      `${summary.tool_invocation_count} tool${summary.tool_invocation_count === 1 ? "" : "s"}`,
    );
  }
  if (summary.stored_entity_count > 0) {
    parts.push(`${summary.stored_entity_count} stored`);
  }
  if (summary.retrieved_entity_count > 0) {
    parts.push(`${summary.retrieved_entity_count} retrieved`);
  }
  const label = parts.length > 0 ? parts.join(" · ") : "hook activity";

  const chip = (
    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
      {label}
    </span>
  );

  if (!turnKey) return chip;
  return (
    <Link
      to={`/turns/${encodeURIComponent(turnKey)}`}
      onClick={(e) => e.stopPropagation()}
      title="View turn detail"
      className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
    >
      {label}
    </Link>
  );
}
