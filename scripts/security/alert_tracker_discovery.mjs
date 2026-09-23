/**
 * Tracker-issue discovery for the scheduled-workflow "Alert on failure"
 * steps (sandbox-weekly-security-probes.yml, remote_integration_nightly.yml).
 *
 * Bug this replaces (Accipiter ux-lens BLOCKING finding on PR #2475):
 * discovery used `issues.listForRepo({ state: "open", per_page: 100 })`
 * with no pagination, then an in-memory `.find(title exact match)`. That
 * only ever sees the first page of open issues. Once the repo has more
 * than 100 open issues — or the tracker is older than the 100 most
 * recently opened issues — discovery misses it and the step opens a
 * DUPLICATE tracking issue instead of commenting on the existing one,
 * defeating the "ONE tracking issue" design goal entirely.
 *
 * Fix: use the issues **search** API with an `in:title` qualifier. Search
 * is one call and does not degrade as the open-issue backlog grows (unlike
 * paginating `listForRepo` to exhaustion, which gets slower and eventually
 * hits secondary rate limits as the backlog grows). Search's `in:title`
 * match is tokenized, not a literal substring/equality test, so candidates
 * it returns are still checked against the title with exact string
 * equality client-side before being treated as the tracker. This keeps the
 * "exact title" contract while making discovery independent of paging
 * depth or issue age.
 */

/**
 * @param {{
 *   octokit: {
 *     rest: {
 *       search: { issuesAndPullRequests: (params: object) => Promise<{ data: { items: Array<{ number: number, title: string, pull_request?: unknown }> } }> },
 *     },
 *   },
 *   owner: string,
 *   repo: string,
 *   title: string,
 * }} opts
 * @returns {Promise<{ number: number, title: string } | null>}
 */
export async function findTrackerIssue({ octokit, owner, repo, title }) {
  // `in:title` narrows the search index to the title field; quoting the
  // phrase keeps GitHub's tokenizer from matching on stray individual
  // words. The API result is still fuzzy/tokenized, so every candidate is
  // re-checked for an exact string match below — search only has to get
  // the true tracker INTO the (small) candidate set, not decide by itself.
  const q = `repo:${owner}/${repo} is:issue state:open in:title "${title}"`;

  const { data } = await octokit.rest.search.issuesAndPullRequests({
    q,
    per_page: 30,
  });

  const exact = data.items.find(
    (item) => !item.pull_request && item.title === title,
  );

  return exact ? { number: exact.number, title: exact.title } : null;
}

/**
 * Pre-fix behaviour, preserved here ONLY so a regression test can prove it
 * fails against a backlog >100 open issues. Not used by either workflow.
 *
 * @param {{
 *   octokit: {
 *     rest: {
 *       issues: { listForRepo: (params: object) => Promise<{ data: Array<{ number: number, title: string }> }> },
 *     },
 *   },
 *   owner: string,
 *   repo: string,
 *   title: string,
 * }} opts
 * @returns {Promise<{ number: number, title: string } | null>}
 */
export async function findTrackerIssueFirstPageOnly({
  octokit,
  owner,
  repo,
  title,
}) {
  const { data: existing } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  const match = existing.find((i) => i.title === title);
  return match ? { number: match.number, title: match.title } : null;
}
