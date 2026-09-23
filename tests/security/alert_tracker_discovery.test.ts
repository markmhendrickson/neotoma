/**
 * Regression coverage for the "Alert on failure" tracker-discovery bug
 * (Accipiter ux-lens BLOCKING finding on PR #2475).
 *
 * The workflow steps in sandbox-weekly-security-probes.yml and
 * remote_integration_nightly.yml are supposed to open exactly ONE tracking
 * issue per workflow and comment on it on every subsequent failure. The
 * pre-fix discovery (`issues.listForRepo` with no pagination, first 100
 * open issues, in-memory exact-title `.find`) cannot find a tracker that
 * isn't on the first page — with >100 open issues, or a tracker older than
 * the 100 most-recently-opened issues, it silently misses and the step
 * opens a duplicate instead of commenting.
 *
 * This suite proves, with a fake Octokit that models real pagination and
 * real search filtering (not just "the query string looks right"):
 *   1. The PRE-fix function fails to find a tracker buried past page one
 *      of a >100-issue backlog.
 *   2. The POST-fix (search-based) function finds that same tracker in one
 *      call, independent of paging depth or issue age.
 *   3. Re-running post-fix discovery on a repo with an existing tracker
 *      still yields a match (comment path), not a duplicate-create path,
 *      at backlog sizes both under and over 100 open issues.
 */

import { describe, it, expect } from "vitest";

import {
  findTrackerIssue,
  findTrackerIssueFirstPageOnly,
} from "../../scripts/security/alert_tracker_discovery.mjs";

const TITLE = "CI: Sandbox weekly security probes failing";
const OWNER = "markmhendrickson";
const REPO = "neotoma";

/**
 * Builds a fake Octokit whose `issues.listForRepo` and
 * `search.issuesAndPullRequests` behave like the real API against a given
 * set of open issues (newest first, matching GitHub's default issue order).
 */
function fakeOctokit(openIssues: Array<{ number: number; title: string }>) {
  return {
    rest: {
      issues: {
        // Mirrors GitHub: only the first `per_page` (<=100) items are
        // returned; the pre-fix code never asks for a second page.
        listForRepo: async ({ per_page }: { per_page: number }) => ({
          data: openIssues.slice(0, per_page),
        }),
      },
      search: {
        // Mirrors GitHub issue search: matches whenever the query's quoted
        // phrase appears (tokenized/fuzzy — a real search index would also
        // match partial-word overlaps, but for this fixture exact-or-
        // substring containment is enough to prove paging depth is
        // irrelevant). Returns matches regardless of where they'd fall in
        // listForRepo's page ordering.
        issuesAndPullRequests: async ({ q }: { q: string }) => {
          const m = q.match(/in:title "([^"]+)"/);
          const phrase = m ? m[1] : "";
          const items = openIssues.filter((i) => i.title.includes(phrase));
          return { data: { items } };
        },
      },
    },
  };
}

describe("tracker discovery vs a >100-issue backlog", () => {
  it("REGRESSION: pre-fix listForRepo-first-page misses a tracker buried past page one", async () => {
    // 150 open issues newer than the tracker, then the tracker itself.
    // GitHub returns newest-first by default, so the tracker sits at
    // position 151 — past any single 100-item page.
    const newerIssues = Array.from({ length: 150 }, (_, i) => ({
      number: 10000 - i,
      title: `Unrelated open issue #${10000 - i}`,
    }));
    const tracker = { number: 42, title: TITLE };
    const openIssues = [...newerIssues, tracker];

    const octokit = fakeOctokit(openIssues);

    const preFixResult = await findTrackerIssueFirstPageOnly({
      octokit,
      owner: OWNER,
      repo: REPO,
      title: TITLE,
    });

    // This is the bug: discovery returns null even though the tracker
    // exists and is open, because it is not in the first 100 results.
    expect(preFixResult).toBeNull();
  });

  it("FIX: search-based discovery finds the same buried tracker in one call", async () => {
    const newerIssues = Array.from({ length: 150 }, (_, i) => ({
      number: 10000 - i,
      title: `Unrelated open issue #${10000 - i}`,
    }));
    const tracker = { number: 42, title: TITLE };
    const openIssues = [...newerIssues, tracker];

    const octokit = fakeOctokit(openIssues);

    const postFixResult = await findTrackerIssue({
      octokit,
      owner: OWNER,
      repo: REPO,
      title: TITLE,
    });

    expect(postFixResult).toEqual({ number: 42, title: TITLE });
  });

  it("FIX: finds a tracker at backlog sizes both under and over 100 open issues", async () => {
    for (const backlogSize of [5, 99, 100, 101, 500, 2400]) {
      const others = Array.from({ length: backlogSize }, (_, i) => ({
        number: 90000 - i,
        title: `Backlog issue ${backlogSize}-${i}`,
      }));
      const tracker = { number: 7, title: TITLE };
      const octokit = fakeOctokit([...others, tracker]);

      const result = await findTrackerIssue({
        octokit,
        owner: OWNER,
        repo: REPO,
        title: TITLE,
      });

      expect(result, `backlog size ${backlogSize}`).toEqual({
        number: 7,
        title: TITLE,
      });
    }
  });

  it("does not match on substring/partial title overlap — exact title only", async () => {
    // A different workflow's tracker ("... probes failing" vs "...
    // nightly failing") must never be treated as this workflow's tracker,
    // even though search's `in:title` qualifier is tokenized rather than
    // an exact-substring test.
    const decoy = {
      number: 99,
      title: "CI: Sandbox weekly security probes failing (stale duplicate)",
    };
    const octokit = fakeOctokit([decoy]);

    const result = await findTrackerIssue({
      octokit,
      owner: OWNER,
      repo: REPO,
      title: TITLE,
    });

    expect(result).toBeNull();
  });

  it("returns null (create path) when no tracker exists yet, at any backlog size", async () => {
    const others = Array.from({ length: 250 }, (_, i) => ({
      number: 80000 - i,
      title: `Backlog issue ${i}`,
    }));
    const octokit = fakeOctokit(others);

    const result = await findTrackerIssue({
      octokit,
      owner: OWNER,
      repo: REPO,
      title: TITLE,
    });

    expect(result).toBeNull();
  });

  it("ignores pull requests that happen to match the title", async () => {
    const prMatch = { number: 55, title: TITLE, pull_request: {} };
    const octokit = fakeOctokit([prMatch] as never);

    const result = await findTrackerIssue({
      octokit,
      owner: OWNER,
      repo: REPO,
      title: TITLE,
    });

    expect(result).toBeNull();
  });
});
