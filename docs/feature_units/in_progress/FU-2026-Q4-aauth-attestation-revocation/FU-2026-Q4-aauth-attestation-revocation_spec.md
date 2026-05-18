---
title: "Feature Unit: FU-2026-Q4-aauth-attestation-revocation — Attestation Revocation"
summary: "**Status:** In Progress **Priority:** P1 (closes the trust-lifecycle gap deferred from v0.8.0) **Risk Level:** Medium (touches every format verifier; tier-resolution semantics change in `enforce` mode) **Target Release:** v0.11.0 (`log_o..."
---

# Feature Unit: FU-2026-Q4-aauth-attestation-revocation — Attestation Revocation

**Status:** In Progress
**Priority:** P1 (closes the trust-lifecycle gap deferred from v0.8.0)
**Risk Level:** Medium (touches every format verifier; tier-resolution semantics change in `enforce` mode)
**Target Release:** v0.11.0 (`log_only`) → v0.12.0 (`enforce` flip)
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Add cross-format attestation revocation to the AAuth verifier. Each
format-specific verifier (Apple Secure Enclave, WebAuthn-packed,
TPM 2.0) gains a post-chain-validation hook that consults a shared
revocation service (`src/services/aauth_attestation_revocation.ts`)
to determine whether the attestation chain — or its underlying root
of trust — has been revoked. Revocation evidence is one of:

- **Apple App Attestation revocation list** — Apple-specific endpoint
  consulted for `apple-secure-enclave` envelopes.
- **OCSP** — standard X.509 Online Certificate Status Protocol against
  the leaf cert's AIA `OCSP` URL. Used by `webauthn-packed` (including
  YubiKey) and `tpm2` envelopes.
- **CRL fallback** — when AIA does not advertise an OCSP responder,
  the cert's CDP URL is consulted for a Certificate Revocation List.
  Cached identically.

Three operational modes gate behaviour, controlled by
`NEOTOMA_AAUTH_REVOCATION_MODE`:

| Mode      | Default in | Behaviour on revocation evidence                                    | Tier impact          |
| --------- | ---------- | ------------------------------------------------------------------- | -------------------- |
| `disabled`| -          | Revocation checks skipped entirely. Preserves v0.10.x behaviour.    | None.                |
| `log_only`| v0.11.0    | Checks run; revoked status surfaced in `decision.attestation.revocation_status` and structured log; tier resolution unchanged. | None (observation).  |
| `enforce` | v0.12.0    | Revoked attestations demote the tier from `hardware` to `software` with `failure_reason: "revoked"`. | Tier demoted.        |

The two-release cadence (`log_only` → `enforce`) gives operators one
release window to observe revocation outcomes before they take effect
on tier resolution. Inspector visualisation (FU-1) renders the new
`revocation_status` field in the AttestationEnvelopePanel so the
observation period is actionable.

**User Value:**
- Closes the gap where a leaked attestation key, a compromised AIK, or
  a YubiKey reported lost would still verify cleanly indefinitely.
- Aligns Neotoma's AAuth verifier with the trust-lifecycle expectations
  of every other WebAuthn / FIDO2 / TPM 2.0 deployment.
- Bounded TTL caching means revocation checks add bounded latency to
  the verification path while still picking up new revocations within
  a configurable window.
- The two-release `log_only` → `enforce` flip is a deliberate
  observability-before-enforcement contract: operators see the impact
  before it lands.

**Technical Approach (high level):**
- New `src/services/aauth_attestation_revocation.ts` exposes
  `checkRevocation(envelope, chain) → RevocationOutcome` consumed by
  the three format verifiers post-chain-validation.
- Shared OCSP / CRL fetcher with an in-memory LRU cache keyed by
  `(issuer_thumbprint, serial_number)`. Cache TTL configurable via
  `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS` (default 21600 = 6h).
  Cache entries record both `valid_until` (from OCSP `nextUpdate` or
  CRL `nextUpdate`, capped by the configured TTL) and `cached_at` so
  diagnostics can surface staleness.
