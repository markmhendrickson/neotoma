/**
 * `pr_review` (engineering bundle) — one review verdict on one pull request
 * at one head commit, from one reviewer or review lens.
 */

import { date, defineBundleSchema, list, num, str, text } from "../../schema_helpers.js";

export const prReviewSchema = defineBundleSchema({
  entity_type: "pr_review",
  label: "Pull Request Review",
  description: "A review verdict on a pull request at a specific head commit.",
  fields: {
    repository: str("Repository slug in owner/repo form."),
    pr_number: num("Pull request number."),
    pr_url: str(),
    pr_title: text(),
    head_sha: str("Head commit the review was made against."),
    reviewer: str("Who (or which agent) reviewed."),
    review_lens: str("Review perspective, e.g. security, qa, architecture."),
    verdict: str("e.g. approve, request_changes, comment."),
    status: str("e.g. posted, superseded."),
    summary: text(),
    blocking_findings: list("Findings that block merge."),
    nonblocking_findings: list("Findings that do not block merge."),
    review_round: num("Review round on this PR, starting at 1."),
    comment_url: str("URL of the posted review or comment."),
    generated_at: date("When the review was produced."),
  },
  canonical_name_fields: [
    { composite: ["repository", "pr_number", "review_lens", "head_sha"] },
    "comment_url",
  ],
});

export default prReviewSchema;
