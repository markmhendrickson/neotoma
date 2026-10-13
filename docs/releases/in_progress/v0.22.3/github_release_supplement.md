# Unreleased supplement — atomic corrections

## API surface

Adds `POST /corrections/transaction`, MCP `correct_transaction`, and the existing generic CLI request operation `correctTransaction`. Up to 50 scoped entities are checked and corrected atomically, with observation-count and expected-field preconditions, payload-bound idempotency, reducer read-back verification and post-commit notifications. See [atomic corrections](../../../developer/atomic_corrections.md).

## Security hardening

The authenticated route preserves existing graph resolution and correction capability policy. Cross-graph targets fail before any write. [Security review](security_review.md) records the bounded review and validation. This change adds no guest route, scope, secret, business workflow or external URL fetch.

## Breaking changes

No breaking changes.

## Validation

Focused service, MCP dispatch, mapping and HTTP tenant tests pass (119 tests across six files), including injected rollback, concurrent competing writes, concurrent identical retry, changed-payload rejection and reducer mismatch. The baseline sequential implementation failed the five original regression cases before the transaction fix. Server build passes. This supplement is a proposed unreleased change, not a release authorization.

Independent bounded review found no core atomicity or authorization bypass and identified two error-envelope gaps. Both were reproduced before repair: REST returned generic500 for StorePolicyDeniedError, and MCP returned InternalError without capability_denied data. Shared HTTP/MCP error handlers now preserve the existing machine-readable denials; focused transport regressions pass. All119 focused tests across six files and server build pass after repair. Independent re-review is pending; no independent test rerun was claimed from the reviewer’s dependency-limited checkout.