- Per-format hooks:
  - `aauth_attestation_apple_se.ts` — calls Apple's anonymous
    attestation revocation endpoint after chain validation. Apple's
    endpoint is documented in their App Attestation reference and
    returns either `valid` or `revoked`; we treat any other response
    as `unknown`.
  - `aauth_attestation_webauthn_packed.ts` — standard X.509 OCSP via
    leaf AIA. Falls back to CRL via leaf CDP when AIA is missing.
  - `aauth_attestation_tpm2.ts` — standard X.509 OCSP via the AIK
    leaf's AIA. Falls back to CRL via CDP.
- Decision diagnostics extension:
  `decision.attestation.revocation_status` ∈
  `{ "unchecked", "valid", "revoked", "unknown", "error" }` plus
  `decision.attestation.revocation_check_at` (ISO timestamp) and
  `decision.attestation.revocation_source` (`"apple-endpoint"` |
  `"ocsp"` | `"crl"` | `"cache"` | `null`).
- Mode-specific tier behaviour:
  - `disabled` → `revocation_status: "unchecked"` always; tier
    resolution unchanged.
  - `log_only` → checks run; `revocation_status` populated but tier
    resolution unchanged; structured log entry on `revoked`.
  - `enforce` → checks run; `revoked` → demote `hardware` to
    `software` with `failure_reason: "revoked"`; `unknown` and
    `error` → behaviour controlled by
    `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN` (default `1` =
    fail-open / treat unknown as valid).
- Bounded request budget: each revocation check has a per-request
  timeout (`NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`, default 5000 ms)
  and the verifier short-circuits to `revocation_status: "error"` on
  timeout. The verifier never blocks chain validation indefinitely.

## Goals

1. Add post-chain-validation revocation checks to all three format
   verifiers without changing their public verification API surface.
2. Ship `log_only` mode in v0.11.0 with full diagnostic surfacing so
   operators can observe revocation outcomes before they take effect.
3. Flip default to `enforce` in v0.12.0 with a clean operator
   migration story (`NEOTOMA_AAUTH_REVOCATION_MODE` env var,
   structured release supplement note, Inspector surface).
4. Keep revocation latency bounded via in-memory LRU cache + per-check
   timeout so verification stays predictable under high load.
5. Surface revocation status in Inspector (FU-1) so operators have a
   live read on trust-lifecycle health.

## Non-Goals

- Active CRL pre-fetching or scheduled refresh. Lazy-fetch on demand
  with bounded TTL caching is sufficient.
- Custom revocation reason codes beyond the OCSP standard
  (`unspecified`, `keyCompromise`, `cACompromise`, etc.). We surface
  the OCSP reason code verbatim in diagnostics but do not invent new
  semantics.
- Revocation of root CA certs. The configured trust roots
  (`NEOTOMA_AAUTH_ATTESTATION_CA_PATH`) are operator-managed; if a
  root is compromised the operator removes it from the trust store.
- Revocation by AAGUID. AAGUID admission is a separate trust knob
  (`NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`) and remains unchanged.
- Server-issued attestation challenges. Current model is
  client-derived (`SHA-256(jwt.iss || jwt.sub || jwt.iat)`).

## Functional Requirements

1. **FR-1: Shared revocation service.** `checkRevocation(envelope,
   chain) → RevocationOutcome` consumed by all three format
   verifiers. The service decides the lookup strategy
   (Apple endpoint / OCSP / CRL / cache hit) based on the envelope
   format and chain metadata, NOT the caller.
2. **FR-2: Per-format hooks.** Each format verifier calls
   `checkRevocation` after chain validation succeeds and before
   returning the verification outcome. Hook ordering: chain → key
   binding → revocation. A revoked status does NOT skip the key
   binding check.
