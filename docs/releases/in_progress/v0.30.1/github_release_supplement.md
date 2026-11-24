Neotoma v0.30.1 is a patch release. It changes no runtime code. It adds a regression test that pins how guest access tokens are confined on the subscription and event-stream routes under every guest access policy.

## Highlights

- **Guest token confinement is now tested on the subscription and event routes under every policy.** A token for page A gets `403` for page B's subscription on `/subscribe`, `/unsubscribe`, `/get_subscription_status` and `/events/stream` under `closed`, `read_only`, `submit_only`, `submitter_scoped` and `open`, and still manages page A's own subscription.

## What changed for npm package users

No shipped code changed. The npm package contents differ from v0.30.0 only in the version number.

## API surface & contracts

No OpenAPI or MCP tool changes. `npm run openapi:bc-diff` against `v0.30.0` reports no breaking changes.

## Behavior changes

None.

## Tests and validation

- `tests/security/guest_token_entity_binding.test.ts` gains a per-policy matrix for the subscription and event-stream routes (#2937, refs #2456). It asserts that the out-of-grant token is refused with the scope error body, that the response does not leak the other page's entity id, that `/list_subscriptions` omits the other page's subscription, and that the token's own subscription still works.
- `auth_topology_matrix` and `guest_token_entity_binding` pass (145 passed, 1 skipped).

## Security hardening

No security-sensitive surfaces touched. The diff classifier reports `sensitive=false` (one test file). The review artifact is [`security_review.md`](security_review.md).

## Breaking changes

No breaking changes.
