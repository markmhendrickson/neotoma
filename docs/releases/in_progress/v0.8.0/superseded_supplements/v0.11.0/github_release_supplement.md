v0.11.0 closes the credential lifecycle gap that the v0.8.0 attestation framework left open: when an attestation key is revoked at its source (Apple App Attestation revocation endpoint, OCSP for WebAuthn-packed leaves, OCSP / CRL for TPM AIK chains), Neotoma now sees the revocation and surfaces it in `attribution.decision.attestation.revocation`. v0.11.0 ships this lookup in `log_only` mode by default — operators can audit how often previously-trusted attestations would be demoted before any tier change actually happens. v0.12.0 will flip the default to `enforce`.

This release implements one follow-up Feature Unit from the v0.8.0 attestation plan:

- **FU-2026-Q4-aauth-attestation-revocation** (FU-7)

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full sequencing rationale.

## Ship constraints

- `npx tsc --noEmit` clean across `src/`.
- No schema migrations. Revocation diagnostics ride inside the existing `attribution.decision.attestation` block as an additive `revocation` sub-object.
- The default revocation mode is `log_only`. v0.11.0 deliberately does not change the resolved tier for any agent that previously verified — it only annotates the decision diagnostic with revocation evidence.
- The revocation service uses an in-memory LRU cache keyed by certificate fingerprint with a 24-hour default TTL (`NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS`). No persistent state is added to the database.
- Network calls are wrapped in a 5-second default timeout (`NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`) and a fail-open default (`NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN=true`); a CA / OCSP responder outage does not pre-emptively demote agents.

## Highlights

- **Revocation lookup, three sources.** A new service `src/services/aauth_attestation_revocation.ts` performs the lookup appropriate to the attestation format: Apple's anonymous-attestation revocation endpoint for `apple-secure-enclave`, OCSP with CRL fallback for `webauthn-packed` leaves, and OCSP with CRL fallback for the AIK chain in `tpm2`. The service is pluggable via a `RevocationFetcher` interface so tests can mock the network without monkey-patching the module.
- **Decision diagnostics surface the result.** `attribution.decision.attestation.revocation` now appears alongside the existing v0.8.0 fields, with `checked: boolean`, `status: "good" | "revoked" | "unknown"`, `source: "apple" | "ocsp" | "crl" | null`, `mode: "disabled" | "log_only" | "enforce"`, and `demoted: boolean`. The shape is consistent across all three formats so dashboards do not need to fork by format.
- **`log_only` is the default.** No agent that previously resolved to `hardware` or `operator_attested` is demoted by v0.11.0 alone. Operators who want to see the demotion impact ahead of v0.12.0 can scrape `attribution_decision` log lines or the `/session` shape and look for `revocation.status: "revoked"` with `revocation.demoted: false`.
- **Cache + timeout + fail-open are operator-tunable.** Five new env vars (`NEOTOMA_AAUTH_REVOCATION_MODE`, `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS`, `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`, `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN`, `NEOTOMA_AAUTH_APPLE_REVOCATION_URL`) cover the operational levers without code changes.

## What changed for npm package users

**Attestation services**

- `src/services/aauth_attestation_revocation.ts` — new service. Defines `RevocationMode`, `RevocationStatus`, `RevocationSource`, `RevocationOutcome`, `RevocationCheckContext`, and `RevocationFetcher`. Implements `checkRevocation()` (entry point), `checkAppleRevocation()` (Apple endpoint), and `checkOcspWithCrlFallback()` (with hand-written DER builders / parsers — no external OCSP library dependency). Includes `resetRevocationCacheForTests()` for hermetic tests.
- `src/services/aauth_attestation_verifier.ts` — extends `AttestationOutcome` with an optional `revocation: AttestationRevocationDiagnostic` field and `AttestationFailureReason` with `"revoked"`. New `applyRevocationPolicy()` helper centralises how revocation results affect tier resolution per mode and `failOpen` setting.
- `src/services/aauth_attestation_apple_se.ts`, `src/services/aauth_attestation_webauthn_packed.ts`, `src/services/aauth_attestation_tpm2.ts` — each verifier calls `checkRevocation()` after its own chain and signature checks succeed, then runs the result through `applyRevocationPolicy()`.

**Attribution surface**

- `src/middleware/aauth_verify.ts` — `attestationOutcomeForDiagnostics` now maps the new `revocation` field into the request-scoped `AttributionDecisionDiagnostics`.
- `src/crypto/agent_identity.ts` — defines `AttestationRevocationDiagnosticsField`; extends `AttributionDecisionDiagnostics` with the `revocation` sub-object and `"revoked"` reason.
- `src/services/session_info.ts` — defines `SessionAttestationRevocationField` and threads the new field through the `/session` response shape.

**Documentation**

- `docs/subsystems/aauth_attestation.md` — new "Revocation (FU-7)" section documenting channels, policy semantics, caching, decision diagnostics, and the migration plan from `log_only` to `enforce`. The "Diagnostics surface" section is refreshed to describe the v0.11.0 `attribution.decision` shape end-to-end.
- `.env.example` — five new lines covering the revocation env vars with their defaults inlined.

## API surface & contracts