3. **FR-3: Three-mode behaviour.** Mode resolved at startup from
   `NEOTOMA_AAUTH_REVOCATION_MODE` (with defaults from the active
   release). Mode is observable on the verifier output via
   `revocation_mode` so the Inspector and audit log can render it.
4. **FR-4: Cache.** In-memory LRU keyed by `(issuer_thumbprint,
   serial_number)`. TTL from
   `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS` (default 21600 = 6h),
   capped by OCSP `nextUpdate` / CRL `nextUpdate` when present.
   Entries record `cached_at` and `valid_until` for diagnostics.
5. **FR-5: Bounded request budget.** Per-check timeout from
   `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS` (default 5000 ms). On
   timeout, the outcome is `error` with reason `timeout`. The
   verifier never blocks indefinitely.
6. **FR-6: Fail-open semantics for `unknown`.** When OCSP / CRL is
   unreachable or returns `unknown`, behaviour is controlled by
   `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN` (default `1`). Operators can
   set to `0` to treat `unknown` as `revoked` for high-assurance
   environments.
7. **FR-7: Tier demotion in `enforce` mode.** `revocation_status:
   "revoked"` demotes the tier from `hardware` to `software` with
   `failure_reason: "revoked"`. The demotion path reuses the existing
   tier-resolution logic; we do not introduce a new tier value.
8. **FR-8: Decision diagnostics extension.** The verifier output
   `AttestationOutcome` gains `revocation_status`,
   `revocation_check_at`, `revocation_source`, and
   `revocation_reason_code` fields. `session_info.ts` surfaces them
   in `decision.attestation` so the Inspector renders them.
9. **FR-9: Inspector visibility.** FU-1's `AttestationEnvelopePanel`
   renders the new revocation fields with the same expandable detail
   pattern as the chain summary. Tier badge tooltip mentions
   `revocation_status` when present.
10. **FR-10: No regression on existing v0.8.0+ envelopes.** Existing
    SE-rooted envelopes with no Apple endpoint configuration return
    `revocation_status: "unchecked"` (mode `disabled`) or `"valid"`
    (mode `log_only`/`enforce` with the endpoint reachable). No
    existing trust roots are demoted.

## Non-Functional Requirements

- **NFR-1: Bounded latency.** Each verification path adds at most
  `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS` to chain validation; cache
  hits add < 1 ms. p99 verification latency in `log_only` mode must
  not exceed v0.10.x p99 + 50 ms.
- **NFR-2: Memory bounded.** LRU cache capped at 4096 entries; each
  entry is < 512 bytes (issuer thumbprint + serial + outcome +
  timestamps). Total memory budget < 2 MB.
- **NFR-3: Deterministic.** Cache hits are deterministic. Cache
  misses depend on network state; the verifier surfaces
  `revocation_source` so operators can distinguish cached vs
  freshly-fetched outcomes.
- **NFR-4: Observability.** Every revocation check emits a structured
  log entry (`event: aauth.revocation.check`, fields: `format`,
  `issuer_thumbprint`, `serial`, `outcome`, `source`, `latency_ms`,
  `cached`).
- **NFR-5: No external dependencies.** Use `node:http2` for OCSP
  requests; do NOT add a third-party OCSP library. Apple's endpoint
  is a regular HTTPS POST. CRL parsing uses
  `node:crypto.X509Certificate` to walk extension OIDs and
  `Buffer`-backed manual ASN.1 parse for the revoked-cert list.
- **NFR-6: Privacy.** Revocation requests transmit only the cert
  serial + issuer thumbprint, not the agent identity. The OCSP
  responder never sees `iss` / `sub` / `jkt`.

## Invariants

- Revocation checks never run BEFORE chain validation succeeds.
  `revocation_status` is `"unchecked"` when chain validation fails.
- Revocation checks never modify the envelope or chain. The verifier
  output is additive.
- The `disabled` mode is bit-for-bit equivalent to the v0.10.x
  verifier output (modulo the new `revocation_mode` field set to
  `"disabled"` and `revocation_status: "unchecked"`).
