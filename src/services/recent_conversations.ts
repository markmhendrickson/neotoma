import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

const TS_EPOCH = "1970-01-01T00:00:00.000Z";

export interface RecentConversationRelatedEntity {
  entity_id: string;
  entity_type: string | null;
  canonical_name: string | null;
  title: string | null;
  relationship_type: string;
}

export interface RecentConversationMessage {
  message_id: string;
  canonical_name: string | null;
  role: string | null;
  content: string | null;
  turn_key: string | null;
  activity_at: string;
  related_entities: RecentConversationRelatedEntity[];
}

export interface RecentConversationItem {
  conversation_id: string;
  canonical_name: string | null;
  title: string | null;
  activity_at: string;
  message_count: number;
  messages: RecentConversationMessage[];
}

type ConversationRow = {
  conversation_id: string;
  canonical_name: string | null;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_observation_at: string | null;
  latest_message_activity: string | null;
  message_count: number | null;
};

type MessageRow = {
  conversation_id: string;
  message_id: string;
  canonical_name: string | null;
  role: string | null;
  content: string | null;
  turn_key: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_observation_at: string | null;
};

type RelatedEntityRow = {
  message_id: string;
  entity_id: string;
  entity_type: string | null;
  canonical_name: string | null;
  snap_title: string | null;
  snap_name: string | null;
  snap_subject: string | null;
  snap_summary: string | null;
  snap_label: string | null;
  snap_headline: string | null;
  snap_topic: string | null;
  relationship_type: string;
};

function cleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function latestTs(...values: Array<string | null | undefined>): string {
  let best = TS_EPOCH;
  for (const value of values) {
    const s = cleanString(value);
    if (s && s > best) best = s;
  }
  return best;
}

