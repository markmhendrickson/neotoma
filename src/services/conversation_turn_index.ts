/**
 * FU-2026-05-003: Conversation turn index.
 *
 * GET /conversations/:conversation_id/turn-index returns one entry per
 * `conversation_message` linked PART_OF the conversation, with the entities
 * REFERS_TO from that message (partitioned into stored / retrieved / issues).
 *
 * Drives Inspector per-turn anchor sections (`#msg-N`, `#stored-N`, etc.) and
 * the turn timeline sidebar. The endpoint is read-only and does not write any
 * new observations or relationships.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";

const BOOKKEEPING_TYPES = new Set(["conversation", "conversation_message", "agent_message"]);
const CONTENT_PREVIEW_LIMIT = 200;

export type ConversationTurnEntityRef = {
  entity_id: string;
  entity_type: string;
  canonical_name?: string | null;
};

export type ConversationTurn = {
  turn_number: number;
  message_entity_id: string;
  role: string;
  turn_key: string;
  content_preview: string | null;
  created_at: string | null;
  stored: ConversationTurnEntityRef[];
  retrieved: ConversationTurnEntityRef[];
  issues: ConversationTurnEntityRef[];
};

export type ConversationTurnIndex = {
  conversation_id: string;
  conversation_entity_id: string;
  turns: ConversationTurn[];
};

export class ConversationTurnIndexError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type SnapshotRow = {
  entity_id: string;
  entity_type: string;
  snapshot?: Record<string, unknown> | null;
  canonical_name?: string | null;
  computed_at?: string | null;
  last_observation_at?: string | null;
};

type RelRow = {
  source_entity_id?: string | null;
  target_entity_id?: string | null;
};

/**
 * Resolve a conversation identifier into the entity row. Accepts either the
 * conversation's `conversation_id` field (the stable agent-supplied value) or
 * the conversation `entity_id` (`ent_...`). Inspector typically routes by the
 * entity_id; agent callers tend to use conversation_id.
 */
async function resolveConversationEntity(userId: string, identifier: string): Promise<SnapshotRow> {
  // Try entity_id first if it looks like one.
  if (identifier.startsWith("ent_")) {
    const { data } = await db
      .from("entity_snapshots")
      .select("entity_id, entity_type, snapshot, canonical_name")
      .eq("user_id", userId)
      .eq("entity_id", identifier)
      .eq("entity_type", "conversation")
      .limit(1);
    const rows = (data ?? []) as SnapshotRow[];
    if (rows.length > 0) return rows[0];
  }
  // Otherwise match by snapshot.conversation_id.
  const { data, error } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, snapshot, canonical_name")
    .eq("user_id", userId)
    .eq("entity_type", "conversation");
  if (error) {
    throw new ConversationTurnIndexError(
      "ERR_TURN_INDEX_LOOKUP_FAILED",
      `Failed to load conversation entities: ${error.message ?? String(error)}`,
      500
    );
  }
  for (const row of (data ?? []) as SnapshotRow[]) {
    const snap = (row.snapshot ?? {}) as Record<string, unknown>;
    if (snap.conversation_id === identifier) return row;
  }
  throw new ConversationTurnIndexError(
    "ERR_TURN_INDEX_CONVERSATION_NOT_FOUND",
    `No conversation found for identifier "${identifier}"`,
    404
  );
}

async function loadConversationMessages(
  userId: string,
  conversationEntityId: string
): Promise<SnapshotRow[]> {
  const { data: edges } = await db
    .from("relationship_snapshots")
    .select("source_entity_id")
    .eq("user_id", userId)
    .eq("relationship_type", "PART_OF")
    .eq("target_entity_id", conversationEntityId);
  const memberIds: string[] = [];
  for (const row of (edges ?? []) as RelRow[]) {
    if (typeof row.source_entity_id === "string" && row.source_entity_id.length > 0) {
      memberIds.push(row.source_entity_id);
    }
  }
  const uniqueIds = Array.from(new Set(memberIds));
  if (uniqueIds.length === 0) return [];
  const { data: rows } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, snapshot, canonical_name, computed_at, last_observation_at")
    .eq("user_id", userId)
    .in("entity_id", uniqueIds);
  const cmRows = ((rows ?? []) as SnapshotRow[]).filter(
    (r) => r.entity_type === "conversation_message" || r.entity_type === "agent_message"
  );
  return cmRows.slice();
}

async function loadRefersToEdges(
  userId: string,
  messageEntityIds: string[]
): Promise<Map<string, string[]>> {
  if (messageEntityIds.length === 0) return new Map();
  const { data } = await db
    .from("relationship_snapshots")
    .select("source_entity_id, target_entity_id")
    .eq("user_id", userId)
    .eq("relationship_type", "REFERS_TO")
    .in("source_entity_id", messageEntityIds);
  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as RelRow[]) {
    if (
      typeof row.source_entity_id !== "string" ||
      typeof row.target_entity_id !== "string" ||
      row.target_entity_id.length === 0
    ) {
      continue;
    }
    const list = map.get(row.source_entity_id) ?? [];
    if (!list.includes(row.target_entity_id)) list.push(row.target_entity_id);
    map.set(row.source_entity_id, list);
  }
  return map;
}

async function loadEntitiesByIds(
  userId: string,
  ids: string[]
): Promise<Map<string, ConversationTurnEntityRef>> {
  const map = new Map<string, ConversationTurnEntityRef>();
  if (ids.length === 0) return map;
  const { data } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, canonical_name")
    .eq("user_id", userId)
    .in("entity_id", ids);
  for (const row of (data ?? []) as SnapshotRow[]) {
    map.set(row.entity_id, {
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      canonical_name: row.canonical_name ?? null,
    });
  }
  return map;
}

