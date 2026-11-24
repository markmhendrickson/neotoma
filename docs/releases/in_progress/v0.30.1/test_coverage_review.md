# Test coverage review — v0.30.1

Range: `v0.30.0..HEAD` (one commit, 4ad395e0d, #2937).

## Surfaces

The release has no new user-facing surface: no CLI commands or flags, no API or MCP changes, no behavior changes. No destructive operations, parsers or runtime configuration changed. Nothing is BLOCKING.

## Test change reviewed

`tests/security/guest_token_entity_binding.test.ts`, new `describe.each(POLICIES)` block for subscription and event routes. Read the test body: it mints tokens for two pages, creates a subscription for page B, then asserts `403` plus scope-error body (and no leak of B's id) for token A on `/subscribe`, `/unsubscribe`, `/get_subscription_status` and `/events/stream`, a `200` `/list_subscriptions` that omits B's subscription, and a `200` for A's own subscribe/unsubscribe. The assertions bind on the response status and body, so removing the confinement on any of these routes turns it red. Classification: covers user-observable behavior end to end.

Executed: 145 passed, 1 skipped across `auth_topology_matrix` and `guest_token_entity_binding`.

## Code review

`/review v0.30.0..HEAD`: verdict APPROVE. The diff is one test file. No BLOCKING, ADVISORY or NIT findings: no contract seams, schema, determinism, immutability, auth-path or guardrail surfaces changed.
