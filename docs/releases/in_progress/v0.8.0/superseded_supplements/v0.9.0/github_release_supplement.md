---
title: Github Release Supplement
summary: "v0.9.0 finishes the v0.8.0 attestation framework by replacing every server-side stub with a real verifier and by giving the Inspector the surface to explain what each verifier decided. After v0.9.0 the format dispatch in `src/services/aa..."
---

v0.9.0 finishes the v0.8.0 attestation framework by replacing every server-side stub with a real verifier and by giving the Inspector the surface to explain what each verifier decided. After v0.9.0 the format dispatch in `src/services/aauth_attestation_verifier.ts` accepts three real-world attestation formats — `apple-secure-enclave` (already shipped in v0.8.0), `webauthn-packed` (FIDO2 / WebAuthn registration), and `tpm2` (Linux / Windows hardware attestation) — with the same `AttestationOutcome` contract for all three. No CLI surfaces change in this release; v0.9.0 is server-side and Inspector-only so operators can adopt it without coordinating client upgrades.

This release implements three follow-up Feature Units from the v0.8.0 attestation plan:

- **FU-2026-Q3-aauth-inspector-attestation-viz** (FU-1)
- **FU-2026-Q3-aauth-webauthn-packed-verifier** (FU-2)
- **FU-2026-Q3-aauth-tpm2-verifier** (FU-3)

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full sequencing rationale.

## Ship constraints

- `npx tsc --noEmit` clean across `src/` and `inspector/`.
- No schema migrations. The `AttestationOutcome` contract is unchanged from v0.8.0; v0.9.0 only fills in two previously-stubbed implementations and extends `failure_reason` with format-specific codes already documented in `docs/subsystems/aauth_attestation.md`.
- New trust roots ship under `config/aauth/tpm_attestation_roots/` (Infineon, STMicro, Intel, AMD bundles). Operators may supplement via `NEOTOMA_AAUTH_ATTESTATION_CA_PATH` exactly as they already do for Apple roots.
- The Inspector visualisation work is purely additive — the existing `AgentBadge` tooltip continues to render unchanged when no attestation envelope is present.

## Highlights

- **WebAuthn-packed verifier is real.** `src/services/aauth_attestation_webauthn_packed.ts` verifies the W3C WebAuthn §8.2 packed-format statement: parses `alg` / `sig` / `x5c` / optional `aaguid`-from-cert-extension (OID `1.3.6.1.4.1.45724.1.1.4`), walks the chain to a trusted root, verifies the signature over the canonical attestation data using the existing challenge derivation, and binds the leaf credential public key to `cnf.jwk` via RFC 7638 thumbprint. AAGUID admission honours `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH` (already wired in v0.8.0).
- **TPM 2.0 verifier is real.** `src/services/aauth_attestation_tpm2.ts` parses the WebAuthn `tpm` statement (`ver`, `alg`, `x5c`, `sig`, `certInfo`, `pubArea`), walks the AIK chain to a trusted TPM CA root, verifies the signature over `certInfo`, and binds `pubArea`'s public key to `cnf.jwk` via RFC 7638 thumbprint. The `TPMS_ATTEST` and `TPMT_PUBLIC` parsers live in a new `src/services/aauth_tpm_structures.ts` written by hand against the TCG spec — there is no external TPM library dependency.
- **Inspector renders the envelope.** `inspector/src/components/shared/agent_badge.tsx` extends the tier badge tooltip with envelope-aware fields (`format`, AAGUID truncated, `key_binding_matches_cnf_jwk`). A new `AttestationEnvelopePanel` on the agent detail page renders a chain summary (CN + issuer per cert), the decision reason, and the raw envelope JSON behind a "Show raw" toggle. The drive-by tier-icon fix completes the four-tier visual mapping (`anonymous`, `software`, `operator_attested`, `hardware`); previously `operator_attested` fell through to the default `○` glyph.
- **Format dispatch table is complete.** `docs/subsystems/aauth_attestation.md` flips the `webauthn-packed` and `tpm2` rows from "stub" to "verified" with the supported subset spelled out. Operators can now read the document end-to-end without "stub" caveats interrupting the cascade description.

## What changed for npm package users

**Attestation services**

- `src/services/aauth_attestation_webauthn_packed.ts` — full implementation replacing the v0.8.0 stub. Reuses the existing `AttestationContext` shape and returns the existing `AttestationOutcome` discriminated union; no new public types are introduced.
- `src/services/aauth_attestation_tpm2.ts` — full implementation replacing the v0.8.0 stub. Same contract.
- `src/services/aauth_tpm_structures.ts` — new internal module exposing minimal `parseTpmsAttest()` and `parseTpmtPublic()` helpers used only by the TPM 2.0 verifier. Not part of the public package surface.
- `config/aauth/tpm_attestation_roots/` — new bundled TPM CA roots (Infineon, STMicro, Intel, AMD). Each `.pem` carries a sourcing note documenting where the root was downloaded and the SHA-256 fingerprint of the bundled file.
- `src/services/aauth_attestation_trust_config.ts` — extended to load the new TPM roots in addition to the Apple root and any operator-supplied bundle.

