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
  ExternalActor,
} from "../crypto/agent_identity.js";
import { toAttributionProvenance } from "../crypto/agent_identity.js";
import type { AAuthAdmissionContext } from "./protected_entity_types.js";

export interface RequestContext {
  /** Resolved agent identity, or null when we have nothing to attribute. */
  agentIdentity: AgentIdentity | null;
  /**
   * Diagnostic decision captured by the AAuth middleware (signature-side
   * only). Consumed by `get_session_identity` so the MCP tool mirrors the
   * same shape `/session` returns. Optional: absent on stdio / CLI paths.
   */
  attributionDecision?: AttributionDecisionDiagnostics | null;
  /**
   * Result of the AAuth admission service for this request, when the
   * AAuth identity matched (or failed to match) an `agent_grant` entity.
   * Used by the protected-entity-types guard to decide whether an
   * admitted agent may mutate governance state. Absent on requests that
   * did not pass through admission (e.g. unsigned local stdio, public
   * discovery routes).
   */
  aauthAdmission?: AAuthAdmissionContext | null;
  /**
   * External actor (e.g. GitHub user) that authored the upstream artifact
   * being ingested. Stamped into `observations.provenance.external_actor`
   * alongside — but distinct from — the AAuth agent identity.
   */
  externalActor?: ExternalActor | null;
  /**
   * Domain-specific HTTP routes may validate a guest-facing submission and then
   * perform internal bookkeeping writes (for example, an issue conversation
   * thread). Those internal writes keep attribution but should not require the
   * guest to have direct generic `/store` access to every bookkeeping type.
   */
  bypassGuestStoreAccessPolicy?: boolean;
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
  const store = storage.getStore();
  return toAttributionProvenance(store?.agentIdentity ?? null, store?.externalActor ?? null);
}

/**
 * Return the external actor from the active request context, if set.
 */
export function getCurrentExternalActor(): ExternalActor | null {
  return storage.getStore()?.externalActor ?? null;
}

/** Read the middleware-stashed decision from the active async context. */
export function getCurrentAttributionDecision(): AttributionDecisionDiagnostics | null {
  return storage.getStore()?.attributionDecision ?? null;
}

/**
 * Read the AAuth admission record (set by the admission service in the
 * HTTP middleware chain) from the active async context. Returns `null`
 * when admission did not run for this request.
 */
export function getCurrentAAuthAdmission(): AAuthAdmissionContext | null {
  return storage.getStore()?.aauthAdmission ?? null;
}

/**
 * Run `fn` with an {@link ExternalActor} attached to the current request
 * context. If a context already exists it is cloned with the actor slot
 * set; if no context is active a minimal one is created. Existing
 * `agentIdentity`, `attributionDecision`, and `aauthAdmission` are
 * preserved so this helper composes safely within the existing pipeline.
 */
export function runWithExternalActor<T>(
  actor: ExternalActor | null,
  fn: () => Promise<T> | T
): Promise<T> | T {
  const existing = storage.getStore();
  const merged: RequestContext = {
    agentIdentity: existing?.agentIdentity ?? null,
    attributionDecision: existing?.attributionDecision ?? null,
    aauthAdmission: existing?.aauthAdmission ?? null,
    externalActor: actor,
    bypassGuestStoreAccessPolicy: existing?.bypassGuestStoreAccessPolicy ?? false,
  };
  return storage.run(merged, fn);
}
