/**
 * Strict `owner/name` validation for a GitHub repository slug.
 *
 * Shared by every `sync_issues` transport (MCP, REST, CLI) and by the sync
 * service itself, so a malformed value is rejected identically everywhere and
 * before any GitHub request or local write. Mirrors GitHub's own naming rules:
 * an owner is 1-39 alphanumerics/hyphens (no leading or trailing hyphen); a repo
 * name is 1-100 alphanumerics, `.`, `_` or `-`, and never `.` or `..`.
 *
 * This is deliberately stricter than the `target_repo` regex on `submit_issue`
 * (`^[^/\s]+\/[^/\s]+$`), which accepts URL-reserved characters. A `repo` here
 * is interpolated into GitHub API paths and used to bind stored entities, so it
 * must not be able to smuggle `..`, `?`, `#` or extra path segments.
 */

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * The same rule as {@link isValidRepoSlug} as an ECMA-262 pattern, for the JSON Schema
 * `pattern` on the MCP tool input schema and the OpenAPI request body so clients can reject
 * a bad slug before calling. A test pins it to the function over a table of accepted and
 * rejected slugs. Server-side validation remains the authority.
 */
export const REPO_SLUG_PATTERN =
  "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/(?!\\.{1,2}$)[A-Za-z0-9._-]{1,100}$";

export const REPO_SLUG_FORMAT_MESSAGE =
  "repo must be a GitHub repository in owner/name format (for example `acme/widgets`).";

/** True when `value` is a well-formed `owner/name` GitHub repository slug. */
export function isValidRepoSlug(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("/");
  if (parts.length !== 2) return false;
  const [owner, name] = parts as [string, string];
  if (!OWNER_RE.test(owner)) return false;
  if (!NAME_RE.test(name)) return false;
  if (name === "." || name === "..") return false;
  return true;
}

/** Compare two slugs the way GitHub does: case-insensitively. */
export function repoSlugsEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
