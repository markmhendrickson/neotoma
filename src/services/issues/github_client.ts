/**
 * GitHub API client for the Issues subsystem.
 *
 * Uses native fetch against the GitHub REST API. Token resolution
 * follows the priority order defined in gh_auth.ts.
 *
 * Supports:
 *   - Public issues (Issues API)
 *   - Issue comments (as messages)
 */

import { resolveGitHubToken } from "./gh_auth.js";
import { loadIssuesConfig } from "./config.js";
import type { GitHubIssue, GitHubComment } from "./types.js";

const GITHUB_API = "https://api.github.com";

/** Applied to every GitHub issue created through Neotoma issue tooling (MCP, CLI, API). */
export const NEOTOMA_ISSUE_TOOLING_GITHUB_LABEL = "neotoma";

/**
 * Ensures tooling-submitted issues carry the canonical GitHub label plus any caller labels,
 * deduplicated in stable order (canonical first).
 */
export function mergeNeotomaToolingIssueLabels(userLabels?: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [NEOTOMA_ISSUE_TOOLING_GITHUB_LABEL, ...(userLabels ?? [])]) {
    const normalized = raw.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

interface GitHubApiOptions {
  token?: string;
  repo?: string;
}

async function resolveOptions(opts?: GitHubApiOptions): Promise<{ token: string; owner: string; repo: string }> {
  const token = opts?.token ?? await resolveGitHubToken();
  if (!token) {
    throw new Error(
      "No GitHub token available. Run `gh auth login` or set NEOTOMA_ISSUES_GITHUB_TOKEN.",
    );
  }

  const cfg = await loadIssuesConfig();
  const fullRepo = opts?.repo ?? cfg.repo;
  const [owner, repo] = fullRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo format: "${fullRepo}". Expected "owner/repo".`);
  }

  return { token, owner, repo };
}

async function githubFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${GITHUB_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Create a new GitHub issue (for public mirror only).
 */
export async function createIssue(params: {
  title: string;
  body: string;
  labels?: string[];
}, opts?: GitHubApiOptions): Promise<GitHubIssue> {
  const { token, owner, repo } = await resolveOptions(opts);

  const labels = mergeNeotomaToolingIssueLabels(params.labels);
  const payload: Record<string, unknown> = {
    title: params.title,
    body: params.body,
    labels,
  };

  return githubFetch<GitHubIssue>(
    `/repos/${owner}/${repo}/issues`,
    token,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/**
 * Add a comment (message) to an existing GitHub issue.
 */
export async function addIssueComment(
  issueNumber: number,
  body: string,
  opts?: GitHubApiOptions,
): Promise<GitHubComment> {
  const { token, owner, repo } = await resolveOptions(opts);

  return githubFetch<GitHubComment>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    token,
    { method: "POST", body: JSON.stringify({ body }) },
  );
}

/**
 * Get a single issue by number.
 */
export async function getIssue(
  issueNumber: number,
  opts?: GitHubApiOptions,
): Promise<GitHubIssue> {
  const { token, owner, repo } = await resolveOptions(opts);
  return githubFetch<GitHubIssue>(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    token,
  );
}

/**
 * List issues from the configured GitHub repo.
 */
export async function listIssues(params?: {
  state?: "open" | "closed" | "all";
  labels?: string[];
  since?: string;
  per_page?: number;
  page?: number;
}, opts?: GitHubApiOptions): Promise<GitHubIssue[]> {
  const { token, owner, repo } = await resolveOptions(opts);

  const query = new URLSearchParams();
  query.set("state", params?.state ?? "open");
  if (params?.labels?.length) query.set("labels", params.labels.join(","));
  if (params?.since) query.set("since", params.since);
  query.set("per_page", String(params?.per_page ?? 100));
  query.set("page", String(params?.page ?? 1));
  query.set("direction", "desc");
  query.set("sort", "updated");

  return githubFetch<GitHubIssue[]>(
    `/repos/${owner}/${repo}/issues?${query.toString()}`,
    token,
  );
}

/**
 * List comments on a specific issue.
 */
export async function listIssueComments(
  issueNumber: number,
  params?: { since?: string; per_page?: number; page?: number },
  opts?: GitHubApiOptions,
): Promise<GitHubComment[]> {
  const { token, owner, repo } = await resolveOptions(opts);

  const query = new URLSearchParams();
  if (params?.since) query.set("since", params.since);
  query.set("per_page", String(params?.per_page ?? 100));
  query.set("page", String(params?.page ?? 1));

  return githubFetch<GitHubComment[]>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?${query.toString()}`,
    token,
  );
}

/**
 * Close an issue.
 */
export async function closeIssue(
  issueNumber: number,
  opts?: GitHubApiOptions,
): Promise<GitHubIssue> {
  const { token, owner, repo } = await resolveOptions(opts);

  return githubFetch<GitHubIssue>(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    token,
    { method: "PATCH", body: JSON.stringify({ state: "closed" }) },
  );
}

/**
 * Add labels to an issue.
 */
export async function addIssueLabels(
  issueNumber: number,
  labels: string[],
  opts?: GitHubApiOptions,
): Promise<Array<{ name: string }>> {
  const { token, owner, repo } = await resolveOptions(opts);

  return githubFetch<Array<{ name: string }>>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    token,
    { method: "POST", body: JSON.stringify({ labels }) },
  );
}
