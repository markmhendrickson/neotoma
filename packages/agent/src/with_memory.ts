/**
 * withMemory: provider-agnostic agent-loop wrapper.
 *
 * Wraps any async function `(userMessage) => Promise<assistantMessage>`
 * with Neotoma memory hooks. Each call opens a turn (bounded retrieval +
 * user-message persistence), invokes the inner function, then closes the
 * turn (assistant-message persistence with REFERS_TO edges).
 *
 * The wrapper is intentionally minimal so it composes with any LLM
 * provider — Anthropic, OpenAI, custom HTTP, whatever. The inner function
 * may use the retrieved entities (passed as a second argument) to build
 * its prompt.
 */

import { NeotomaMemory, type NeotomaMemoryOptions } from "./memory.js";

export interface WithMemoryOptions extends NeotomaMemoryOptions {
  /**
   * Function that produces the next turn id. Defaults to a monotonic
   * counter scoped to this wrapper instance. Override when the host has
   * its own turn-id scheme (e.g. message id from the harness).
   */
  nextTurnId?: () => string;
}

export interface MemoryTurnContext {
  /** Entities surfaced by bounded retrieval for this turn. */
  retrieved: unknown[];
  /** Entity ids for the retrieved set; useful for prompt construction. */
  retrievedEntityIds: string[];
  /** Stable turn id assigned by the wrapper. */
  turnId: string;
  /** Stable conversation id. */
  conversationId: string;
}

export type AgentFn = (
  userMessage: string,
  ctx: MemoryTurnContext
) => Promise<string>;

export interface WrappedAgent {
  /** Run one turn end-to-end with memory hooks. */
  (userMessage: string): Promise<{ assistantMessage: string; ctx: MemoryTurnContext }>;
  /** Direct handle to the underlying memory client for ad-hoc ops. */
  memory: NeotomaMemory;
}

export function withMemory(agentFn: AgentFn, options: WithMemoryOptions): WrappedAgent {
  const memory = new NeotomaMemory(options);
  let counter = 0;
  const nextTurnId = options.nextTurnId ?? (() => String(++counter));

  const wrapped: WrappedAgent = (async (userMessage: string) => {
    const turnId = nextTurnId();
    const opened = await memory.openTurn({ turnId, userMessage });

    const ctx: MemoryTurnContext = {
      retrieved: opened.retrieved,
      retrievedEntityIds: opened.retrievedEntityIds,
      turnId,
      conversationId: options.conversationId,
    };

    const assistantMessage = await agentFn(userMessage, ctx);

    await memory.closeTurn({
      turnId,
      assistantMessage,
      refersTo: opened.retrievedEntityIds,
    });

    return { assistantMessage, ctx };
  }) as WrappedAgent;

  wrapped.memory = memory;
  return wrapped;
}
