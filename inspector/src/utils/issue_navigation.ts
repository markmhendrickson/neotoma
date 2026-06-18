/**
 * Inspector issue list/detail navigation helpers.
 *
 * Snapshots may omit `github_number` / `github_url` when the active schema did
 * not yet include those fields; the same values often appear in
 * `raw_fragments`. Neotoma issue rows also encode the number in `data_source`
 * (e.g. `github issues api owner/repo #29 2026-05-06`).
 */

export function parseGithubIssueNumberFromUrl(url: unknown): number | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  const m = url.match(/\/issues\/(\d+)\b/);
  if (!m?.[1]) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Matches `… #42 …` in CLI/API provenance strings. */
export function parseGithubIssueNumberFromDataSource(ds: unknown): number | undefined {
  if (typeof ds !== "string" || !ds.trim()) return undefined;
  const m = ds.match(/#(\d+)\b/);
  if (!m?.[1]) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseGhsaFromUrl(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  const m = url.match(/\/security\/advisories\/(GHSA-[A-Za-z0-9-]+)/);
  return m?.[1];
}

export type IssueListEntity = {
  entity_id?: string;
  id?: string;
  snapshot?: Record<string, unknown>;
  raw_fragments?: Record<string, unknown>;
};

function entityIdOf(e: IssueListEntity): string | undefined {
  const id = e.entity_id ?? e.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Snapshot first, then `raw_fragments` (same merge as issue detail).
 * Issue rows often keep `author`, `github_number`, etc. in fragments when the
 * active schema projection omits them from `snapshot`, which would otherwise
 * show as missing/`unknown` in list-only UIs.
 */
export function issueEntityField(e: IssueListEntity, key: string): unknown {
  const snap = e.snapshot;
  const raw = e.raw_fragments;
  const sv = snap?.[key];
  if (sv !== undefined && sv !== null) return sv;
  return raw?.[key];
}

function positiveGithubNumber(n: unknown): number | undefined {
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  if (typeof n === "string" && /^\d+$/.test(n)) {
    const v = parseInt(n, 10);
    if (v > 0) return v;
  }
  return undefined;
}

/**
 * Path segment for `/issues/:segment` — GitHub issue number when known and
 * positive; otherwise stable `entity_id` (e.g. advisory drafts or incomplete snapshots).
 */
export function getIssueRouteSegment(e: IssueListEntity): string {
  const num = positiveGithubNumber(issueEntityField(e, "github_number"));
  if (num !== undefined) return String(num);

  const parsedUrl = parseGithubIssueNumberFromUrl(issueEntityField(e, "github_url"));
  if (parsedUrl !== undefined) return String(parsedUrl);

  const parsedDs = parseGithubIssueNumberFromDataSource(issueEntityField(e, "data_source"));
  if (parsedDs !== undefined) return String(parsedDs);

  const ent = entityIdOf(e);
  if (ent) return ent;
  return "unknown";
}

/**
 * Short label for the issues list (after `#`).
 */
export function getIssueListNumberLabel(e: IssueListEntity): string {
  const num = positiveGithubNumber(issueEntityField(e, "github_number"));
  if (num !== undefined) return String(num);

  const parsedUrl = parseGithubIssueNumberFromUrl(issueEntityField(e, "github_url"));
  if (parsedUrl !== undefined) return String(parsedUrl);

  const parsedDs = parseGithubIssueNumberFromDataSource(issueEntityField(e, "data_source"));
  if (parsedDs !== undefined) return String(parsedDs);

  const ghsa = parseGhsaFromUrl(issueEntityField(e, "github_url"));
  if (ghsa) return ghsa;
  return "—";
}

/**
 * Returns true when the issue is linked to a GitHub issue (public).
 * An issue is GitHub-linked when any of the three number-resolution paths
 * yields a positive integer: `github_number`, `github_url`, or `data_source`.
 */
export function isGithubLinkedIssue(e: IssueListEntity): boolean {
  if (positiveGithubNumber(issueEntityField(e, "github_number")) !== undefined) return true;
  if (parseGithubIssueNumberFromUrl(issueEntityField(e, "github_url")) !== undefined) return true;
  if (parseGithubIssueNumberFromDataSource(issueEntityField(e, "data_source")) !== undefined) return true;
  return false;
}

export function issueEntityMatchesSegment(e: IssueListEntity, segment: string | undefined): boolean {
  if (!segment) return false;
  if (entityIdOf(e) === segment) return true;

  const n = positiveGithubNumber(issueEntityField(e, "github_number"));
  if (n !== undefined && String(n) === segment) return true;

  const fromUrl = parseGithubIssueNumberFromUrl(issueEntityField(e, "github_url"));
  if (fromUrl !== undefined && String(fromUrl) === segment) return true;

  const fromDs = parseGithubIssueNumberFromDataSource(issueEntityField(e, "data_source"));
  if (fromDs !== undefined && String(fromDs) === segment) return true;

  return false;
}
