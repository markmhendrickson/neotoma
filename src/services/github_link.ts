/**
 * GitHub account linking for operator-local agent_grants.
 *
 * Writes `linked_github_login`, `linked_github_user_id`, and
 * `linked_github_verified_at` onto the agent_grant matching the current
 * AAuth session. The full OAuth code-exchange flow is handled by the
 * caller (CLI starts a local server or Inspector redirects); this module
 * only handles the post-verification step of storing the link.
 */

import type { NeotomaApiClient } from "../shared/api_client.js";

export interface GitHubLinkParams {
  grantId: string;
  githubLogin: string;
  githubUserId: number;
}

/**
 * Persist a GitHub account link on an existing agent_grant entity by
 * writing a `correct` observation with the linked fields.
 */
export async function linkGithubToGrant(
  client: NeotomaApiClient,
  params: GitHubLinkParams,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  const { error } = await client.POST("/correct" as any, {
    body: {
      entity_id: params.grantId,
      entity_type: "agent_grant",
      fields: {
        linked_github_login: params.githubLogin,
        linked_github_user_id: params.githubUserId,
        linked_github_verified_at: now,
      },
    },
  }) as { data?: unknown; error?: unknown };

  if (error) {
    return {
      success: false,
      error: `Failed to link GitHub: ${JSON.stringify(error)}`,
    };
  }
  return { success: true };
}

/**
 * Remove a GitHub account link from an agent_grant by clearing the fields.
 */
export async function unlinkGithubFromGrant(
  client: NeotomaApiClient,
  grantId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await client.POST("/correct" as any, {
    body: {
      entity_id: grantId,
      entity_type: "agent_grant",
      fields: {
        linked_github_login: null,
        linked_github_user_id: null,
        linked_github_verified_at: null,
      },
    },
  }) as { data?: unknown; error?: unknown };

  if (error) {
    return {
      success: false,
      error: `Failed to unlink GitHub: ${JSON.stringify(error)}`,
    };
  }
  return { success: true };
}