- No HTTP route additions or removals.
- `attribution.decision.attestation` gains an optional `revocation` sub-object. The field is omitted (not `null`) when `NEOTOMA_AAUTH_REVOCATION_MODE=disabled`, so operators can distinguish "we never checked" from "we checked and got `good`".
- `AttestationFailureReason` enum gains `"revoked"`. The reason only appears in `enforce` mode (v0.11.0 ships `log_only` by default; v0.12.0 will flip).
- `openapi.yaml` `AttributionDecision.attestation` schema is extended with the optional `revocation` field; `npm run -s openapi:bc-diff -- --base v0.10.1` reports an additive change.

## Behavior changes

- On `log_only` mode (the default), every successful attestation verification now carries a revocation diagnostic. Verification latency increases by one network round-trip on cache miss; cache hits add ~microseconds. The 5-second timeout caps the worst case.
- On `disabled` mode, no network calls are issued and no `revocation` field appears in the decision shape.
- `attribution.decision.attestation` shape adds the `revocation` sub-object. Field additions are backwards compatible, but consumers that asserted exact-shape equality on the decision object will need to update.
- A new log line `attestation_revocation_check status=<good|revoked|unknown> source=<apple|ocsp|crl|null> source_url=<...> elapsed_ms=<n>` appears for every revocation lookup that hits the network. Cache hits are not logged.

## Tests and validation

- `tests/unit/aauth_attestation_revocation.test.ts` — env var parsing, cache hit / miss / TTL eviction, `disabled` mode bypass, Apple endpoint revoked / good / unknown, and the "no AIA / CDP extension" path. Network is mocked via the `RevocationFetcher` interface; a runtime-generated X.509 fixture covers the certificate-shaped paths.
- `tests/unit/aauth_attestation_verifier.test.ts` — new tests for `applyRevocationPolicy()` covering `disabled`, `log_only`, and `enforce` modes against `revoked` and `unknown` statuses with both `failOpen=true` and `failOpen=false`.
- `tests/integration/aauth_revocation_e2e.test.ts` — spins up a local HTTP server impersonating Apple's anonymous-attestation revocation endpoint, then exercises the middleware → Apple SE verifier → revocation service path end-to-end against the real `node:http` fetcher (no module-level mock). Locks in: (i) `enforce` + revoked serial → diagnostic surfaces but tier remains as v0.10.x (because v0.11.0 default is `log_only`; the test runs `enforce` explicitly to demonstrate the policy without flipping the default), (ii) `log_only` + revoked serial → tier intact, diagnostic surfaces, (iii) `disabled` mode → no network call (server hit count = 0), no diagnostic, (iv) `enforce` + good serial → tier intact, `revocation.status: "good"`.
- `npm run -s openapi:bc-diff -- --base v0.10.1` reports the additive `revocation` field on `AttributionDecision.attestation`.

## New environment variables

| Env var                                          | Default                                  | Purpose                                                                                       |
| ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `NEOTOMA_AAUTH_REVOCATION_MODE`                  | `log_only`                               | One of `disabled` / `log_only` / `enforce`. Controls whether revoked status demotes the tier. |
| `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS`     | `86400`                                  | LRU cache TTL keyed by certificate fingerprint.                                               |
| `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`            | `5000`                                   | Per-lookup network timeout (Apple endpoint, OCSP, or CRL fetch).                              |
| `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN`             | `true`                                   | When the responder is unreachable, treat the result as `unknown` (true) or `revoked` (false). |
| `NEOTOMA_AAUTH_APPLE_REVOCATION_URL`             | `https://data-development.apple.com/...` | Override the Apple anonymous-attestation revocation endpoint. Primarily for testing.          |

All five are documented in `.env.example` and `docs/subsystems/aauth_attestation.md`.

## Fixes

- A revoked attestation key that previously continued to authorise the agent at its prior tier indefinitely now produces audit-trail evidence in `attribution.decision.attestation.revocation`. Operators can detect the situation before flipping `enforce` mode in v0.12.0.

## Breaking changes

- Consumers that asserted exact-shape equality on `attribution.decision.attestation` will see a new optional `revocation` sub-object (omitted only under `disabled` mode). Code paths that switch on `attribution.decision.attestation.failure_reason` should expect a new `"revoked"` value to be possible (it remains absent under `log_only` mode in v0.11.0; it becomes a real demotion reason in v0.12.0).

## Rollback

- npm: `v0.10.1` remains available; consumers can pin with `npm install neotoma@0.10.1`. Rolling back removes the revocation diagnostic surface and never issues revocation network calls.
- A more conservative in-place rollback (without downgrading) is `NEOTOMA_AAUTH_REVOCATION_MODE=disabled`, which suppresses the diagnostic and the network calls without removing the code path. Operators can flip back to `log_only` (or onwards to `enforce`) by env var alone.

## Follow-up work

- v0.12.0 will flip the default mode to `enforce`. Agents whose attestation keys appear on the relevant revocation channel will demote from `hardware` → `software` (or `operator_attested` → `software` for the rare overlap case where an operator-attested issuer also presents a revoked attestation envelope) with `failure_reason: "revoked"`. Operators are expected to use the v0.11.0 `log_only` window to audit how often this would happen against their fleet before adopting v0.12.0.

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full follow-up roadmap.
