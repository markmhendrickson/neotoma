# Unreleased supplement — guest issue submit creates only a new issue

A guest issue submit now creates only a new issue and thread. A `github_number` or `local_issue_id` that already identifies a stored issue or issue thread is refused with `400 ERR_ISSUE_IDENTITY_IN_USE`.

## Behavior changes

- `POST /issues/submit` on the guest path (a guest principal, or a request carrying `github_number`, `github_url`, `author`, `local_issue_id` or `submission_timestamp`, which includes submits forwarded by another instance's `submit_issue`) resolves the identity of the issue and of its thread before writing. When either already identifies a stored entity, the submit returns `400 ERR_ISSUE_IDENTITY_IN_USE`, writes nothing and returns no guest access token. `details.extra.identity_field` is `github_number` or `local_issue_id`; `details.extra.entity_type` is `issue` or `conversation`.
- Neotoma's own `submit_issue` flow (MCP, CLI and the owner path of `POST /issues/submit`) derives a new `local_issue_id` on every call and never sends `github_number`, so it is not affected.

## API surface & contracts

- `openapi.yaml` declares `ERR_ISSUE_IDENTITY_IN_USE` on `POST /issues/submit` (description and `400` response), and `src/shared/openapi_types.ts` is regenerated. See [issues subsystem § Guest submits](../../../subsystems/issues.md#guest-submits) and the [compatibility record](../../../../tests/contract/legacy_payloads/CHANGES.md).

## Breaking changes

**A guest submit retried with the same identifier now gets 400.** Before this release, a second guest submit carrying a `github_number` or `local_issue_id` that already identified a stored issue was accepted. It now returns `400 ERR_ISSUE_IDENTITY_IN_USE` with a structured `details.hint`. Client note (the hint's text): nothing was written. If you are retrying a submit whose response was lost, the first submit may already have created the issue: check it with `get_issue_status` and that issue's guest access token, or, without the token, submit again with a new `local_issue_id` (or with neither `local_issue_id` nor `submission_timestamp`, so the server assigns one) and accept that this may create a second issue. `github_number` takes precedence over `local_issue_id`, so when you pass `github_number` for an issue synced from GitHub a new `local_issue_id` does not change the identity: post to that issue with `add_issue_message` and its guest access token instead.

## Validation

- `tests/security/guest_issue_submit_token_scope.test.ts` pins the exact refusal (status, code, hint and `details.extra`), the absence of a token in the body, and the absence of any write (entity and observation counts unchanged, existing title unchanged). It covers the storage owner's `github_number` and `local_issue_id` with no credential, with `access_token` and with a Bearer header; a synced issue's `github_number` sent with a fresh `local_issue_id`; a thread that exists without its issue; another guest's `github_number` and `local_issue_id`; an exact repeat; and a repeated forwarded submit through `submitIssueToRemote`. It also checks that two `submit_issue` calls through the forwarding flow are both accepted.
- With the check removed from `src/services/issues/issue_operations.ts`, 12 of those 14 tests fail; the two that pass cover the accepted paths.

This supplement is a proposed unreleased change, not a release authorization.
