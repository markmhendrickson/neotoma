/**
 * Async request-scoped context for Neotoma write-path attribution.
 *
 * The MCP `/mcp` endpoint receives AAuth-verified requests plus OAuth /
 * `clientInfo` fallback data, but writes happen deep inside services
 * (observation_storage, relationships, timeline_events, …) that live many
 * call frames below the HTTP handler. Passing an `AgentIdentity` through
 * every function signature would touch dozens of files; an
 * {@link AsyncLocalStorage} store propagates the same information without
 * any plumbing at call sites.
 *
 * Contract:
 * - The HTTP transport handler wraps each request in
 *   {@link runWithRequestContext} *before* dispatching into the MCP server.
 * - Stdio transport does not set a context; write-path services treat the
 *   absence of context the same as "anonymous / CLI-local" attribution.
 * - Nested writes inherit the outer context (which is exactly what we want:
 *   a single store_structured call that writes sources + observations +
 *   relationships should stamp them all with the same attribution).
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type {
  AgentIdentity,
  AttributionDecisionDiagnostics,
  AttributionProvenance,
} from "../crypto/agent_identity.js";
import { toAttributionProvenance } from "../crypto/agent_identity.js";

export interface RequestContext {
  /** Resolved agent identity, or null when we have nothing to attribute. */
  agentIdentity: AgentIdentity | null;
  /**
   * Diagnostic decision captured by the AAuth middleware (signature-side
   * only). Consumed by `get_session_identity` so the MCP tool mirrors the
   * same shape `/session` returns. Optional: absent on stdio / CLI paths.
   */
  attributionDecision?: AttributionDecisionDiagnostics | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` with the given {@link RequestContext} active. Any nested async
 * work (awaits, promise chains, timers) inherits the context via Node's
 * async_hooks machinery.
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return storage.run(context, fn);
}

/** Fetch the current request context, or `null` outside of one. */
export function getRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

/**
 * Shorthand that returns the active agent identity, or `null` when no
 * context is active or the context has no identity.
 */
export function getCurrentAgentIdentity(): AgentIdentity | null {
  return storage.getStore()?.agentIdentity ?? null;
}

/**
 * Shorthand that returns the {@link AttributionProvenance} block for the
 * current request. Returns an empty object when no context / identity is
 * active, making it safe to spread into provenance JSON regardless.
 */
export function getCurrentAttribution(): AttributionProvenance {
  return toAttributionProvenance(getCurrentAgentIdentity());
}

/** Read the middleware-stashed decision from the active async context. */
export function getCurrentAttributionDecision(): AttributionDecisionDiagnostics | null {
  return storage.getStore()?.attributionDecision ?? null;
}
