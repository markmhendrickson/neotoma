/**
 * `pr_comment` (engineering bundle) — one comment on a pull request or issue
 * thread.
 */

import { defineBundleSchema, num, str, text } from "../../schema_helpers.js";

export const prCommentSchema = defineBundleSchema({
  entity_type: "pr_comment",
  label: "Pull Request Comment",
  description: "A comment on a pull request or issue thread.",
  fields: {
    repository: str("Repository slug in owner/repo form."),
    pr_number: num("Pull request number, when the comment is on a PR."),
    issue_number: num("Issue number, when the comment is on an issue."),
    comment_id: num("Platform comment id."),
    comment_kind: str("e.g. review, issue_comment, inline."),
    html_url: str("URL of the comment."),
    body: text("Comment body (markdown)."),
    summary: text(),
    agent: str("Agent that posted the comment, if any."),
    lens: str("Review lens the comment speaks for, if any."),
    verdict: str(),
    head_sha: str("Head commit the comment refers to."),
    status: str(),
  },
  canonical_name_fields: ["html_url", { composite: ["repository", "comment_id"] }],
});

export default prCommentSchema;