- Mode is process-wide; we do not support per-request mode overrides.
- Cache TTL never exceeds the OCSP `nextUpdate` or CRL `nextUpdate`
  when present.

## Affected Subsystems

- **`src/services/aauth_attestation_revocation.ts`** (new) — Shared
  OCSP / CRL fetcher + LRU cache + Apple endpoint client. Pure
  function over `(envelope, chain) → RevocationOutcome`; no shared
  mutable state besides the cache.
- **`src/services/aauth_attestation_apple_se.ts`** — Add hook
  invocation after chain validation. Apple endpoint URL configurable
  via `NEOTOMA_AAUTH_APPLE_REVOCATION_ENDPOINT`.
- **`src/services/aauth_attestation_webauthn_packed.ts`** — Add hook
  invocation post-chain-validation, pre-key-binding-result.
- **`src/services/aauth_attestation_tpm2.ts`** — Add hook invocation
  post-chain-validation, pre-pubArea-binding-result.
- **`src/services/aauth_attestation_verifier.ts`** — Extend
  `AttestationOutcome` with `revocation_status`,
  `revocation_check_at`, `revocation_source`,
  `revocation_reason_code`, `revocation_mode` fields. Mode resolution
  + tier demotion logic lives here.
- **`src/services/session_info.ts`** — Surface the new fields in
  `decision.attestation` so they reach the Inspector and audit log.
- **`inspector/src/components/shared/attestation_envelope_panel.tsx`**
  — Render the new fields in the existing panel structure (FU-1).
- **`config/aauth/`** — No new files; existing trust root bundle
  unchanged.
- **`.env.example`** — Document the four new variables.

## Documentation Touchpoints

- `docs/subsystems/aauth_attestation.md` — New "Revocation" section
  describing the three modes, the per-format hooks, the decision
  diagnostics extension, and the v0.11→v0.12 enforce-mode migration
  plan. Each format row in the dispatch table flips from
  "verified" to "verified + revocation-aware".
- `docs/subsystems/aauth_cli_attestation.md` — No CLI surface change;
  add a brief note explaining that the CLI does not consume the new
  env vars (server-side only).
- `docs/subsystems/agent_attribution_integration.md` — Update
  "Cryptographic attestation" section to mention revocation as part
  of the verification pipeline.
- `docs/releases/in_progress/v0.11.0/github_release_supplement.md` —
  Document `log_only` rollout, new env vars, observation guidance.
- `docs/releases/in_progress/v0.12.0/github_release_supplement.md` —
  Document `enforce` flip as a breaking change for operators with
  revoked-attestation agents.

## Tests

### Unit tests

- `tests/unit/aauth_attestation_revocation.test.ts` — Mocked OCSP
  responder + Apple endpoint; verifies cache TTL, fail-open behaviour,
  per-check timeout, and outcome shape. Covers each
  `revocation_status` value at least once.
- `tests/unit/aauth_attestation_apple_se_revocation.test.ts` —
  Hook integration with Apple SE verifier. Verifies revocation
  evidence does not skip key binding check.
- `tests/unit/aauth_attestation_webauthn_packed_revocation.test.ts`
  — Hook integration with WebAuthn-packed verifier including
  YubiKey-rooted chains. Verifies AIA fallback to CDP.
- `tests/unit/aauth_attestation_tpm2_revocation.test.ts` — Hook
  integration with TPM 2.0 verifier. Verifies AIK chain OCSP path.
- `tests/unit/aauth_attestation_revocation_modes.test.ts` —
  Mode-resolution logic. Verifies `disabled` / `log_only` / `enforce`
  produce the correct tier outcomes for the same revoked input.

### Integration tests

- `tests/integration/aauth_revocation_e2e.test.ts` — End-to-end
  `log_only` and `enforce` flows. Generates a runtime CA + leaf,
  serves a mocked OCSP responder, exercises a revoked leaf, and
  confirms the verifier output (tier unchanged in `log_only`, tier
  demoted in `enforce`).
