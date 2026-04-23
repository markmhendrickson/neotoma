/**
 * Canonical high-level helpers for agents using Neotoma.
 *
 * These wrap the low-level transport operations in primitives that encode
 * the turn-lifecycle and access-policy obligations that agents are
 * expected to honor:
 *
 *   - `storeChatTurn`: persist the user + assistant `conversation_message`
 *     pair for a single conversational turn, each linked `PART_OF` the same
 *     conversation. This matches the canonical dual-message shape.
 *     (`conversation_message` superseded the legacy `agent_message`
 *     entity_type in Phase 2 of the April 2026 redesign; `agent_message`
 *     is still accepted as an alias for pre-v0.6 clients.)
 *   - `retrieveOrStore`: a retrieve-before-write primitive. Checks for an
 *     existing entity by identifier; stores a new one only if none is
 *     found. Returns the existing or newly-created `entity_id`.
 *   - `snapshotOnUpdate`: retrieve the current snapshot of an entity
 *     immediately before applying a correction, so callers never write
 *     over stale state without seeing it first.
 *
 * All helpers are best-effort and throw on transport failure. Callers
 * (hook plugins, agents) decide whether to swallow or propagate errors
 * based on their own error policy.
 */

import type { NeotomaTransport, StoreEntityInput, StoreInput, StoreResult, StoredEntityRef } from "./types.js";

/**
 * Authoritative sender category for a chat message.
 *
 * `user` and `assistant` are the conventional chat roles. `agent` is used
 * for agent-to-agent (A2A) traffic where neither side is a human end user.
 * `system` and `tool` cover system-emitted prompts and tool-call turns.
 *
 * Phase 1 writers set `sender_kind` alongside `role` for backward
 * compatibility. Readers should prefer `sender_kind` and fall back to
 * `role` when missing.
 */
export type ChatTurnSenderKind = "user" | "assistant" | "agent" | "system" | "tool";

export interface ChatTurnMessage {
  content: string;
  role: "user" | "assistant";
  /**
   * Authoritative sender category. When omitted, defaults to `role`.
   * For agent-to-agent traffic, set this to `agent` and also pass
   * `senderAgentId` / `recipientAgentId`.
   */
  senderKind?: ChatTurnSenderKind;
  /** Stable identifier of the sending agent (AAuth/clientInfo/agent_sub derived). */
  senderAgentId?: string;
  /** Stable identifier of the recipient agent, for A2A turns. */
  recipientAgentId?: string;
  /** Extra fields to store on the conversation_message (timestamp, files_modified, tools_used, etc.). */
  extra?: Record<string, unknown>;
}

export interface StoreChatTurnInput {
  /** Stable conversation identifier across all turns in the conversation. */
  conversationId: string;
  /** Stable turn identifier unique within the conversation. */
  turnId: string;
  /** 1-based turn number, if known. */
  turnNumber?: number;
  /** Conversation title; only applied when the conversation is first created. */
  conversationTitle?: string;
  /** Platform name (e.g. "cursor"). */
  platform?: string;
  /** Model identifier, if known. */
  model?: string;
  /** The user and/or assistant messages for this turn. */
  messages: ChatTurnMessage[];
  /** Optional idempotency key prefix; defaults to `conversation-<conv>-<turn>`. */
  idempotencyKeyPrefix?: string;
  /** Extra fields to merge onto the conversation entity if it is created here. */
  conversationExtra?: Record<string, unknown>;
}

export interface StoreChatTurnResult {
  conversationEntityId: string;
  userMessageEntityId?: string;
  assistantMessageEntityId?: string;
  storeResult: StoreResult;
}

/**
 * Store a single logical turn (user + assistant messages) in Neotoma with
 * canonical relationships. Idempotent per `(conversationId, turnId)`.
 */
