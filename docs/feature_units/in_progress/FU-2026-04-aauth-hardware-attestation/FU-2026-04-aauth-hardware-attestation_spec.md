---
title: "Feature Unit: FU-2026-04-aauth-hardware-attestation — AAuth Tier Honesty + Hardware Attestation"
summary: "**Status:** In Progress **Priority:** P0 (release blocker for v0.8.0 attribution honesty) **Risk Level:** Medium (write-path attribution semantics, breaking change for self-claimed `hardware` agents) **Target Release:** v0.8.0 **Owner:**..."
---

# Feature Unit: FU-2026-04-aauth-hardware-attestation — AAuth Tier Honesty + Hardware Attestation

**Status:** In Progress
**Priority:** P0 (release blocker for v0.8.0 attribution honesty)
**Risk Level:** Medium (write-path attribution semantics, breaking change for self-claimed `hardware` agents)
**Target Release:** v0.8.0
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Replace the current algorithm-only `hardware` heuristic in AAuth with a four-tier resolution cascade
(`anonymous` < `unverified_client` < `software` < `operator_attested` < `hardware`), introduce a JSON-native
`cnf.attestation` envelope that carries cryptographic key-attestation statements, and ship a CLI-side
attestation generator for macOS Secure Enclave so that the `hardware` tier is reserved for keys whose
binding to a hardware element is cryptographically proven and rooted at a trusted attestation CA.

**User Value:**
- Operators of `/mcp` and `/sandbox/*` deployments get a tier that actually means what it claims.
  `hardware` requires a verifiable attestation chain; `software` reflects a verified signature with
  no attestation; `operator_attested` is reserved for issuer/sub allowlists the operator explicitly
  vouched for; `unverified_client` covers self-reported `clientInfo`; `anonymous` is the fallback.
- Agents (Cursor, Claude Code, Codex, custom CLIs) get a documented JSON envelope to attach attestations
  and a Neotoma-supplied path (CLI + N-API helper) to produce real Apple Secure Enclave attestations on
  macOS without external tooling.
- The Inspector, audit trails, and `eligible_for_trusted_writes` decisions stop reporting `hardware`
  for software-only ES256/EdDSA keys, removing a long-standing trust honesty bug.

**Technical Approach (high level):**
- Extend `AttributionTier` with `operator_attested`; update `TIER_RANK` so the existing
  `default_deny` capability admission gate continues to apply (`software` and above remain trusted-write
  eligible by default; operators can tighten via capability registry).
- Replace the `aauth_verify` middleware tier-resolution branch with an explicit cascade:
  verified `cnf.attestation` → `hardware`; verified signature + allowlist match (`iss` or `iss:sub`)
  → `operator_attested`; verified signature only → `software`.
- Introduce a JSON-native `cnf.attestation` envelope with a `format` discriminator
  (`apple-anonymous-attestation`, future: `webauthn-packed`, `tpm2-quote`), a `statement` payload, an
  agent-supplied `challenge` (the JWT JTI / `cnf.jwk` thumbprint), and a key-binding reference.
- Implement an Apple Secure Enclave verifier (`aauth_attestation_apple_se.ts`) that validates the
  chain to the bundled Apple Attestation Root via `node:crypto.X509Certificate`, parses the leaf's
  attestation extension, and verifies the P-256 key-binding signature.
- Stub `webauthn-packed` and `tpm2-quote` verifiers (`{ verified: false, reason: "not_implemented" }`)
  so the dispatcher remains exhaustive without blocking the release.
- Add `aauth_attestation_trust_config.ts` to load `NEOTOMA_AAUTH_ATTESTATION_CA_PATH` and
  `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH` and merge in the bundled Apple Attestation Root.
- Add `aauth_operator_allowlist.ts` to read `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` /
  `NEOTOMA_OPERATOR_ATTESTED_SUBS` and decide if a verified signer should be promoted to
  `operator_attested`.
