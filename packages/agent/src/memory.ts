/**
 * NeotomaMemory: protocol-enforcing memory client for agent loops.
 *
 * Wraps an HTTP or local @neotoma/client transport with the canonical
 * store-first turn protocol:
 *   1. Open a turn → run bounded retrieval for entities implied by the
 *      user message.
 *   2. Persist the user message as a `conversation_message` PART_OF the
 *      conversation, with REFERS_TO edges to retrieved entities.
 *   3. After the agent reply lands, persist the assistant message the
 *      same way.
 *   4. Idempotency keys are derived deterministically from the turn key
 *      so duplicate calls collapse onto the same observation.
 *
 * The class is provider-agnostic. It does not call any LLM. Use it as
 * the memory substrate around any agent loop — Claude, OpenAI, custom.
 *
 * See SKILL.md for the canonical turn protocol contract.
 */

import type { NeotomaTransport } from "@neotoma/client";
import {
  storeChatTurn,
  type ChatTurnMessage,
  type StoreChatTurnInput,
  type StoreChatTurnResult,
} from "./turn_helpers.js";

export interface NeotomaMemoryOptions {
  /** Underlying transport (HttpTransport or LocalTransport from @neotoma/client). */
  transport: NeotomaTransport;
  /** Stable conversation id used for every turn in this session. */
  conversationId: string;
  /** Optional conversation title set on first write. */
  conversationTitle?: string;
  /** Harness/platform name (e.g. "claude-code", "cursor"). */
  platform?: string;
  /** Repository context, when applicable. */
  repositoryName?: string;
  repositoryRoot?: string;
  repositoryRemote?: string;
  /** Short scope description for this conversation. */
  scopeSummary?: string;
  /** Bounded retrieval: max entities returned per call. */
  retrievalLimit?: number;
  /** Override the default identifier extractor used by `retrieveImplied`. */
  identifierExtractor?: (text: string) => string[];
}

export interface OpenTurnInput {
  /** Stable turn id unique within this conversation. */
  turnId: string;
  /** User message text for this turn. */
  userMessage: string;
  /** Optional 1-based turn number. */
  turnNumber?: number;
  /** Extra fields to merge onto the user `conversation_message`. */
  userMessageExtra?: Record<string, unknown>;
}

export interface OpenTurnResult {
  /** Entities retrieved via bounded lookup for the user message. */
  retrieved: unknown[];
  /** Entity ids of retrieved entities, for REFERS_TO wiring on the assistant store. */
  retrievedEntityIds: string[];
  /** Resolved conversation entity id. */
  conversationEntityId: string;
  /** Entity id of the stored user conversation_message. */
  userMessageEntityId?: string;
}

export interface CloseTurnInput {
  turnId: string;
  /** Assistant reply text for this turn. */
  assistantMessage: string;
  turnNumber?: number;
  /** Entity ids to mark REFERS_TO from the assistant message. Usually the retrieved set from `openTurn`. */
  refersTo?: string[];
  assistantMessageExtra?: Record<string, unknown>;
}

export interface CloseTurnResult {
  conversationEntityId: string;
  assistantMessageEntityId?: string;
}

/**
 * Default identifier extractor.
 *
 * Pulls quoted strings and capitalized multi-word phrases from the user
 * message as candidate identifiers. This is intentionally conservative;
 * callers with a richer parsing strategy (NER, structured tool args) can
 * supply their own via `identifierExtractor`.
 */
function defaultIdentifierExtractor(text: string): string[] {
  const out = new Set<string>();
  const quoted = text.match(/"([^"]{2,80})"/g) ?? [];
  for (const q of quoted) out.add(q.slice(1, -1));
  const caps = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) ?? [];
  for (const c of caps) out.add(c);
  return Array.from(out);
}

export class NeotomaMemory {
  private readonly transport: NeotomaTransport;
  private readonly opts: NeotomaMemoryOptions;
  private readonly extract: (text: string) => string[];

  constructor(opts: NeotomaMemoryOptions) {
    this.transport = opts.transport;
    this.opts = opts;
    this.extract = opts.identifierExtractor ?? defaultIdentifierExtractor;
  }

  /**
   * Open a turn: run bounded retrieval, then persist the user message.
   *
   * Bounded retrieval is best-effort. Failures fall back to an empty
   * retrieved set so the turn always proceeds.
   */
  async openTurn(input: OpenTurnInput): Promise<OpenTurnResult> {
    const identifiers = this.extract(input.userMessage);
    const limit = this.opts.retrievalLimit ?? 8;

    const retrieved: unknown[] = [];
    const retrievedEntityIds: string[] = [];

    for (const id of identifiers.slice(0, limit)) {
      try {
        const hit = (await this.transport.retrieveEntityByIdentifier({
          identifier: id,
        })) as { entity?: { entity_id?: string }; entity_id?: string } | null;
        const entityId = hit?.entity_id ?? hit?.entity?.entity_id;
        if (entityId) {
          retrieved.push(hit);
          retrievedEntityIds.push(entityId);
        }
      } catch {
        // bounded retrieval is best-effort; skip on failure
      }
    }

    const turnResult = await this.storeUserMessage(input, retrievedEntityIds);

    return {
      retrieved,
      retrievedEntityIds,
      conversationEntityId: turnResult.conversationEntityId,
      userMessageEntityId: turnResult.userMessageEntityId,
    };
  }