**Inspector**

- `inspector/src/components/shared/agent_badge.tsx` — `tierIcon()` now covers all four tiers; tooltip rows surface envelope fields when present.
- `inspector/src/components/shared/attestation_envelope_panel.tsx` — new component rendering chain summary, decision diagnostics, and a raw-JSON toggle.
- The agent detail page route mounts the new panel under the existing identity card.

## API surface & contracts

- No HTTP route additions or removals.
- `attribution.decision.attestation` field shape is unchanged from v0.8.0 (`envelope_present`, `format`, `outcome`, `failure_reason`, `key_binding_matches_cnf_jwk`); new `failure_reason` codes that may surface for `webauthn-packed` and `tpm2` envelopes are documented inline in `docs/subsystems/aauth_attestation.md`. Consumers that switch on `failure_reason` should expect to see new strings; the field type remains `string | null` and the absence of a code continues to mean "no failure".
- `AttestationOutcome` and `AttestationFailureReason` remain the public types. New failure reasons (`pubarea_mismatch`, `chain_invalid`, `signature_invalid` for the new formats) are added to the enum union as additive members; consumers using exact-equality on `failure_reason` may need to update.
- `openapi.yaml` is not materially tightened in this release; `npm run -s openapi:bc-diff -- --base v0.8.0` reports no breaking changes.

## Behavior changes

- Agents that previously attempted to present a `webauthn-packed` or `tpm2` envelope to a v0.8.0 server received `failure_reason: "format_unsupported"` and resolved to `software`. Under v0.9.0 the same envelope verifies (or fails with a real reason like `chain_invalid` / `signature_invalid` / `aaguid_not_trusted`) and may now resolve to `hardware`.
- The Inspector now renders attestation diagnostics for every signed agent. Operators relying on the prior "tier badge only" presentation should expect richer per-agent context.

## Tests and validation

- `tests/unit/aauth_attestation_webauthn_packed.test.ts` — synthetic WebAuthn packed fixtures covering verified, `chain_invalid`, `aaguid_not_trusted`, `signature_invalid`, and `key_binding_mismatch` paths.
- `tests/integration/aauth_webauthn_packed_e2e.test.ts` — runtime-generated CA + leaf chain through the AAuth middleware end-to-end.
- `tests/unit/aauth_attestation_tpm2.test.ts` — synthetic `TPMS_ATTEST` + AIK chain fixtures covering verified, `chain_invalid`, `signature_invalid`, `pubarea_mismatch`, and parser malformed-input paths.
- `tests/integration/aauth_tpm2_e2e.test.ts` — runtime-generated TPM CA + AIK chain through the AAuth middleware end-to-end.
- Inspector: rendering snapshot for `AttestationEnvelopePanel` plus unit tests for `tierIcon()`'s four-tier mapping.

## New environment variables

None. v0.9.0 reuses every env var introduced in v0.8.0.

## Fixes

- `tierIcon()` no longer falls through to the default `○` glyph for `operator_attested`; the four-tier visual cascade now matches the four-tier semantic cascade introduced in v0.8.0.
- WebAuthn-packed and TPM 2.0 envelopes that were silently rejected as `format_unsupported` in v0.8.0 now produce real verifications (and real, format-specific failure reasons when they fail).

## Breaking changes

None. All v0.9.0 changes are additive over the v0.8.0 contract.

## Rollback

- npm: `v0.8.0` remains available; consumers can pin with `npm install neotoma@0.8.0`. Rolling back returns the WebAuthn-packed and TPM 2.0 stubs (envelopes resolve to `software` tier with `failure_reason: "format_unsupported"`); Apple Secure Enclave envelopes continue to verify.
- Inspector: rolls back cleanly with the package downgrade.

## Follow-up work

- v0.10.0 will ship FU-4 (Linux TPM 2.0 CLI) and FU-5 (Windows TBS CLI), both hard-blocked on the FU-3 server-side verifier delivered in this release.
- v0.10.x will ship FU-6 (YubiKey CLI), hard-blocked on the FU-2 WebAuthn-packed verifier delivered in this release.
- v0.11.0 will ship FU-7 (attestation revocation) in `log_only` mode; v0.12.0 flips it to `enforce`.

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full follow-up roadmap.
