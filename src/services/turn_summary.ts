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
 *
 * On top of that legacy partition, every entity either message REFERS_TO is
 * classified from its observations into the groups the in-chat card shows:
 *   - created   — its first observation landed during this turn.
 *   - updated   — it existed before the turn and gained an observation in it.
 *   - ambiguous — an update that resolved by heuristic name match under a
 *                 schema whose `name_collision_policy` is "warn" (the same
 *                 condition that makes `store` emit HEURISTIC_MERGE).
 *   - retrieved — referenced this turn with no observation written in it.
 * `card` carries those groups as display data and `fallback_text` is the same
 * card rendered as markdown (see turn_summary_view.ts).
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import {
  TURN_SUMMARY_BOOKKEEPING_TYPES,
  buildTurnSummaryCard,
  renderTurnSummaryFallbackText,
  type TurnSummaryCard,
  type TurnSummaryViewEntity,
} from "./turn_summary_view.js";

const BOOKKEEPING_TYPES = TURN_SUMMARY_BOOKKEEPING_TYPES;

/** identity_basis values that mean the resolver matched heuristically. */
const HEURISTIC_IDENTITY_BASES = new Set(["heuristic_name", "heuristic_fallback"]);

/** Snapshot fields tried, in order, for a human-readable entity label. */
const LABEL_FIELDS = ["title", "name", "full_name", "display_name", "subject", "summary"];

export type TurnSummaryEntityRef = {
  entity_id: string;
  entity_type: string;
  canonical_name?: string | null;
  /** Human-readable label (title / name), when the snapshot has one. */
  label?: string | null;
  /** identity_rule of the heuristic match, on `ambiguous` entries only. */
  identity_rule?: string | null;
};

export type TurnSummaryResult = {
  status_line: string;
  widget_uri: string | null;
  turn_number: number;
  conversation_message_count: number;
  stored: TurnSummaryEntityRef[];
  retrieved: TurnSummaryEntityRef[];
  issues: TurnSummaryEntityRef[];
  /** Observation-grounded groups, matching the card. */
  groups: {
    created: TurnSummaryEntityRef[];
    updated: TurnSummaryEntityRef[];
    retrieved: TurnSummaryEntityRef[];
    ambiguous: TurnSummaryEntityRef[];
  };
  /** Display data for the in-chat card (`ui://neotoma/turn-summary`). */
  card: TurnSummaryCard;
  /**
   * `card` rendered as markdown for clients that cannot show MCP Apps.
   * Empty string when the turn touched only chat bookkeeping. Agents relay it
   * verbatim.
   */
  fallback_text: string;
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
    .select("entity_id, entity_type, canonical_name, snapshot")
    .eq("user_id", userId)
    .in("entity_id", uniqueIds);
  const refs: TurnSummaryEntityRef[] = [];
  for (const row of (snapshots ?? []) as SnapshotRow[]) {
    if (BOOKKEEPING_TYPES.has(row.entity_type)) continue;
    refs.push({
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      canonical_name: row.canonical_name ?? null,
      label: labelFromSnapshot(row),
    });
  }
  return refs;
}