function titleFromSnapshot(row: {
  snap_title?: string | null;
  snap_name?: string | null;
  snap_subject?: string | null;
  snap_summary?: string | null;
  snap_label?: string | null;
  snap_headline?: string | null;
  snap_topic?: string | null;
}): string | null {
  return (
    cleanString(row.snap_title) ??
    cleanString(row.snap_name) ??
    cleanString(row.snap_subject) ??
    cleanString(row.snap_summary) ??
    cleanString(row.snap_label) ??
    cleanString(row.snap_headline) ??
    cleanString(row.snap_topic) ??
    null
  );
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

const CONVERSATIONS_SQL = `
WITH msg_stats AS (
  SELECT
    rs.target_entity_id AS conversation_id,
    COUNT(*) AS message_count,
    MAX(
      max(
        ifnull(nullif(trim(ms.last_observation_at), ''), '${TS_EPOCH}'),
        ifnull(nullif(trim(me.updated_at), ''), '${TS_EPOCH}'),
        ifnull(nullif(trim(me.created_at), ''), '${TS_EPOCH}')
      )
    ) AS latest_message_activity
  FROM relationship_snapshots rs
  JOIN entities me
    ON me.id = rs.source_entity_id
   AND me.user_id = ?
   AND me.entity_type = 'agent_message'
  LEFT JOIN entity_snapshots ms
    ON ms.entity_id = me.id
  WHERE rs.user_id = ?
    AND rs.relationship_type = 'PART_OF'
  GROUP BY rs.target_entity_id
)
SELECT
  c.id AS conversation_id,
  c.canonical_name AS canonical_name,
  json_extract(cs.snapshot, '$.title') AS title,
  c.created_at AS created_at,
  c.updated_at AS updated_at,
  cs.last_observation_at AS last_observation_at,
  msg_stats.latest_message_activity AS latest_message_activity,
  msg_stats.message_count AS message_count
FROM entities c
LEFT JOIN entity_snapshots cs
  ON cs.entity_id = c.id
LEFT JOIN msg_stats
  ON msg_stats.conversation_id = c.id
WHERE c.user_id = ?
  AND c.entity_type = 'conversation'
  AND (c.merged_to_entity_id IS NULL OR trim(ifnull(c.merged_to_entity_id, '')) = '')
ORDER BY
  max(
    ifnull(nullif(trim(msg_stats.latest_message_activity), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(cs.last_observation_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(c.updated_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(c.created_at), ''), '${TS_EPOCH}')
  ) DESC,
  c.id DESC
LIMIT ? OFFSET ?
`;

function buildMessagesSql(conversationCount: number): string {
  const inClause = placeholders(conversationCount);
  return `
SELECT
  rs.target_entity_id AS conversation_id,
  me.id AS message_id,
  me.canonical_name AS canonical_name,
  json_extract(ms.snapshot, '$.role') AS role,
  json_extract(ms.snapshot, '$.content') AS content,
  json_extract(ms.snapshot, '$.turn_key') AS turn_key,
  me.created_at AS created_at,
  me.updated_at AS updated_at,
  ms.last_observation_at AS last_observation_at
FROM relationship_snapshots rs
JOIN entities me
  ON me.id = rs.source_entity_id
 AND me.user_id = ?
 AND me.entity_type = 'agent_message'
LEFT JOIN entity_snapshots ms
  ON ms.entity_id = me.id
WHERE rs.user_id = ?
  AND rs.relationship_type = 'PART_OF'
  AND rs.target_entity_id IN (${inClause})
`;
}

function buildRelatedEntitiesSql(messageCount: number): string {
  const inClause = placeholders(messageCount);
  return `
SELECT
  rs.source_entity_id AS message_id,
  te.id AS entity_id,
  te.entity_type AS entity_type,
  te.canonical_name AS canonical_name,
  json_extract(ts.snapshot, '$.title') AS snap_title,
  json_extract(ts.snapshot, '$.name') AS snap_name,
  json_extract(ts.snapshot, '$.subject') AS snap_subject,
  json_extract(ts.snapshot, '$.summary') AS snap_summary,
  json_extract(ts.snapshot, '$.label') AS snap_label,
  json_extract(ts.snapshot, '$.headline') AS snap_headline,
  json_extract(ts.snapshot, '$.topic') AS snap_topic,
  rs.relationship_type AS relationship_type
FROM relationship_snapshots rs
JOIN entities te
  ON te.id = rs.target_entity_id
 AND te.user_id = ?
LEFT JOIN entity_snapshots ts
  ON ts.entity_id = te.id
WHERE rs.user_id = ?
  AND rs.source_entity_id IN (${inClause})
  AND rs.relationship_type != 'PART_OF'
ORDER BY rs.last_observation_at DESC, rs.computed_at DESC, te.id
`;
}

export function listRecentConversations(
  userId: string,
  limit: number,
  offset: number,
): { items: RecentConversationItem[]; has_more: boolean; limit: number; offset: number } {
  const db = getSqliteDb();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const fetchLimit = safeLimit + 1;

  const conversationRows = db
    .prepare(CONVERSATIONS_SQL)
    .all(userId, userId, userId, fetchLimit, safeOffset) as ConversationRow[];

  const hasMore = conversationRows.length > safeLimit;
  const conversationsPage = hasMore ? conversationRows.slice(0, safeLimit) : conversationRows;
  const conversationIds = conversationsPage.map((row) => row.conversation_id);

  const messagesByConversation = new Map<string, RecentConversationMessage[]>();
  let messageIds: string[] = [];
  if (conversationIds.length > 0) {
    const messageRows = db
      .prepare(buildMessagesSql(conversationIds.length))
      .all(userId, userId, ...conversationIds) as MessageRow[];

    const normalizedMessages = messageRows.map((row) => ({
      conversation_id: row.conversation_id,
      item: {
        message_id: row.message_id,
        canonical_name: cleanString(row.canonical_name),
        role: cleanString(row.role),
        content: cleanString(row.content),
        turn_key: cleanString(row.turn_key),
        activity_at: latestTs(row.last_observation_at, row.updated_at, row.created_at),
        related_entities: [] as RecentConversationRelatedEntity[],
      },
    }));

    normalizedMessages.sort((a, b) => {
      if (a.conversation_id !== b.conversation_id) {
        return conversationIds.indexOf(a.conversation_id) - conversationIds.indexOf(b.conversation_id);
      }
      return b.item.activity_at.localeCompare(a.item.activity_at);
    });

    for (const row of normalizedMessages) {
      const list = messagesByConversation.get(row.conversation_id) ?? [];
      list.push(row.item);
      messagesByConversation.set(row.conversation_id, list);
    }
    messageIds = normalizedMessages.map((row) => row.item.message_id);
  }

  const relatedByMessage = new Map<string, RecentConversationRelatedEntity[]>();
  if (messageIds.length > 0) {
    const relatedRows = db
      .prepare(buildRelatedEntitiesSql(messageIds.length))
      .all(userId, userId, ...messageIds) as RelatedEntityRow[];

    for (const row of relatedRows) {
      const list = relatedByMessage.get(row.message_id) ?? [];
      list.push({
        entity_id: row.entity_id,
        entity_type: cleanString(row.entity_type),
        canonical_name: cleanString(row.canonical_name),
        title: titleFromSnapshot(row),
        relationship_type: row.relationship_type,
      });
      relatedByMessage.set(row.message_id, list);
    }
  }

  const items: RecentConversationItem[] = conversationsPage.map((row) => {
    const messages = messagesByConversation.get(row.conversation_id) ?? [];
    for (const message of messages) {
      message.related_entities = relatedByMessage.get(message.message_id) ?? [];
    }
    return {
      conversation_id: row.conversation_id,
      canonical_name: cleanString(row.canonical_name),
      title: cleanString(row.title),
      activity_at: latestTs(
        row.latest_message_activity,
        row.last_observation_at,
        row.updated_at,
        row.created_at,
      ),
      message_count: Number(row.message_count ?? messages.length ?? 0),
      messages,
    };
  });

  return {
    items,
    has_more: hasMore,
    limit: safeLimit,
    offset: safeOffset,
  };
}
