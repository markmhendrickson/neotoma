/**
 * Withhold member write-attribution from guest-token readers (#2240).
 *
 * A guest (entity-scoped access token) may read an entity's observations,
 * relationships and snapshot, which carry `provenance`. The member id in
 * `provenance.authenticated_actor_id` is pseudonymous, but it still says which
 * member of a team wrote which record, and that is for members of the graph,
 * not for an outside party holding a single-entity share. Guest responses are
 * therefore stripped of the key wherever it appears.
 *
 * The walk is key-based rather than route-based so a new guest-readable route
 * cannot forget it: the middleware wraps `res.json` for every request and
 * redacts at send time whenever the request's principal is a guest. Provenance
 * that arrives as a JSON string (some storage paths) is parsed, redacted and
 * re-serialized.
 */

import { AUTHENTICATED_ACTOR_PROVENANCE_KEY } from "../crypto/agent_identity.js";

/**
 * Keys withheld from guest-token responses:
 *   - `authenticated_actor_id` — member write-attribution (#2240).
 *   - `data_origin` / `data_origins` — caller-claimed data origin (#2242).
 *     Locators routinely carry local paths, mailbox/message ids, and URL query
 *     tokens: metadata for members of the graph, not a single-entity share.
 *     `data_origin` is a reserved per-entity store key, so since #2242 it is
 *     never written as an entity field and removing it by name drops no
 *     entity data written after that change.
 */
const REDACTED_KEYS: ReadonlySet<string> = new Set([
  AUTHENTICATED_ACTOR_PROVENANCE_KEY,
  "data_origin",
  "data_origins",
]);

function redactProvenanceString(value: string): string {
  if (![...REDACTED_KEYS].some((key) => value.includes(key))) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(redactMemberAttribution(parsed));
    }
  } catch {
    // Not JSON: leave it as it is.
  }
  return value;
}

/**
 * Return a copy of `value` with every member write-attribution key removed, at
 * any depth. Only called on guest responses, which are small and scoped to one
 * entity, so the copy is cheap.
 */
export function redactMemberAttribution<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactMemberAttribution(item)) as unknown as T;
  }
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key)) continue;
    if (key === "provenance" && typeof child === "string") {
      out[key] = redactProvenanceString(child);
      continue;
    }
    out[key] = redactMemberAttribution(child);
  }
  return out as T;
}
