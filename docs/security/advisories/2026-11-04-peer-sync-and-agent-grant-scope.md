# Sync peers and admitted agents could write beyond their configured scope (v0.27.0 fix)

- **Date disclosed:** 2026-11-04
- **GHSA:** [GHSA-9xrf-c4rq-h4gw](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-9xrf-c4rq-h4gw)
- **CVE:** _not requested_
- **Severity:** High. A party the operator had already configured or admitted could change records outside the scope the operator gave it.
- **Affected:** all versions prior to `0.27.0`.
- **Fixed in:** `0.27.0`
- **Reporter:** internal security review.
- **CWEs:** [CWE-862](https://cwe.mitre.org/data/definitions/862.html) (Missing Authorization), [CWE-863](https://cwe.mitre.org/data/definitions/863.html) (Incorrect Authorization).

## Summary

Before 0.27.0, Neotoma did not apply one consistent admission check to data arriving from sync peers, and it did not apply agent grants on every entry point that changes data. A configured sync peer could write record types outside that peer's configuration, including records that affect access and policy. An admitted agent could change or remove records its grant does not cover.

## Who is affected

- Instances that sync with any peer.
- Instances that admit agents through agent grants.

An instance with no peers and no admitted agents, used only by its owner, is not exposed through these paths. Both conditions need a party the operator had already configured or admitted; this is not unauthenticated access.

## Fix

- Every way a peer's data enters an instance runs one admission check before anything is stored. A peer's data is admitted only for the types in that peer's configuration. Governance types need a per-peer opt-in, and protected types and peer configuration are never accepted from a peer.
- Agent grants apply on every entry point that changes data, on REST and MCP. A request naming a type the grant does not cover is refused, and no data of that type is stored. New grant operations `delete`, `restore`, `merge`, `split` and `register_schema` are granted only by an entry that names them.
- A structured store requires `entity_type` as a non-empty string on every entity, for every caller kind.
- Corrections stay authoritative on their field until a later correction replaces them.
- The hosted-mode outbound host check recognises more forms of local addresses.

Regression gates: `tests/integration/sync_remote_*`, `tests/services/sync_peer_*`, `tests/integration/entity_mutation_capability_coverage.test.ts`, `tests/integration/flow_mutation_capability_coverage.test.ts`, `tests/integration/batch_correct_capability_parity.test.ts`, `tests/integration/store_capability_parity_observations_interpretations.test.ts`, `tests/security/ssrf_host_guard_alternate_loopback_forms.test.ts`.

## What to do

1. Upgrade to 0.27.0 and restart the server. The `^0.26.0` semver range does not pick this release up, so a dependent or install pinned to that range must move to `^0.27.0` or install `neotoma@0.27.0` explicitly.
2. Follow the action list in the [v0.27.0 release notes](https://github.com/markmhendrickson/neotoma/releases/tag/v0.27.0). Upgrading refuses governance types from peers until you opt each peer in, and existing agent grants do not carry the new operations.
3. Review your peer configurations and agent grants. Check that each peer lists only the types you mean to sync, and that every agent grant is one you created. Review grants with `store` or `correct` on `*` in particular, since those also cover grant records.

## Workarounds

If you cannot upgrade immediately, remove peers you do not fully trust and revoke agent grants you do not need.
