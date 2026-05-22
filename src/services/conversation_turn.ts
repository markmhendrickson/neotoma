import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

const TS_EPOCH = "1970-01-01T00:00:00.000Z";

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

function safeJson<T>(raw: string | null | undefined): T | null {
  const s = cleanString(raw);
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export interface ConversationTurnHookSummary {
  hook_event_count: number;
  tool_invocation_count: number;
  store_structured_calls: number;
  retrieve_calls: number;
  stored_entity_count: number;
  retrieved_entity_count: number;
  neotoma_tool_failures: number;
}

export interface ConversationTurnSummary {
  entity_id: string;
  turn_key: string;
  session_id: string | null;
  turn_id: string | null;
  conversation_id: string | null;
  harness: string | null;
  harness_version: string | null;
  model: string | null;
  status: string | null;
  cwd: string | null;
  working_directory: string | null;
  git_branch: string | null;
  active_file_refs: string[];
  context_source: string | null;
  hook_events: string[];
  missed_steps: string[];
  tool_invocation_count: number;
  store_structured_calls: number;
  retrieve_calls: number;
  neotoma_tool_failures: number;
  retrieved_entity_ids: string[];
  stored_entity_ids: string[];
  injected_context_chars: number | null;
  failure_hint_shown: boolean | null;
  safety_net_used: boolean | null;
  started_at: string | null;
  ended_at: string | null;
  activity_at: string;
  latest_write_provenance: Record<string, unknown> | null;
  hook_summary: ConversationTurnHookSummary;
}

export interface ConversationTurnRelatedEntity {
  entity_id: string;
  entity_type: string | null;
  canonical_name: string | null;
  title: string | null;
  relationship_type: string;
  direction: "outgoing" | "incoming";
  role: "stored" | "retrieved" | "related";
}

export interface ConversationTurnMessageRelatedEntity {
  entity_id: string;
  entity_type: string | null;
  canonical_name: string | null;
  title: string | null;
  relationship_type: string;
}

export interface ConversationTurnMessage {
  message_id: string;
  canonical_name: string | null;
  role: string | null;
  sender_kind: string | null;
  content: string | null;
  turn_key: string | null;
  activity_at: string;
  related_entities: ConversationTurnMessageRelatedEntity[];
  hook_summary: ConversationTurnHookSummary | null;
}

export interface ConversationTurnDetail extends ConversationTurnSummary {
  related_entities: ConversationTurnRelatedEntity[];
  messages: ConversationTurnMessage[];
}

export interface ConversationTurnsFilters {
  harness?: string | null;
  status?: string | null;
  activity_after?: string | null;
  activity_before?: string | null;
  agent_key?: string | null;
}

type TurnRow = {
  entity_id: string;
  canonical_name: string | null;
  snapshot_json: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_observation_at: string | null;
  latest_write_provenance_json: string | null;
};

type MessageRow = {
  message_id: string;
  canonical_name: string | null;
  role: string | null;
  sender_kind: string | null;
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

function buildSummaryFromRow(row: TurnRow): ConversationTurnSummary {
  const snap = safeJson<Record<string, unknown>>(row.snapshot_json) ?? {};
  const hookEvents = Array.isArray(snap.hook_events) ? (snap.hook_events as string[]) : [];
  const missedSteps = Array.isArray(snap.missed_steps) ? (snap.missed_steps as string[]) : [];
  const storedIds = Array.isArray(snap.stored_entity_ids)
    ? (snap.stored_entity_ids as string[])
    : [];
  const retrievedIds = Array.isArray(snap.retrieved_entity_ids)
    ? (snap.retrieved_entity_ids as string[])
    : [];
  const toolInvocationCount =
    typeof snap.tool_invocation_count === "number" ? snap.tool_invocation_count : 0;
  const storeStructuredCalls =
    typeof snap.store_structured_calls === "number" ? snap.store_structured_calls : 0;
  const retrieveCalls = typeof snap.retrieve_calls === "number" ? snap.retrieve_calls : 0;
  const neotomaToolFailures =
    typeof snap.neotoma_tool_failures === "number" ? snap.neotoma_tool_failures : 0;
  const cwd = cleanString(snap.cwd as string) ?? cleanString(snap.working_directory as string);
  return {
    entity_id: row.entity_id,
    turn_key: cleanString(snap.turn_key as string) ?? cleanString(row.canonical_name) ?? "",
    session_id: cleanString(snap.session_id as string),
    turn_id: cleanString(snap.turn_id as string),
    conversation_id: cleanString(snap.conversation_id as string),
    harness: cleanString(snap.harness as string),
    harness_version: cleanString(snap.harness_version as string),
    model: cleanString(snap.model as string),
    status: cleanString(snap.status as string),
    cwd,
    working_directory: cwd,
    git_branch: cleanString(snap.git_branch as string),
    active_file_refs: Array.isArray(snap.active_file_refs)
      ? (snap.active_file_refs as string[])
      : [],
    context_source: cleanString(snap.context_source as string),
    hook_events: hookEvents,
    missed_steps: missedSteps,
    tool_invocation_count: toolInvocationCount,
    store_structured_calls: storeStructuredCalls,
    retrieve_calls: retrieveCalls,
    neotoma_tool_failures: neotomaToolFailures,
    retrieved_entity_ids: retrievedIds,
    stored_entity_ids: storedIds,
    injected_context_chars:
      typeof snap.injected_context_chars === "number" ? snap.injected_context_chars : null,
    failure_hint_shown:
      typeof snap.failure_hint_shown === "boolean" ? snap.failure_hint_shown : null,
    safety_net_used: typeof snap.safety_net_used === "boolean" ? snap.safety_net_used : null,
    started_at: cleanString(snap.started_at as string),
    ended_at: cleanString(snap.ended_at as string),
    activity_at: latestTs(row.last_observation_at, row.updated_at, row.created_at),
    latest_write_provenance: safeJson(row.latest_write_provenance_json),
    hook_summary: {
      hook_event_count: hookEvents.length,
      tool_invocation_count: toolInvocationCount,
      store_structured_calls: storeStructuredCalls,
      retrieve_calls: retrieveCalls,
      stored_entity_count: storedIds.length,
      retrieved_entity_count: retrievedIds.length,
      neotoma_tool_failures: neotomaToolFailures,
    },
  };
}

const LIST_SQL = `
SELECT
  e.id AS entity_id,
  e.canonical_name AS canonical_name,
  es.snapshot AS snapshot_json,
  e.created_at AS created_at,
  e.updated_at AS updated_at,
  es.last_observation_at AS last_observation_at,
  (
    SELECT o.provenance
    FROM observations o
    WHERE o.entity_id = e.id AND o.user_id = ?
    ORDER BY ifnull(nullif(trim(o.observed_at), ''), '${TS_EPOCH}') DESC
    LIMIT 1
  ) AS latest_write_provenance_json
FROM entities e
LEFT JOIN entity_snapshots es ON es.entity_id = e.id
WHERE e.user_id = ?
  AND e.entity_type IN ('conversation_turn', 'turn_compliance', 'turn_activity')
  AND (e.merged_to_entity_id IS NULL OR trim(ifnull(e.merged_to_entity_id, '')) = '')
  AND (? IS NULL OR json_extract(es.snapshot, '$.harness') = ?)
  AND (? IS NULL OR json_extract(es.snapshot, '$.status') = ?)
  AND (? IS NULL OR max(
    ifnull(nullif(trim(es.last_observation_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(e.updated_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(e.created_at), ''), '${TS_EPOCH}')
  ) >= ?)
  AND (? IS NULL OR max(
    ifnull(nullif(trim(es.last_observation_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(e.updated_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(e.created_at), ''), '${TS_EPOCH}')
  ) <= ?)
ORDER BY
  max(
    ifnull(nullif(trim(es.last_observation_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(e.updated_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(e.created_at), ''), '${TS_EPOCH}')
  ) DESC,
  e.id DESC
LIMIT ? OFFSET ?
`;

export function listConversationTurns(
  userId: string,
  limit: number,
  offset: number,
  filters?: ConversationTurnsFilters | null
): { items: ConversationTurnSummary[]; has_more: boolean; limit: number; offset: number } {
  const db = getSqliteDb();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const fetchLimit = safeLimit + 1;

  const harness = filters?.harness?.trim() || null;
  const status = filters?.status?.trim() || null;
  const activityAfter = filters?.activity_after?.trim() || null;
  const activityBefore = filters?.activity_before?.trim() || null;

  const rows = db
    .prepare(LIST_SQL)
    .all(
      userId,
      userId,
      harness,
      harness,
      status,
      status,
      activityAfter,
      activityAfter,
      activityBefore,
      activityBefore,
      fetchLimit,
      safeOffset
    ) as TurnRow[];

  const hasMore = rows.length > safeLimit;
  const page = hasMore ? rows.slice(0, safeLimit) : rows;
  return {
    items: page.map(buildSummaryFromRow),
    has_more: hasMore,
    limit: safeLimit,
    offset: safeOffset,
  };
}

const DETAIL_SQL = `
SELECT
  e.id AS entity_id,
  e.canonical_name AS canonical_name,
  es.snapshot AS snapshot_json,
  e.created_at AS created_at,
  e.updated_at AS updated_at,
  es.last_observation_at AS last_observation_at,
  (
    SELECT o.provenance
    FROM observations o
    WHERE o.entity_id = e.id AND o.user_id = ?
    ORDER BY ifnull(nullif(trim(o.observed_at), ''), '${TS_EPOCH}') DESC
    LIMIT 1
  ) AS latest_write_provenance_json
FROM entities e
LEFT JOIN entity_snapshots es ON es.entity_id = e.id
WHERE e.user_id = ?
  AND e.entity_type IN ('conversation_turn', 'turn_compliance', 'turn_activity')
  AND e.canonical_name = ?
LIMIT 1
`;

export function getConversationTurn(
  userId: string,
  turnKey: string
): ConversationTurnDetail | null {
  const db = getSqliteDb();
  const row = db.prepare(DETAIL_SQL).get(userId, userId, turnKey) as TurnRow | undefined;
  if (!row) return null;
  const summary = buildSummaryFromRow(row);
  const snap = safeJson<Record<string, unknown>>(row.snapshot_json) ?? {};
  const storedIds = Array.isArray(snap.stored_entity_ids)
    ? (snap.stored_entity_ids as string[])
    : [];
  const retrievedIds = Array.isArray(snap.retrieved_entity_ids)
    ? (snap.retrieved_entity_ids as string[])
    : [];
  const allIds = [...new Set([...storedIds, ...retrievedIds])];

  const related: ConversationTurnRelatedEntity[] = [];
  if (allIds.length > 0) {
    const relatedRows = db
      .prepare(
        `SELECT id, entity_type, canonical_name FROM entities WHERE user_id = ? AND id IN (${placeholders(allIds.length)})`
      )
      .all(userId, ...allIds) as Array<{
      id: string;
      entity_type: string | null;
      canonical_name: string | null;
    }>;
    const byId = new Map(relatedRows.map((r) => [r.id, r]));
    for (const id of storedIds) {
      const r = byId.get(id);
      related.push({
        entity_id: id,
        entity_type: r?.entity_type ?? null,
        canonical_name: r?.canonical_name ?? null,
        title: null,
        relationship_type: "stored",
        direction: "outgoing",
        role: "stored",
      });
    }
    for (const id of retrievedIds) {
      if (storedIds.includes(id)) continue;
      const r = byId.get(id);
      related.push({
        entity_id: id,
        entity_type: r?.entity_type ?? null,
        canonical_name: r?.canonical_name ?? null,
        title: null,
        relationship_type: "retrieved",
        direction: "outgoing",
        role: "retrieved",
      });
    }
  }

  return {
    ...summary,
    related_entities: related,
    messages: listMessagesForTurn(userId, summary.turn_key, summary.hook_summary),
  };
}

function listMessagesForTurn(
  userId: string,
  turnKey: string,
  hookSummary: ConversationTurnHookSummary
): ConversationTurnMessage[] {
  const cleanTurnKey = cleanString(turnKey);
  if (!cleanTurnKey) return [];

  const db = getSqliteDb();
  const messageRows = db
    .prepare(
      `SELECT
        e.id AS message_id,
        e.canonical_name AS canonical_name,
        json_extract(es.snapshot, '$.role') AS role,
        json_extract(es.snapshot, '$.sender_kind') AS sender_kind,
        json_extract(es.snapshot, '$.content') AS content,
        json_extract(es.snapshot, '$.turn_key') AS turn_key,
        e.created_at AS created_at,
        e.updated_at AS updated_at,
        es.last_observation_at AS last_observation_at
      FROM entities e
      LEFT JOIN entity_snapshots es
        ON es.entity_id = e.id
      WHERE e.user_id = ?
        AND e.entity_type IN ('conversation_message', 'agent_message')
        AND json_extract(es.snapshot, '$.turn_key') IN (?, ?)
        AND (e.merged_to_entity_id IS NULL OR trim(ifnull(e.merged_to_entity_id, '')) = '')
      ORDER BY
        max(
          ifnull(nullif(trim(es.last_observation_at), ''), '${TS_EPOCH}'),
          ifnull(nullif(trim(e.updated_at), ''), '${TS_EPOCH}'),
          ifnull(nullif(trim(e.created_at), ''), '${TS_EPOCH}')
        ) ASC,
        e.id ASC`
    )
    .all(userId, cleanTurnKey, `${cleanTurnKey}:assistant`) as MessageRow[];

  const messages = messageRows.map((row) => ({
    message_id: row.message_id,
    canonical_name: cleanString(row.canonical_name),
    role: cleanString(row.role),
    sender_kind: cleanString(row.sender_kind),
    content: cleanString(row.content),
    turn_key: cleanString(row.turn_key),
    activity_at: latestTs(row.last_observation_at, row.updated_at, row.created_at),
    related_entities: [] as ConversationTurnMessageRelatedEntity[],
    hook_summary: hookSummary,
  }));

  if (messages.length === 0) return messages;

  const relatedRows = db
    .prepare(
      `SELECT
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
        AND rs.source_entity_id IN (${placeholders(messages.length)})
        AND rs.relationship_type != 'PART_OF'
      ORDER BY rs.last_observation_at DESC, rs.computed_at DESC, te.id`
    )
    .all(userId, userId, ...messages.map((message) => message.message_id)) as RelatedEntityRow[];

  const relatedByMessage = new Map<string, ConversationTurnMessageRelatedEntity[]>();
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

  for (const message of messages) {
    message.related_entities = relatedByMessage.get(message.message_id) ?? [];
  }

  return messages;
}

/**
 * Build a lightweight hook summary for a set of turn_keys,
 * used to enrich recent_conversations messages.
 */
export function listHookSummariesByTurnKeys(
  userId: string,
  turnKeys: string[]
): Map<string, ConversationTurnHookSummary> {
  if (turnKeys.length === 0) return new Map();
  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT e.canonical_name, es.snapshot
       FROM entities e
       LEFT JOIN entity_snapshots es ON es.entity_id = e.id
       WHERE e.user_id = ?
         AND e.entity_type IN ('conversation_turn', 'turn_compliance', 'turn_activity')
         AND e.canonical_name IN (${placeholders(turnKeys.length)})`
    )
    .all(userId, ...turnKeys) as Array<{ canonical_name: string; snapshot: string | null }>;

  const result = new Map<string, ConversationTurnHookSummary>();
  for (const row of rows) {
    const snap = safeJson<Record<string, unknown>>(row.snapshot) ?? {};
    const hookEvents = Array.isArray(snap.hook_events) ? snap.hook_events : [];
    const storedIds = Array.isArray(snap.stored_entity_ids) ? snap.stored_entity_ids : [];
    const retrievedIds = Array.isArray(snap.retrieved_entity_ids) ? snap.retrieved_entity_ids : [];
    result.set(row.canonical_name, {
      hook_event_count: hookEvents.length,
      tool_invocation_count:
        typeof snap.tool_invocation_count === "number" ? snap.tool_invocation_count : 0,
      store_structured_calls:
        typeof snap.store_structured_calls === "number" ? snap.store_structured_calls : 0,
      retrieve_calls: typeof snap.retrieve_calls === "number" ? snap.retrieve_calls : 0,
      stored_entity_count: storedIds.length,
      retrieved_entity_count: retrievedIds.length,
      neotoma_tool_failures:
        typeof snap.neotoma_tool_failures === "number" ? snap.neotoma_tool_failures : 0,
    });
  }
  return result;
}
