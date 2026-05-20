/**
 * External actor promotion via operator-local grant linkage.
 *
 * After an ExternalActor has been stamped at `claim` tier (Phases 1-2),
 * this module checks the current AAuth admission's agent_grant for a
 * `linked_github_*` record. If the GitHub user id matches, the actor is
 * promoted to `oauth_link` (strongest operator-local verification). If
 * mismatched, a `provenance_warning` is set instead.
 *
 * Called from the attribution context middleware or from write-path
 * services that need to run promotion explicitly.
 */

import type { ExternalActor } from "../crypto/agent_identity.js";
import type { AgentGrant } from "./agent_grants.js";

/**
 * Attempt to promote an ExternalActor's `verified_via` based on an
 * operator-local agent_grant's GitHub link.
 *
 * Returns a new ExternalActor with updated fields (immutable), or the
 * original if no promotion/change is warranted.
 */
export function promoteExternalActorViaGrant(
  actor: ExternalActor,
  grant:
    | Pick<AgentGrant, "linked_github_user_id" | "linked_github_login" | "user_id">
    | null
    | undefined
): ExternalActor {
  if (!grant) return actor;
  if (!grant.linked_github_user_id) return actor;

  if (actor.id === grant.linked_github_user_id) {
    // Match — promote to oauth_link level and set operator-local user id.
    // Only promote if we don't already have a stronger verification.
    if (actor.verified_via === "webhook_signature") return actor;
    return {
      ...actor,
      verified_via: "oauth_link",
      linked_neotoma_user_id: grant.user_id,
    };
  }

  // Mismatch — grant has a different GitHub user linked; flag for inspector.
  if (actor.verified_via === "webhook_signature" || actor.verified_via === "oauth_link") {
    return actor;
  }
  return {
    ...actor,
    provenance_warning: "github_actor_grant_mismatch",
  };
}
