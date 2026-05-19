/**
 * FU-2026-05-002: neotoma_turn_summary computation.
 *
 * Resolves the assistant `conversation_message` for a given conversation_id +
 * turn_key, then derives:
 *   - turn_number — from the resolved message's snapshot, falling back to
 *     total message count when absent on legacy rows.
 *   - conversation_message_count — total `conversation_message` entities
 *     PART_OF the conversation.
 *   - stored — entities REFERS_TO from the assistant message that were
 *     created or updated this turn (excludes chat bookkeeping).
 *   - retrieved — entities REFERS_TO from the user message of the same turn
 *     that existed before the turn (no new observation in this turn).
 *   - issues — issue entities surfaced this turn.
 *
 * The status line is a single plain-text line that agents emit verbatim.
 * The widget URI is an MCP resource URI for ext-apps widget hosts.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";

const BOOKKEEPING_TYPES = new Set(["conversation", "conversation_message", "agent_message"]);

export type TurnSummaryEntityRef = {
  entity_id: string;
  entity_type: string;
  canonical_name?: string | null;
};

export type TurnSummaryResult = {
  status_line: string;
  widget_uri: string | null;
  turn_number: number;
  conversation_message_count: number;
  stored: TurnSummaryEntityRef[];
  retrieved: TurnSummaryEntityRef[];
  issues: TurnSummaryEntityRef[];
};

export class TurnSummaryError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function buildStatusLine(
  turnNumber: number,
  totalMessages: number,
  storedCount: number,
  retrievedCount: number,
  issueCount: number
): string {
  const base = `msg ${turnNumber}/${totalMessages}, stored ${storedCount}, retrieved ${retrievedCount}`;
  return issueCount > 0 ? `${base}, issues ${issueCount}` : base;
}

function buildWidgetUri(
  conversationId: string,
  turnNumber: number,
  storedCount: number,
  retrievedCount: number,
  issueCount: number
): string {
  const params = new URLSearchParams({
    conversation_id: conversationId,
    turn: String(turnNumber),
    stored: String(storedCount),
    retrieved: String(retrievedCount),
    issues: String(issueCount),
  });
  return `ui://neotoma/turn-summary?${params.toString()}`;
}

type SnapshotRow = {
  entity_id: string;
  entity_type: string;
  snapshot?: Record<string, unknown> | null;
  canonical_name?: string | null;
  created_at?: string | null;
};

async function resolveAssistantMessage(
  userId: string,
  conversationId: string,
  turnKey: string
): Promise<SnapshotRow> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, snapshot, canonical_name")
    .eq("user_id", userId)
    .eq("entity_type", "conversation_message");
  if (error) {
    throw new TurnSummaryError(
      "ERR_TURN_SUMMARY_LOOKUP_FAILED",
      `Failed to load conversation_message entities: ${error.message ?? String(error)}`,
      500
    );
  }
  const rows = ((data ?? []) as SnapshotRow[]).filter((row) => {
    const snap = (row.snapshot ?? {}) as Record<string, unknown>;
    return snap.turn_key === turnKey;
  });
  if (rows.length === 0) {
    throw new TurnSummaryError(
      "ERR_TURN_SUMMARY_MESSAGE_NOT_FOUND",
      `No conversation_message found for turn_key "${turnKey}"`,
      404
    );
  }
  if (rows.length > 1) {
    throw new TurnSummaryError(
      "ERR_TURN_SUMMARY_AMBIGUOUS_TURN_KEY",
      `Multiple conversation_message entities share turn_key "${turnKey}"`,
      409
    );
  }
  return rows[0];
}

async function resolveConversationEntityId(
  userId: string,
  assistantMessageId: string
): Promise<string> {
  const { data, error } = await db
    .from("relationship_snapshots")
    .select("target_entity_id")
    .eq("user_id", userId)
    .eq("relationship_type", "PART_OF")
    .eq("source_entity_id", assistantMessageId);
  if (error) {
    throw new TurnSummaryError(
      "ERR_TURN_SUMMARY_LOOKUP_FAILED",
      `Failed to load PART_OF relationships: ${error.message ?? String(error)}`,
      500
    );
  }
  const rows = (data ?? []) as Array<{ target_entity_id?: string | null }>;
  const candidate = rows.find(
    (r) => typeof r.target_entity_id === "string" && r.target_entity_id.length > 0
  );
  if (!candidate || typeof candidate.target_entity_id !== "string") {
    throw new TurnSummaryError(
      "ERR_TURN_SUMMARY_NO_CONVERSATION",
      `Assistant message ${assistantMessageId} has no PART_OF conversation edge`,
      409
    );
  }
  return candidate.target_entity_id;
}

async function countConversationMessages(
  userId: string,
  conversationEntityId: string
): Promise<number> {
  const { data: partOfRows, error } = await db
    .from("relationship_snapshots")
    .select("source_entity_id")
    .eq("user_id", userId)
    .eq("relationship_type", "PART_OF")
    .eq("target_entity_id", conversationEntityId);
  if (error) return 0;
  const memberIds: string[] = [];
  for (const row of (partOfRows ?? []) as Array<{ source_entity_id?: string | null }>) {
    if (typeof row.source_entity_id === "string" && row.source_entity_id.length > 0) {
      memberIds.push(row.source_entity_id);
    }
  }
  const uniqueMemberIds = Array.from(new Set(memberIds));
  if (uniqueMemberIds.length === 0) return 0;
  const { count } = await db
    .from("entity_snapshots")
    .select("entity_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entity_type", "conversation_message")
    .in("entity_id", uniqueMemberIds);
  return typeof count === "number" ? count : 0;
}

async function fetchReferredEntities(
  userId: string,
  sourceMessageId: string
): Promise<TurnSummaryEntityRef[]> {
  const { data: edges } = await db
    .from("relationship_snapshots")
    .select("target_entity_id")
    .eq("user_id", userId)
    .eq("relationship_type", "REFERS_TO")
    .eq("source_entity_id", sourceMessageId);
  const targetIds: string[] = [];
  for (const row of (edges ?? []) as Array<{ target_entity_id?: string | null }>) {
    if (typeof row.target_entity_id === "string" && row.target_entity_id.length > 0) {
      targetIds.push(row.target_entity_id);
    }
  }
  const uniqueIds = Array.from(new Set(targetIds));
  if (uniqueIds.length === 0) return [];
  const { data: snapshots } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, canonical_name")
    .eq("user_id", userId)
    .in("entity_id", uniqueIds);
  const refs: TurnSummaryEntityRef[] = [];
  for (const row of (snapshots ?? []) as SnapshotRow[]) {
    if (BOOKKEEPING_TYPES.has(row.entity_type)) continue;
    refs.push({
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      canonical_name: row.canonical_name ?? null,
    });
  }
  return refs;
}

async function findSiblingUserMessage(
  userId: string,
  conversationEntityId: string,
  assistantTurnKey: string
): Promise<string | null> {
  // The user message for the same turn shares the conversation_id:turn_id
  // prefix with the assistant turn_key (the user has no ":assistant" suffix).
  const userTurnKey = assistantTurnKey.replace(/:assistant$/, "");
  if (userTurnKey === assistantTurnKey) return null;
  const { data } = await db
    .from("relationship_snapshots")
    .select("source_entity_id")
    .eq("user_id", userId)
    .eq("relationship_type", "PART_OF")
    .eq("target_entity_id", conversationEntityId);
  const memberIds: string[] = [];
  for (const row of (data ?? []) as Array<{ source_entity_id?: string | null }>) {
    if (typeof row.source_entity_id === "string") memberIds.push(row.source_entity_id);
  }
  if (memberIds.length === 0) return null;
  const { data: rows } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .eq("user_id", userId)
    .eq("entity_type", "conversation_message")
    .in("entity_id", Array.from(new Set(memberIds)));
  for (const row of (rows ?? []) as SnapshotRow[]) {
    const snap = (row.snapshot ?? {}) as Record<string, unknown>;
    if (snap.turn_key === userTurnKey) return row.entity_id;
  }
  return null;
}

export async function computeTurnSummary(params: {
  userId: string;
  conversationId: string;
  turnKey: string;
}): Promise<TurnSummaryResult> {
  const { userId, conversationId, turnKey } = params;
  if (!conversationId || !turnKey) {
    throw new TurnSummaryError(
      "ERR_TURN_SUMMARY_BAD_REQUEST",
      "conversation_id and turn_key are required"
    );
  }

  const assistantMessage = await resolveAssistantMessage(userId, conversationId, turnKey);
  const assistantSnapshot = (assistantMessage.snapshot ?? {}) as Record<string, unknown>;
  const conversationEntityId = await resolveConversationEntityId(
    userId,
    assistantMessage.entity_id
  );

  const totalMessages = await countConversationMessages(userId, conversationEntityId);

  let turnNumber: number;
  const declaredTurnNumber = assistantSnapshot.turn_number;
  if (typeof declaredTurnNumber === "number" && Number.isFinite(declaredTurnNumber)) {
    turnNumber = declaredTurnNumber;
  } else {
    // Legacy rows: use total message count as the turn ordinal. The closing
    // assistant message is the most recent message in the conversation, so its
    // index equals the total count. Best-effort.
    turnNumber = totalMessages;
  }

  const storedRefs = await fetchReferredEntities(userId, assistantMessage.entity_id);

  const userMessageId = await findSiblingUserMessage(userId, conversationEntityId, turnKey);
  const userRefs = userMessageId ? await fetchReferredEntities(userId, userMessageId) : [];

  // Partition stored vs retrieved: any entity REFERS_TO from the assistant is
  // "stored" (we wrote a new observation this turn, or cited it as material to
  // the reply). Entities REFERS_TO only from the user message and not from the
  // assistant are "retrieved" — they existed before the turn and the reply
  // didn't materially produce them.
  const storedIds = new Set(storedRefs.map((r) => r.entity_id));
  const retrieved: TurnSummaryEntityRef[] = userRefs.filter((r) => !storedIds.has(r.entity_id));
  const issues: TurnSummaryEntityRef[] = storedRefs.filter((r) => r.entity_type === "issue");
  const stored: TurnSummaryEntityRef[] = storedRefs.filter((r) => r.entity_type !== "issue");

  const statusLine = buildStatusLine(
    turnNumber,
    totalMessages,
    stored.length,
    retrieved.length,
    issues.length
  );
  const widgetUri = buildWidgetUri(
    conversationId,
    turnNumber,
    stored.length,
    retrieved.length,
    issues.length
  );

  return {
    status_line: statusLine,
    widget_uri: widgetUri,
    turn_number: turnNumber,
    conversation_message_count: totalMessages,
    stored,
    retrieved,
    issues,
  };
}

export function logTurnSummaryError(err: unknown, context: Record<string, unknown>): void {
  logger.warn(
    `turn_summary: ${err instanceof Error ? err.message : String(err)} (${JSON.stringify(context)})`
  );
}
