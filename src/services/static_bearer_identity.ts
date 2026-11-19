/**
 * Which user a static bearer token (NEOTOMA_BEARER_TOKEN, or the retiring
 * slot during a handover) acts as.
 *
 * Without shared-graph mode it is the built-in local dev user, as before.
 *
 * With NEOTOMA_SHARED_GRAPH_USER_ID set to a usable UUID, the instance's data
 * is owned by that user, so the static token resolves to it on REST and MCP
 * alike. Otherwise a service token reads and writes the nil user's empty graph
 * while the team's skills and records sit under the shared owner.
 *
 * The /mcp gate marks a static-token request with
 * {@link STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID} (shared-graph mode only) so
 * the MCP server can tell it apart from a local no-auth caller (`dev-local`).
 * A client can never send this value: the gate drops it from inbound headers.
 */

import { getSharedGraphUserId } from "./google_oidc.js";
import { ensureLocalDevUser } from "./local_auth.js";

export const STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID = "static-bearer-shared-graph";

/** User id a matched static bearer acts as (REST and the MCP gate). */
export async function resolveStaticBearerUserId(): Promise<string> {
  const sharedGraphUserId = getSharedGraphUserId();
  if (sharedGraphUserId) return sharedGraphUserId;
  return (await ensureLocalDevUser()).id;
}

/**
 * Resolve a gate-assigned development connection id to its user, or null when
 * the id is not one this module resolves (an OAuth connection id).
 *
 * Throws when a shared-graph static-bearer connection is seen but shared-graph
 * mode is no longer configured: the caller fails closed rather than silently
 * acting as the nil user.
 */
export async function resolveGateAssignedConnectionUserId(
  connectionId: string
): Promise<string | null> {
  if (connectionId === "dev-local") return (await ensureLocalDevUser()).id;
  if (connectionId === STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID) {
    const sharedGraphUserId = getSharedGraphUserId();
    if (!sharedGraphUserId) {
      throw new Error("Static bearer shared-graph connection without a usable shared-graph user");
    }
    return sharedGraphUserId;
  }
  return null;
}