- Ship an optional native package (`packages/aauth-mac-se/`) that uses `node-addon-api` + `cmake-js` +
  `prebuildify` to wrap `SecKeyCreateRandomKey(kSecAttrTokenIDSecureEnclave)` and
  `SecKeyCreateAttestation` from Apple's `Security.framework`. CLI integration: `neotoma auth keygen
  --hardware`, `neotoma auth attest`, and automatic `cnf.attestation` embedding when an SE-backed key
  is present.
- Document the new tier ladder, envelope shape, and operator/agent UX in
  `docs/subsystems/aauth_attestation.md`, `docs/subsystems/aauth_cli_attestation.md`, and the rewritten
  `docs/subsystems/agent_attribution_integration.md`.

## Requirements

### Functional Requirements

1. **Tier semantics (server, all transports):**
   - `anonymous`: no signature, generic `clientInfo`, normalised forbidden values.
   - `unverified_client`: self-reported `clientInfo` only.
   - `software`: AAuth signature verifies cleanly against `cnf.jwk`; no attestation, no allowlist match.
   - `operator_attested`: verified signature **and** (`iss` or `iss:sub`) appears in operator allowlist.
   - `hardware`: verified signature **and** verified `cnf.attestation` whose key-binding signature is
     produced by the same key embedded in `cnf.jwk` and whose chain roots at a trusted attestation CA.
2. **`cnf.attestation` envelope:** JSON object with required fields `format` (string discriminator),
   `statement` (format-specific payload), `challenge` (string the agent embeds in the attestation
   ceremony, MUST equal the JWT JTI or `cnf.jwk` thumbprint), and `key_binding`
   (`{ alg, public_key_jwk_thumbprint }`). Verifier MUST refuse the statement if the challenge does not
   match the JWT, if the key binding does not match `cnf.jwk`, or if the chain does not root at a
   trusted CA.
3. **Operator-attested allowlist:** Comma-separated env vars
   `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` (issuer match) and `NEOTOMA_OPERATOR_ATTESTED_SUBS`
   (`<iss>:<sub>` exact match). Empty values disable the tier; the cascade then falls through to
   `software`.
4. **Trust configuration:** `NEOTOMA_AAUTH_ATTESTATION_CA_PATH` (PEM bundle) and
   `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH` (JSON array of approved AAGUIDs / Apple key model strings).
   Bundled defaults include the Apple Attestation Root CA.
5. **CLI attestation generation (macOS):** `neotoma auth keygen --hardware` creates an SE-backed P-256
   key. `neotoma auth attest` produces a fresh attestation against a server-supplied or locally generated
   challenge. The signer automatically embeds `cnf.attestation` in the JWT when the active key is
   SE-backed; otherwise the existing software path remains.
6. **`get_session_identity` / `/session`:** Continue to return `attribution.tier`, but now expose
   `attribution.decision` with the cascade reason (`attestation_verified`, `operator_allowlist_match`,
   `signature_verified`, `client_info`, `none`). `eligible_for_trusted_writes` continues to be a
   top-level field and reflects `tier >= software`.

### Non-Functional Requirements

1. **Determinism:** Tier decision is a pure function of (signature verification result, attestation
   verification result, operator allowlist, `clientInfo`). No `Date.now()` outside expiry checks; no
   randomness in the resolution path.
2. **Privacy:** No PII in logs. Attribution decisions log only thumbprints, issuer/sub pairs, and
   tier/reason. Attestation statements are stored hashed (or omitted) in audit rows.
3. **Performance:** Attestation verification only runs when `cnf.attestation` is present; verifier
   caches parsed CA bundles and AAGUID lists per process.
4. **Backward compatibility:** Existing `software`-tier signers continue to work unchanged. Existing
   self-claimed `hardware` agents drop to `software` until they upgrade to attestation; this is the
   intended breaking change and is called out in the v0.8.0 release supplement.

### Invariants

**MUST:**
- The middleware MUST NOT promote a signer to `hardware` based on key algorithm alone.
- The verifier MUST refuse statements whose challenge or key-binding mismatch the JWT.
- The dispatcher MUST be exhaustive over the `format` discriminator (unknown format → `software`).
- The bundled Apple Attestation Root MUST always be one of the trusted roots when no override is set.
- The CLI MUST gracefully fall back to software signing on non-darwin platforms.

**MUST NOT:**
- MUST NOT log raw `cnf.attestation.statement` bytes in `info`/`debug` traces.
- MUST NOT extend the algorithm-only `hardware` heuristic.
- MUST NOT silently downgrade an attestation that fails for unexpected reasons; failures surface in
  `attribution.decision.reason` with a non-`attestation_verified` value.
- MUST NOT require the optional native package on platforms that cannot build/install it.

## Affected Subsystems

**Primary:**
- **AAuth middleware** (`src/middleware/aauth_verify.ts`)
- **Attribution policy** (`src/services/attribution_policy.ts`, `src/services/agent_capabilities.ts`,
  `src/services/agents_directory.ts`)
- **Crypto / agent identity** (`src/crypto/agent_identity.ts`, `inspector/src/types/api.ts`,
  `openapi.yaml`)
- **AAuth attestation services** (new: `src/services/aauth_attestation_*`,
  `src/services/aauth_operator_allowlist.ts`)
- **CLI signer** (`src/cli/aauth_signer.ts`, new `packages/aauth-mac-se/`)

**Documentation:**
- `docs/subsystems/aauth_attestation.md` (new)
- `docs/subsystems/aauth_cli_attestation.md` (new)
- `docs/subsystems/agent_attribution_integration.md` (rewrite)
- `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md` (parity-anchored)
- `docs/releases/in_progress/v0.8.0/github_release_supplement.md` (rewrite)
- `docs/developer/mcp_chatgpt_setup.md`, `AGENTS.md` (Cursor MCP-reload note)

**Dependencies:**
- Requires AAuth middleware + agent attribution integration (already in main).
- Blocks v0.8.0 release until attestation verifier and tier cascade are landed and tested.

## Spec → Mental-model Alignment

This FU encodes three orthogonal fixes that surfaced together while debugging the sandbox sign-in flow:
- **Tier honesty** — the bug where ES256/EdDSA software keys were attributed `hardware` because the
  middleware only inspected the signing algorithm.
- **`eligible_for_trusted_writes` JSON path** — agents (and the assistant) misread the field as nested
  under `attribution.*`; documentation is updated and tests pin the top-level location.
- **Cursor MCP-reload friction** — adding a server to `.cursor/mcp.json` does not hot-reload
  `CallMcpTool`; documented as a setup-time step.

These three fixes collapse into one Feature Unit because they all touch the same first-impression of
`get_session_identity` and the resulting tier displayed in the Inspector.

## Out of Scope

- Real-hardware verifiers for WebAuthn-packed and TPM2 quote formats (stubs only; tracked as future FUs).
- N-API bindings for Windows TPM 2.0 / Linux TPM 2.0 / Android Key Attestation (future FUs).
- Automatic key rotation or revocation of operator-allowlisted issuers (operators manage env vars).
- Inspector UI changes beyond the new `operator_attested` tier label and the existing Agent column.

## Acceptance Criteria

1. `aauth_verify` middleware resolves tiers via the documented cascade and is covered by unit + integration
   tests for each tier transition (including unknown attestation formats).
2. `aauth_attestation_apple_se.ts` validates a fixture-generated SE attestation chain end-to-end and
   refuses tampered fixtures (bad chain, bad signature, mismatched challenge, mismatched key binding).
3. `packages/aauth-mac-se/` builds via `cmake-js`, ships darwin-arm64/x64 prebuilds via `prebuildify`,
   and exposes `keygen()` / `attest()` to the CLI on darwin; CLI signs as `software` on non-darwin.
4. `neotoma auth keygen --hardware`, `neotoma auth attest`, and the embedded `cnf.attestation` flow are
   documented in `docs/subsystems/aauth_cli_attestation.md` and verified via a darwin-only smoke test.
5. The four-tier ladder, the `cnf.attestation` envelope, and the trust-config env vars are documented in
   `docs/subsystems/aauth_attestation.md`, `docs/subsystems/agent_attribution_integration.md`, the
   parity-anchored MCP/CLI agent instructions, and the v0.8.0 release supplement.
6. Existing tier assertions across the test catalog (~27 sites in 11 files) are updated to the new
   semantics and pass on CI.
