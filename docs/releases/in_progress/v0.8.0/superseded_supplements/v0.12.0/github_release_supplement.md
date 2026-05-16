---
title: Github Release Supplement
summary: "v0.12.0 flips the attestation-revocation policy default from `log_only` (v0.11.0) to `enforce`. Agents whose attestation keys appear on Apple's anonymous-attestation revocation endpoint, on the OCSP responder for their `webauthn-packed` ..."
---

v0.12.0 flips the attestation-revocation policy default from `log_only` (v0.11.0) to `enforce`. Agents whose attestation keys appear on Apple's anonymous-attestation revocation endpoint, on the OCSP responder for their `webauthn-packed` leaf, or on the OCSP / CRL chain for their `tpm2` AIK now demote from `hardware` (or `operator_attested`) to `software` with `failure_reason: "revoked"`. The behaviour is the same one that was already observable in v0.11.0 under `NEOTOMA_AAUTH_REVOCATION_MODE=enforce`; v0.12.0 simply makes it the default.

This release contains no new Feature Units. It is the policy-flip half of:

- **FU-2026-Q4-aauth-attestation-revocation** (FU-7), shipped functionally in v0.11.0.

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full sequencing rationale.

## Ship constraints

- `npx tsc --noEmit` clean across `src/`.
- No code changes to the revocation service. v0.12.0 is a one-line default flip in `src/services/aauth_attestation_revocation.ts`'s `readRevocationMode()` function: the fallback when the env var is unset changes from `"log_only"` to `"enforce"`.
- No schema migrations.
- `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN=true` remains the default. Even under `enforce`, a CA / OCSP responder outage continues to treat the result as `unknown` (does not demote) rather than `revoked`. Operators that want closed-fail behaviour set `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN=false` explicitly.

## Highlights

- **Revoked attestations now demote.** An agent whose attestation key has been revoked at its source resolves to `software` instead of `hardware` (or `operator_attested`). The `attribution.decision.attestation.revocation.demoted` field switches from `false` (v0.11.0 default) to `true` for the same input.
- **`log_only` remains supported.** Operators that need more audit time can set `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` explicitly; behaviour matches v0.11.0 exactly.
- **`disabled` remains supported.** `NEOTOMA_AAUTH_REVOCATION_MODE=disabled` continues to suppress the lookup entirely, with no network call and no diagnostic field. Useful for CI environments that should not depend on outbound network connectivity to Apple / external OCSP responders.
- **`failure_reason: "revoked"` becomes a real value.** The enum value was already shipped in v0.11.0; v0.12.0 is the first release in which an unconfigured deployment can actually produce it.

## What changed for npm package users

- `src/services/aauth_attestation_revocation.ts` — `readRevocationMode()` default flips from `"log_only"` to `"enforce"`. No other code changes.
- `.env.example` — the inline default note next to `NEOTOMA_AAUTH_REVOCATION_MODE` is updated to reflect the new default.
- `docs/subsystems/aauth_attestation.md` — the "Revocation (FU-7)" section now documents `enforce` as the default and folds the v0.11.0 migration guidance into a "What changed in v0.12.0" sub-section.

## API surface & contracts

- No HTTP route additions or removals.
- No type changes. `attribution.decision.attestation.revocation` shape is identical to v0.11.0; only the default mode differs.
- `openapi.yaml` `AttributionDecision.attestation.revocation.mode` enum is unchanged. `npm run -s openapi:bc-diff -- --base v0.11.0` reports no breaking changes (the default mode is documentation, not schema).

## Behavior changes

- Agents with a revoked attestation key now see their tier resolve one step lower than in v0.11.0. Specifically, an envelope that previously verified to `hardware` with `revocation.status: "revoked", revocation.demoted: false` now verifies to `software` with `revocation.status: "revoked", revocation.demoted: true, failure_reason: "revoked"`.
- `NEOTOMA_MIN_ATTRIBUTION_TIER=hardware` deployments will now reject revoked attesters at the admission gate with `ATTRIBUTION_REQUIRED`. Operators rolling forward should plan to surface this to affected users (the typical remediation is for the user to re-attest with a new hardware key).
- A new log line `attestation_demoted reason=revoked source=<apple|ocsp|crl> agent_iss=<...> agent_sub=<...>` is emitted for every demotion. The line is rate-limited per-fingerprint to avoid log floods when many requests share a single revoked key.

## Tests and validation

- The integration test `tests/integration/aauth_revocation_e2e.test.ts` continues to exercise all three modes (`enforce`, `log_only`, `disabled`) explicitly. v0.12.0 only flips the default; explicitly-set modes behave identically to v0.11.0.
- `tests/unit/aauth_attestation_revocation.test.ts` — `readRevocationMode()` test for unset env var is updated to assert `"enforce"` instead of `"log_only"`.
- `npm run -s openapi:bc-diff -- --base v0.11.0` reports no breaking changes.

## New environment variables

None. v0.12.0 reuses every env var introduced in v0.11.0 and changes only the default value of `NEOTOMA_AAUTH_REVOCATION_MODE`.

## Fixes

- A revoked attestation key that previously authorised the agent at `hardware` indefinitely now demotes to `software` automatically. Operators no longer need to configure `enforce` mode explicitly to get this behaviour.

## Breaking changes

- Agents whose attestation key has been revoked at the source no longer resolve to `hardware` (or `operator_attested`). Tooling, dashboards, ACLs, and CI gates that branch on `attribution.tier === "hardware"` for these specific agents MUST be reviewed before upgrading. Operators that want a longer audit window can pin to v0.11.0 or set `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` explicitly under v0.12.0.
- `NEOTOMA_MIN_ATTRIBUTION_TIER=hardware` deployments may begin rejecting agents that previously passed admission. The recommended migration path is to use the v0.11.0 `log_only` window to identify affected agents, communicate the remediation, and only then adopt v0.12.0.

## Rollback

- npm: `v0.11.0` remains available; consumers can pin with `npm install neotoma@0.11.0`. Rolling back restores the `log_only` default.
- An in-place rollback is `NEOTOMA_AAUTH_REVOCATION_MODE=log_only`, which restores the v0.11.0 behaviour without downgrading the package.
- A more aggressive rollback is `NEOTOMA_AAUTH_REVOCATION_MODE=disabled`, which suppresses the lookup entirely.

## Follow-up work

The v0.8.0 attestation roadmap is now fully shipped. Subsequent attestation work is tracked under new Feature Units (e.g. FIDO MDS3 integration for AAGUID metadata, hardware-backed key rotation flows). See `.cursor/plans/aauth_attestation_followups.plan.md` for the historical roadmap and `docs/feature_units/in_progress/` for active work.