- `tests/integration/aauth_revocation_cache.test.ts` — Verifies
  cache hits skip the network and produce `revocation_source:
  "cache"`. Verifies cache TTL is honoured.

## Configuration

| Variable                                       | Default (v0.11.0) | Default (v0.12.0) | Purpose                                                       |
| ---------------------------------------------- | ----------------- | ----------------- | ------------------------------------------------------------- |
| `NEOTOMA_AAUTH_REVOCATION_MODE`                | `log_only`        | `enforce`         | One of `disabled` / `log_only` / `enforce`.                   |
| `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS`   | `21600` (6h)      | `21600` (6h)      | LRU cache TTL ceiling; OCSP `nextUpdate` may shorten it.      |
| `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`          | `5000`            | `5000`            | Per-check network timeout.                                    |
| `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN`           | `1`               | `1`               | When `1`, `unknown` outcomes are treated as `valid`. Set to `0` for high-assurance environments that prefer fail-closed behaviour. |
| `NEOTOMA_AAUTH_APPLE_REVOCATION_ENDPOINT`      | (Apple default)   | (Apple default)   | Override Apple's anonymous attestation revocation endpoint URL. |

## Migration plan (v0.11.0 → v0.12.0)

- v0.11.0 release notes ship the new env vars with `log_only` default.
  Inspector renders revocation status; operators get one release
  window to inspect revoked agents.
- v0.12.0 release notes ship the `enforce` flip as a documented
  breaking change. Operators who observe revoked agents in v0.11.0
  must rotate those agents (or set
  `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` to opt out of the flip).
- The flip is a config-default change, not a code change. Operators
  who explicitly set `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` in
  their environment retain `log_only` behaviour across the upgrade.

## Risks

| Risk                                                                                    | Mitigation                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| OCSP responder unavailable causes verification latency spikes                           | Per-check timeout (`NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`) caps blocking time; LRU cache absorbs steady-state load.                       |
| Apple endpoint behaviour changes silently                                               | Treat any non-`{valid, revoked}` response as `unknown`; surface in diagnostics; document the contract dependency in the subsystem doc.   |
| Operator forgets `enforce` flip and mass-demotes legitimate agents in v0.12.0           | One-release `log_only` window; release supplement mandates inspecting `decision.attestation.revocation_status` before upgrade.           |
| Cache pollution by adversary-controlled responses                                       | Cache key is `(issuer_thumbprint, serial)`; an adversary cannot poison entries for other certs. OCSP signatures verified against issuer. |
| `unknown` outcomes overshadow real revocations in `enforce` mode if fail-open is set    | Document the `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN=0` opt-in for high-assurance environments; emit structured logs on every `unknown`.     |

## Related Documents

- [`docs/subsystems/aauth_attestation.md`](../../subsystems/aauth_attestation.md) — Server-side attestation verifier (gains revocation section)
- [`docs/feature_units/in_progress/FU-2026-Q3-aauth-webauthn-packed-verifier/`](../FU-2026-Q3-aauth-webauthn-packed-verifier/) — FU-2 (gains revocation hook)
- [`docs/feature_units/in_progress/FU-2026-Q3-aauth-tpm2-verifier/`](../FU-2026-Q3-aauth-tpm2-verifier/) — FU-3 (gains revocation hook)
- [`docs/feature_units/in_progress/FU-2026-Q3-aauth-inspector-attestation-viz/`](../FU-2026-Q3-aauth-inspector-attestation-viz/) — FU-1 (renders revocation fields)
- [`docs/releases/in_progress/v0.11.0/github_release_supplement.md`](../../releases/in_progress/v0.11.0/github_release_supplement.md) — Rollout (`log_only`)
- [`docs/releases/in_progress/v0.12.0/github_release_supplement.md`](../../releases/in_progress/v0.12.0/github_release_supplement.md) — Enforce flip