function parseSnapshot(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function labelFromSnapshot(row: SnapshotRow): string | null {
  const snap = parseSnapshot(row.snapshot);
  for (const field of LABEL_FIELDS) {
    const value = snap[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return typeof row.canonical_name === "string" && row.canonical_name.trim()
    ? row.canonical_name
    : null;
}

type ObservationRow = {
  entity_id: string;
  created_at?: string | null;
  observed_at?: string | null;
  source_id?: string | null;
  identity_basis?: string | null;
  identity_rule?: string | null;
};

function observationTime(row: ObservationRow): number {
  const raw = row.created_at ?? row.observed_at ?? null;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function loadObservations(
  userId: string,
  entityIds: string[]
): Promise<Map<string, ObservationRow[]>> {
  const byEntity = new Map<string, ObservationRow[]>();
  if (entityIds.length === 0) return byEntity;
  const { data, error } = await db
    .from("observations")
    .select("entity_id, created_at, observed_at, source_id, identity_basis, identity_rule")
    .eq("user_id", userId)
    .in("entity_id", entityIds);
  if (error) {
    logger.warn(`turn_summary: failed to load observations: ${error.message ?? String(error)}`);
    return byEntity;
  }
  for (const row of (data ?? []) as ObservationRow[]) {
    if (typeof row.entity_id !== "string") continue;
    const list = byEntity.get(row.entity_id) ?? [];
    list.push(row);
    byEntity.set(row.entity_id, list);
  }
  for (const list of byEntity.values()) {
    list.sort((a, b) => observationTime(a) - observationTime(b));
  }
  return byEntity;
}

/** Schema-declared name_collision_policy, falling back to the code default. */
async function loadCollisionPolicy(userId: string, entityType: string): Promise<string> {
  try {
    const { schemaRegistry } = await import("./schema_registry.js");
    const entry = await schemaRegistry.loadActiveSchema(entityType, userId);
    const policy = (entry?.schema_definition as { name_collision_policy?: string } | undefined)
      ?.name_collision_policy;
    if (policy) return policy;
  } catch {
    // Fall through to the code default.
  }
  try {
    const { ENTITY_SCHEMAS } = await import("./schema_definitions.js");
    const codeSchema = ENTITY_SCHEMAS[entityType];
    const policy = (codeSchema?.schema_definition as { name_collision_policy?: string } | undefined)
      ?.name_collision_policy;
    if (policy) return policy;
  } catch {
    // Defensive: a module load failure leaves the default.
  }
  return "merge";
}

type TurnWindow = {
  /** Earliest observation time of the user message, or null when unknown. */
  start: number | null;
  /** source_id(s) of the user-phase store, counted as in-turn regardless of clock. */
  sources: Set<string>;
};

/**
 * Partition referenced entities into created / updated / ambiguous /
 * retrieved from their observations. Without a turn window (no sibling user
 * message, e.g. legacy turns) an entity with a single observation counts as
 * created and any other as updated — best effort, since there is no boundary
 * to measure against.
 */
async function classifyByObservations(
  userId: string,
  refs: TurnSummaryEntityRef[],
  observations: Map<string, ObservationRow[]>,
  window: TurnWindow
): Promise<TurnSummaryResult["groups"]> {
  const groups: TurnSummaryResult["groups"] = {
    created: [],
    updated: [],
    retrieved: [],
    ambiguous: [],
  };
  const policyCache = new Map<string, string>();
  const isInTurn = (row: ObservationRow): boolean => {
    if (typeof row.source_id === "string" && window.sources.has(row.source_id)) return true;
    if (window.start === null) return false;
    const t = observationTime(row);
    return Number.isFinite(t) && t >= window.start;
  };

  for (const ref of refs) {
    const rows = observations.get(ref.entity_id) ?? [];
    if (window.start === null && window.sources.size === 0) {
      if (rows.length === 0) groups.retrieved.push(ref);
      else if (rows.length === 1) groups.created.push(ref);
      else groups.updated.push(ref);
      continue;
    }
    const inTurn = rows.filter(isInTurn);
    if (inTurn.length === 0) {
      groups.retrieved.push(ref);
      continue;
    }
    if (inTurn.length === rows.length) {
      groups.created.push(ref);
      continue;
    }
    const heuristic = inTurn.find(
      (row) =>
        typeof row.identity_basis === "string" && HEURISTIC_IDENTITY_BASES.has(row.identity_basis)
    );
    if (heuristic) {
      let policy = policyCache.get(ref.entity_type);
      if (policy === undefined) {
        policy = await loadCollisionPolicy(userId, ref.entity_type);
        policyCache.set(ref.entity_type, policy);
      }
      if (policy === "warn") {
        groups.ambiguous.push({ ...ref, identity_rule: heuristic.identity_rule ?? null });
        continue;
      }
    }
    groups.updated.push(ref);
  }
  return groups;
}

async function loadConversationLabel(
  userId: string,
  conversationEntityId: string
): Promise<string | null> {
  const { data } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, canonical_name, snapshot")
    .eq("user_id", userId)
    .eq("entity_id", conversationEntityId);
  const row = ((data ?? []) as SnapshotRow[])[0];
  return row ? labelFromSnapshot(row) : null;
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
  /** Public app/Inspector origin used for links; omit when unknown. */
  origin?: string | null;
  /** Operator-facing instance name for the header; defaults to the origin host. */
  instanceName?: string | null;
  /** Rows shown across all groups before "N more". */
  maxItems?: number;
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

  // Observation-grounded groups for the card and its text rendering. Every
  // entity either message references is classified once, assistant refs first.
  const allRefs: TurnSummaryEntityRef[] = [...storedRefs];
  const seen = new Set(storedRefs.map((r) => r.entity_id));
  for (const ref of userRefs) {
    if (!seen.has(ref.entity_id)) {
      allRefs.push(ref);
      seen.add(ref.entity_id);
    }
  }
  const observationIds = allRefs.map((r) => r.entity_id);
  if (userMessageId) observationIds.push(userMessageId);
  const observations = await loadObservations(userId, observationIds);
  const window: TurnWindow = { start: null, sources: new Set() };
  const userObs = userMessageId ? (observations.get(userMessageId) ?? []) : [];
  if (userObs.length > 0) {
    // The latest user-message observation opens the turn: earlier ones belong
    // to replays of the same turn_key in previous turns.
    const opening = userObs[userObs.length - 1];
    const t = observationTime(opening);
    window.start = Number.isFinite(t) ? t : null;
    if (typeof opening.source_id === "string" && opening.source_id) {
      window.sources.add(opening.source_id);
    }
  }
  const groups = await classifyByObservations(userId, allRefs, observations, window);

  const conversationLabel = await loadConversationLabel(userId, conversationEntityId).catch(
    () => null
  );
  const toViewEntity = (r: TurnSummaryEntityRef): TurnSummaryViewEntity => ({
    entity_id: r.entity_id,
    entity_type: r.entity_type,
    label: r.label ?? r.canonical_name ?? null,
    identity_rule: r.identity_rule ?? null,
  });
  const card = buildTurnSummaryCard({
    created: groups.created.map(toViewEntity),
    updated: groups.updated.map(toViewEntity),
    retrieved: groups.retrieved.map(toViewEntity),
    ambiguous: groups.ambiguous.map(toViewEntity),
    origin: params.origin ?? null,
    instance_name: params.instanceName ?? null,
    conversation_entity_id: conversationEntityId,
    conversation_label: conversationLabel,
    turn_number: turnNumber,
    max_items: params.maxItems,
    issues_count: issues.length,
  });

  return {
    status_line: statusLine,
    widget_uri: widgetUri,
    turn_number: turnNumber,
    conversation_message_count: totalMessages,
    stored,
    retrieved,
    issues,
    groups,
    card,
    fallback_text: renderTurnSummaryFallbackText(card),
  };
}

export function logTurnSummaryError(err: unknown, context: Record<string, unknown>): void {
  logger.warn(
    `turn_summary: ${err instanceof Error ? err.message : String(err)} (${JSON.stringify(context)})`
  );
}