export async function storeChatTurn(
  transport: Pick<NeotomaTransport, "store">,
  input: StoreChatTurnInput
): Promise<StoreChatTurnResult> {
  const turnKeyBase = `${input.conversationId}:${input.turnId}`;
  const keyPrefix =
    input.idempotencyKeyPrefix ?? `conversation-${input.conversationId}-${input.turnId}`;

  const entities: StoreEntityInput[] = [
    {
      entity_type: "conversation",
      conversation_id: input.conversationId,
      title: input.conversationTitle ?? `Conversation ${input.conversationId}`,
      platform: input.platform,
      ...(input.conversationExtra ?? {}),
    },
  ];

  const relationships: StoreInput["relationships"] = [];

  const indexByRole: Partial<Record<"user" | "assistant", number>> = {};

  for (const message of input.messages) {
    const suffix = message.role === "user" ? "" : ":assistant";
    const idx = entities.length;
    indexByRole[message.role] = idx;
    const senderKind: ChatTurnSenderKind = message.senderKind ?? message.role;
    entities.push({
      entity_type: "conversation_message",
      role: message.role,
      sender_kind: senderKind,
      ...(message.senderAgentId ? { sender_agent_id: message.senderAgentId } : {}),
      ...(message.recipientAgentId ? { recipient_agent_id: message.recipientAgentId } : {}),
      content: message.content,
      turn_key: `${turnKeyBase}${suffix}`,
      turn_number: input.turnNumber,
      platform: input.platform,
      model: input.model,
      ...(message.extra ?? {}),
    });
    relationships.push({
      relationship_type: "PART_OF",
      source_index: idx,
      target_index: 0,
    });
  }

  const storeResult = await transport.store({
    entities,
    relationships,
    idempotency_key: `${keyPrefix}-turn`,
  });

  const stored = storeResult.structured?.entities ?? [];
  const conversationEntityId = stored[0]?.entity_id ?? "";

  return {
    conversationEntityId,
    userMessageEntityId:
      indexByRole.user !== undefined ? stored[indexByRole.user]?.entity_id : undefined,
    assistantMessageEntityId:
      indexByRole.assistant !== undefined
        ? stored[indexByRole.assistant]?.entity_id
        : undefined,
    storeResult,
  };
}

export interface RetrieveOrStoreInput {
  identifier: string;
  entityType: string;
  /** Fields to set when creating the entity if it does not already exist. */
  create: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface RetrieveOrStoreResult {
  entityId: string;
  created: boolean;
  existing?: unknown;
}

/**
 * Retrieve-before-write primitive.
 *
 * Looks for an entity by identifier (optionally scoped to `entity_type`).
 * If found, returns the existing entity_id without writing. If not found,
 * stores a new entity with the provided fields and returns its new
 * entity_id. The returned `created` flag lets callers know which path was
 * taken so they can decide whether to emit a `Created` or `Retrieved`
 * entry in the turn report.
 */
export async function retrieveOrStore(
  transport: Pick<NeotomaTransport, "retrieveEntityByIdentifier" | "store">,
  input: RetrieveOrStoreInput
): Promise<RetrieveOrStoreResult> {
  const existing = (await transport
    .retrieveEntityByIdentifier({
      identifier: input.identifier,
      entity_type: input.entityType,
    })
    .catch(() => null)) as { entity_id?: string; entity?: { entity_id?: string } } | null;

  const existingId = existing?.entity_id ?? existing?.entity?.entity_id;
  if (existingId) {
    return { entityId: existingId, created: false, existing };
  }

  const result = await transport.store({
    entities: [
      {
        entity_type: input.entityType,
        ...input.create,
      },
    ],
    idempotency_key: input.idempotencyKey ?? `${input.entityType}-${input.identifier}`,
  });

  const stored: StoredEntityRef | undefined = result.structured?.entities?.[0];
  if (!stored?.entity_id) {
    throw new Error(
      `retrieveOrStore: store returned no entity_id for ${input.entityType} identifier=${input.identifier}`
    );
  }
  return { entityId: stored.entity_id, created: true };
}

export interface SnapshotOnUpdateInput {
  entityId: string;
  corrections: Record<string, unknown>;
  /**
   * Called with the current snapshot before the correction is applied.
   * Return `false` to skip the update. Return `true` (or a corrections
   * delta) to proceed.
   */
  review?: (snapshot: unknown) => boolean | Record<string, unknown> | Promise<boolean | Record<string, unknown>>;
}

export interface SnapshotOnUpdateResult {
  applied: boolean;
  previousSnapshot: unknown;
  correctionResult?: unknown;
}

/**
 * Snapshot-on-update primitive.
 *
 * Before applying a correction, fetch the current entity snapshot so the
 * caller can reconcile against live state rather than stale assumptions.
 * Optional `review` callback may short-circuit the update or replace the
 * corrections payload based on the snapshot. This implements the
 * "retrieve-before-write" obligation specifically for observation-level
 * corrections.
 */
export async function snapshotOnUpdate(
  transport: Pick<NeotomaTransport, "retrieveEntitySnapshot" | "correct">,
  input: SnapshotOnUpdateInput
): Promise<SnapshotOnUpdateResult> {
  const snapshot = await transport.retrieveEntitySnapshot({ entity_id: input.entityId });

  let corrections: Record<string, unknown> = input.corrections;
  if (input.review) {
    const decision = await input.review(snapshot);
    if (decision === false) {
      return { applied: false, previousSnapshot: snapshot };
    }
    if (decision && typeof decision === "object") {
      corrections = decision;
    }
  }

  const correctionResult = await transport.correct({
    entity_id: input.entityId,
    corrections,
  });

  return { applied: true, previousSnapshot: snapshot, correctionResult };
}