function deriveTurnNumber(snap: Record<string, unknown>, fallbackIndex: number): number {
  const declared = snap.turn_number;
  if (typeof declared === "number" && Number.isFinite(declared)) return declared;
  return fallbackIndex;
}

function deriveRole(snap: Record<string, unknown>): string {
  if (typeof snap.sender_kind === "string" && snap.sender_kind.length > 0) return snap.sender_kind;
  if (typeof snap.role === "string" && snap.role.length > 0) return snap.role;
  return "unknown";
}

function derivePreview(snap: Record<string, unknown>): string | null {
  const content = snap.content;
  if (typeof content !== "string" || content.length === 0) return null;
  return content.length > CONTENT_PREVIEW_LIMIT ? content.slice(0, CONTENT_PREVIEW_LIMIT) : content;
}

function sortMessagesByTurn(rows: SnapshotRow[]): SnapshotRow[] {
  // Stable sort: turn_number ascending, fallback to created_at ascending,
  // then entity_id ascending to ensure determinism (docs/architecture/determinism.md).
  return rows.slice().sort((a, b) => {
    const aSnap = (a.snapshot ?? {}) as Record<string, unknown>;
    const bSnap = (b.snapshot ?? {}) as Record<string, unknown>;
    const aTurn = typeof aSnap.turn_number === "number" ? aSnap.turn_number : null;
    const bTurn = typeof bSnap.turn_number === "number" ? bSnap.turn_number : null;
    if (aTurn !== null && bTurn !== null && aTurn !== bTurn) return aTurn - bTurn;
    if (aTurn !== null && bTurn === null) return -1;
    if (aTurn === null && bTurn !== null) return 1;
    const aCreated = a.computed_at ?? a.last_observation_at ?? "";
    const bCreated = b.computed_at ?? b.last_observation_at ?? "";
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return a.entity_id.localeCompare(b.entity_id);
  });
}

export async function computeConversationTurnIndex(params: {
  userId: string;
  conversationIdentifier: string;
}): Promise<ConversationTurnIndex> {
  const { userId, conversationIdentifier } = params;
  if (!conversationIdentifier) {
    throw new ConversationTurnIndexError(
      "ERR_TURN_INDEX_BAD_REQUEST",
      "conversation_id is required"
    );
  }

  const conversation = await resolveConversationEntity(userId, conversationIdentifier);
  const conversationSnap = (conversation.snapshot ?? {}) as Record<string, unknown>;
  const declaredConversationId =
    typeof conversationSnap.conversation_id === "string"
      ? conversationSnap.conversation_id
      : conversation.entity_id;

  const messageRows = await loadConversationMessages(userId, conversation.entity_id);
  const sorted = sortMessagesByTurn(messageRows);
  const messageIds = sorted.map((row) => row.entity_id);
  const refersToByMessage = await loadRefersToEdges(userId, messageIds);

  // Build set of all targets referenced so we can resolve them in one go.
  const allTargets = new Set<string>();
  for (const ids of refersToByMessage.values()) for (const id of ids) allTargets.add(id);
  const entitiesByid = await loadEntitiesByIds(userId, Array.from(allTargets));

  // Index assistant message targets per turn_number so we can partition
  // user-message REFERS_TO into stored-by-assistant vs retrieved-only.
  const assistantTargetsByTurn = new Map<number, Set<string>>();
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const snap = (row.snapshot ?? {}) as Record<string, unknown>;
    const role = deriveRole(snap);
    if (role !== "assistant") continue;
    const turnNumber = deriveTurnNumber(snap, i + 1);
    const targets = refersToByMessage.get(row.entity_id) ?? [];
    const set = assistantTargetsByTurn.get(turnNumber) ?? new Set<string>();
    for (const id of targets) set.add(id);
    assistantTargetsByTurn.set(turnNumber, set);
  }

  const turns: ConversationTurn[] = sorted.map((row, idx) => {
    const snap = (row.snapshot ?? {}) as Record<string, unknown>;
    const turnNumber = deriveTurnNumber(snap, idx + 1);
    const role = deriveRole(snap);
    const turnKey = typeof snap.turn_key === "string" ? snap.turn_key : "";
    const targetIds = refersToByMessage.get(row.entity_id) ?? [];
    const assistantSet = assistantTargetsByTurn.get(turnNumber) ?? new Set<string>();

    const stored: ConversationTurnEntityRef[] = [];
    const retrieved: ConversationTurnEntityRef[] = [];
    const issues: ConversationTurnEntityRef[] = [];

    for (const targetId of targetIds) {
      const entity = entitiesByid.get(targetId);
      if (!entity) continue;
      if (BOOKKEEPING_TYPES.has(entity.entity_type)) continue;
      if (entity.entity_type === "issue") {
        issues.push(entity);
        continue;
      }
      if (role === "assistant") {
        stored.push(entity);
        continue;
      }
      // user / agent / tool message: partition vs assistant set for this turn.
      if (assistantSet.has(targetId)) {
        // Assistant also REFERS_TO this entity → it was stored this turn.
        stored.push(entity);
      } else {
        retrieved.push(entity);
      }
    }

    return {
      turn_number: turnNumber,
      message_entity_id: row.entity_id,
      role,
      turn_key: turnKey,
      content_preview: derivePreview(snap),
      created_at: row.computed_at ?? row.last_observation_at ?? null,
      stored,
      retrieved,
      issues,
    };
  });

  return {
    conversation_id: declaredConversationId as string,
    conversation_entity_id: conversation.entity_id,
    turns,
  };
}

export function logConversationTurnIndexError(err: unknown, ctx: Record<string, unknown>): void {
  logger.warn(
    `conversation_turn_index: ${err instanceof Error ? err.message : String(err)} (${JSON.stringify(ctx)})`
  );
}
