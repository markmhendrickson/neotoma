/**
 * Repository allowlist for issue sync (`sync_issues`, `POST /issues/sync`,
 * `neotoma issues sync`) and for the per-issue GitHub calls that follow a sync.
 *
 * The server's GitHub credential is an instance-level resource. A caller-supplied
 * `repo` therefore selects a target only from a set the operator has approved:
 *
 *   - the configured repo (`NEOTOMA_ISSUES_REPO` / `issues.repo`), always;
 *   - every entry of `NEOTOMA_ISSUES_ALLOWED_REPOS` (comma-separated `owner/name`)
 *     or, when that variable is unset, `issues.allowed_repos` in the config file.
 *
 * Matching is case-insensitive and exact: there are no wildcards, and an entry that is
 * not a well-formed `owner/name` slug is dropped rather than widening the list. With
 * nothing configured only the configured repo is allowed (fail closed).
 */

import { isValidRepoSlug, repoSlugsEqual } from "../../shared/repo_slug.js";
import { IssueTransportError } from "./errors.js";

export const ALLOWED_REPOS_ENV = "NEOTOMA_ISSUES_ALLOWED_REPOS";

const warnedEntries = new Set<string>();

/**
 * Normalise a raw allowlist (comma-separated string, or an array of strings from the
 * config file) into a de-duplicated list of valid `owner/name` slugs. Malformed entries
 * are dropped with one operator-facing warning per distinct entry.
 */
export function parseAllowedRepos(raw: unknown): string[] {
  let entries: unknown[];
  if (typeof raw === "string") entries = raw.split(",");
  else if (Array.isArray(raw)) entries = raw;
  else return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const slug = entry.trim();
    if (slug.length === 0) continue;
    if (!isValidRepoSlug(slug)) {
      if (!warnedEntries.has(slug)) {
        warnedEntries.add(slug);
        process.stderr.write(
          `[issues] Ignoring malformed entry in ${ALLOWED_REPOS_ENV} / issues.allowed_repos ` +
            `(expected owner/name): ${JSON.stringify(slug)}\n`
        );
      }
      continue;
    }
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slug);
  }
  return out;
}

export interface RepoAllowlistConfig {
  /** The configured default repo; always allowed. */
  repo: string;
  /** Additional approved repos (already normalised by `loadIssuesConfig`). */
  allowed_repos?: string[];
}

/** True when `repo` is a well-formed slug that is the configured repo or on the allowlist. */
export function isRepoAllowed(repo: unknown, config: RepoAllowlistConfig): boolean {
  if (!isValidRepoSlug(repo)) return false;
  if (typeof config.repo === "string" && repoSlugsEqual(repo, config.repo)) return true;
  return (config.allowed_repos ?? []).some((allowed) => repoSlugsEqual(repo, allowed));
}

/**
 * Rejection for a repo outside the allowlist. Surfaces as a 4xx on REST and
 * `InvalidParams` on MCP. The text is identical whether or not the repo exists or the
 * server's credential can reach it, and it does not list the approved repos.
 */
export function repoNotAllowedError(): IssueTransportError {
  return new IssueTransportError({
    code: "ERR_ISSUE_REPO_NOT_ALLOWED",
    status: 403,
    message:
      "This repository is not enabled for issue sync on this server. Ask the operator to add it to the allowed list.",
    hint: `An operator can permit it by adding it to ${ALLOWED_REPOS_ENV} (or issues.allowed_repos) on the server.`,
  });
}

/** Throw {@link repoNotAllowedError} unless `repo` passes {@link isRepoAllowed}. */
export function assertRepoAllowed(repo: unknown, config: RepoAllowlistConfig): void {
  if (!isRepoAllowed(repo, config)) throw repoNotAllowedError();
}

/**
 * Resolve the repository one `issue` row belongs to, once, for every later GitHub call and
 * every thread / message identity key derived for that row.
 *
 * `repo` is the row's own stored repo when it is a valid slug, otherwise the configured
 * repo (rows written before the field existed carry none). `githubAllowed` says whether the
 * server may make GitHub calls against that repo. It is false for a stored repo that is a
 * valid slug but not on the allowlist. Such a row is then read and written locally only:
 * falling back to the configured repo instead would send the row's text to a different
 * repository's issue of the same number.
 */
export function resolveIssueRepo(
  snapshot: Record<string, unknown>,
  config: RepoAllowlistConfig
): { repo: string; githubAllowed: boolean } {
  const stored = typeof snapshot.repo === "string" ? snapshot.repo.trim() : "";
  if (stored.length > 0 && isValidRepoSlug(stored)) {
    return { repo: stored, githubAllowed: isRepoAllowed(stored, config) };
  }
  return { repo: config.repo, githubAllowed: true };
}