  /**
   * Close a turn: persist the assistant message with REFERS_TO edges to
   * the entities surfaced during `openTurn` (or any caller-supplied set).
   */
  async closeTurn(input: CloseTurnInput): Promise<CloseTurnResult> {
    const messages: ChatTurnMessage[] = [
      {
        role: "assistant",
        content: input.assistantMessage,
        extra: input.assistantMessageExtra,
      },
    ];

    const storeInput: StoreChatTurnInput = {
      conversationId: this.opts.conversationId,
      turnId: input.turnId,
      turnNumber: input.turnNumber,
      conversationTitle: this.opts.conversationTitle,
      platform: this.opts.platform,
      repositoryName: this.opts.repositoryName,
      repositoryRoot: this.opts.repositoryRoot,
      repositoryRemote: this.opts.repositoryRemote,
      scopeSummary: this.opts.scopeSummary,
      messages,
      idempotencyKeyPrefix: `conversation-${this.opts.conversationId}-${input.turnId}-assistant`,
    };

    const result = await storeChatTurn(this.transport, storeInput);

    if (input.refersTo?.length && result.assistantMessageEntityId) {
      for (const target of input.refersTo) {
        try {
          await this.transport.createRelationship({
            relationship_type: "REFERS_TO",
            source_entity_id: result.assistantMessageEntityId,
            target_entity_id: target,
          });
        } catch {
          // best-effort wiring; failures don't invalidate the turn store
        }
      }
    }

    return {
      conversationEntityId: result.conversationEntityId,
      assistantMessageEntityId: result.assistantMessageEntityId,
    };
  }

  /**
   * Persist both user and assistant messages in a single call. Use when
   * you have both messages up-front (e.g. post-hoc transcript replay).
   * For interactive loops prefer `openTurn` + `closeTurn`.
   */
  async recordTurn(input: {
    turnId: string;
    turnNumber?: number;
    userMessage: string;
    assistantMessage: string;
    refersTo?: string[];
  }): Promise<StoreChatTurnResult> {
    const storeInput: StoreChatTurnInput = {
      conversationId: this.opts.conversationId,
      turnId: input.turnId,
      turnNumber: input.turnNumber,
      conversationTitle: this.opts.conversationTitle,
      platform: this.opts.platform,
      repositoryName: this.opts.repositoryName,
      repositoryRoot: this.opts.repositoryRoot,
      repositoryRemote: this.opts.repositoryRemote,
      scopeSummary: this.opts.scopeSummary,
      messages: [
        { role: "user", content: input.userMessage },
        { role: "assistant", content: input.assistantMessage },
      ],
    };

    const result = await storeChatTurn(this.transport, storeInput);

    if (input.refersTo?.length && result.assistantMessageEntityId) {
      for (const target of input.refersTo) {
        try {
          await this.transport.createRelationship({
            relationship_type: "REFERS_TO",
            source_entity_id: result.assistantMessageEntityId,
            target_entity_id: target,
          });
        } catch {
          // best-effort
        }
      }
    }

    return result;
  }

  private async storeUserMessage(
    input: OpenTurnInput,
    retrievedEntityIds: string[]
  ): Promise<StoreChatTurnResult> {
    const messages: ChatTurnMessage[] = [
      {
        role: "user",
        content: input.userMessage,
        extra: input.userMessageExtra,
      },
    ];

    const storeInput: StoreChatTurnInput = {
      conversationId: this.opts.conversationId,
      turnId: input.turnId,
      turnNumber: input.turnNumber,
      conversationTitle: this.opts.conversationTitle,
      platform: this.opts.platform,
      repositoryName: this.opts.repositoryName,
      repositoryRoot: this.opts.repositoryRoot,
      repositoryRemote: this.opts.repositoryRemote,
      scopeSummary: this.opts.scopeSummary,
      messages,
      idempotencyKeyPrefix: `conversation-${this.opts.conversationId}-${input.turnId}-user`,
    };

    const result = await storeChatTurn(this.transport, storeInput);

    if (retrievedEntityIds.length && result.userMessageEntityId) {
      for (const target of retrievedEntityIds) {
        try {
          await this.transport.createRelationship({
            relationship_type: "REFERS_TO",
            source_entity_id: result.userMessageEntityId,
            target_entity_id: target,
          });
        } catch {
          // best-effort
        }
      }
    }

    return result;
  }
}
