---
title: Github Release Supplement
summary: "v0.8.0 makes attribution tiers honest, ships hardware attestation end-to-end on macOS, Linux, Windows, and YubiKey, replaces the env-driven agent capability registry with a managed `agent_grant` entity type, promotes AAuth from a Sandbox..."
---

v0.8.0 makes attribution tiers honest, ships hardware attestation end-to-end on macOS, Linux, Windows, and YubiKey, replaces the env-driven agent capability registry with a managed `agent_grant` entity type, promotes AAuth from a Sandbox-only auth path to a first-class auth method on every deployment, and gives the Inspector a real surface for the new attestation and admission diagnostics. This release consolidates work originally planned for v0.8.0 through v0.12.0 — the four-tier cascade, three real attestation verifiers (Apple Secure Enclave, WebAuthn-packed, TPM 2.0), four CLI hardware backends (Apple SE, libtss2, Windows TBS+CNG, YubiKey via libykcs11), attestation revocation lookup in `enforce` mode by default — into one cut.

## Highlights

- **`hardware` tier now means hardware, on every supported platform.** Algorithm-only promotion is gone. The `hardware` tier requires a verified `cnf.attestation` envelope cryptographically bound to the signing key, and the CLI can now mint that envelope on macOS (Secure Enclave), Linux (TPM 2.0 via libtss2), Windows (TBS + CNG), and YubiKey 5 / 5C / Bio (libykcs11) — three attestation formats (`apple-secure-enclave`, `webauthn-packed`, `tpm2`), one consistent server-side verification contract.
- **Per-agent capability scoping is now data, not env.** The `NEOTOMA_AGENT_CAPABILITIES_*` env vars and the committed `config/agent_capabilities.default.json` registry are removed in favour of `agent_grant` entities managed in the Inspector under "Agents → Agent grants" or via standard MCP / REST entity-store calls. A new `neotoma agents grants import --owner-user-id <usr_…>` command migrates legacy registries idempotently. Setting any of the removed env vars now causes startup to fail with a structured error pointing at the upgrade command.
- **New `operator_attested` tier between `software` and `hardware`.** Verified-AAuth callers whose `iss`, `sub`, or `iss::sub` pair appears on the operator allowlist are surfaced as `operator_attested` (rank 3). Configured via `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` and `NEOTOMA_OPERATOR_ATTESTED_SUBS`. Trusted-operator agents are now distinguishable from generic software agents without overstating cryptographic guarantees.
- **Attestation revocation enforced by default.** Apple's anonymous-attestation revocation endpoint, OCSP for `webauthn-packed` leaves, and OCSP / CRL for `tpm2` AIK chains now demote revoked agents from `hardware` (or `operator_attested`) to `software` with `failure_reason: "revoked"`. Operators that need an audit window can opt in to `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` or `disabled`. Fail-open on responder outage is the default.
- **Inspector rewritten around the four-tier cascade.** The new `/inspector/*` and `/aauth/*` route sets render the attestation envelope chain, AAGUID admission, revocation status, operator allowlist source, and per-agent grant lifecycle inline — the prior tier-badge-only presentation is replaced with a tier badge whose tooltip and detail panel name exactly why a tier resolved the way it did.
- **AAuth is now a first-class auth path beyond Sandbox.** In v0.7.1, AAuth-verified writes only resolved to a real `user_id` inside `isSandboxMode()` (via `ensureSandboxAauthUser`), and the only AAuth-required write route (`/sandbox/aauth-only/store`) was sandbox-only. Outside Sandbox, AAuth was attribution-decoration on top of Bearer/OAuth/Ed25519. v0.8.0 promotes the AAuth → `agent_grant` admission path to a first-class auth method on every deployment: a verified AAuth signature whose identity (`thumbprint` > `(sub, iss)` > `sub`) matches an active grant resolves to that grant's owner user_id and reaches the same write surface as a Bearer token (`/store`, `/observations/create`, `/create_relationship`, `/correct`, MCP, …) — no Bearer required. The same hardware attestation, four-tier cascade, operator allowlist, and revocation enforcement that previously decorated tiers in Sandbox now gate writes on production deployments through the `assertCanWriteProtected` guard. Sandbox-mode partitioning continues unchanged for anonymous callers; the admission path coexists with it.

## Ship constraints

- Attribution tiers are resolved by an explicit cascade in `src/middleware/aauth_verify.ts`. Algorithm choice no longer influences the tier — only verified attestation, operator allowlist match, and signature validity.
- One additive schema change: a new `agent_grant` entity type is registered in `src/services/schema_definitions.ts`. No table migration is required (the entity is stored in the existing entity / observation infrastructure). The legacy `attribution_tier` column accepts the new `operator_attested` value; existing rows are not rewritten.
- Hardware attestation native bindings ship as `optionalDependencies`: `@neotoma/aauth-mac-se` (darwin), `@neotoma/aauth-tpm2` (Linux + libtss2), `@neotoma/aauth-win-tbs` (Windows + TBS), `@neotoma/aauth-yubikey` (cross-platform + libykcs11). Hosts without the matching toolchain or hardware fall back to the software signer with no behavioural change beyond the tier rename.
- Bundled trust roots are committed at `config/aauth/`: `apple_attestation_root.pem` (Apple App Attestation Root CA) and `tpm_attestation_roots/` (Infineon, STMicro, Intel, AMD bundles, each with sourcing notes and SHA-256 fingerprints). Operators can supplement or replace either set via `NEOTOMA_AAUTH_ATTESTATION_CA_PATH`.
- Revocation is `enforce` by default. Operators that want to audit before flipping should set `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` ahead of upgrading, observe `attribution_decision` log lines for `revocation.status: "revoked"` with `revocation.demoted: false`, and only then drop the override.
- The `NEOTOMA_AGENT_CAPABILITIES_*` env vars and `config/agent_capabilities.default.json` are removed. Setting any of those variables causes startup to fail with a structured error. There is no in-place compatibility shim — operators MUST run `neotoma agents grants import --owner-user-id <usr_…>` before upgrading.

## What changed for npm package users

### Attribution tiers and the four-tier cascade

- `src/crypto/agent_identity.ts` adds `"operator_attested"` to `AttributionTier`; `algorithmLooksHardwareBacked` is deprecated and no longer participates in tier derivation. New `AttestationRevocationDiagnosticsField` carries the revocation sub-object inside the decision diagnostics shape.
- `src/services/attribution_policy.ts` adds `operator_attested` to `parseMinTier` and `TIER_RANK` (rank 3, between `software` and `hardware`).
- `src/services/agent_capabilities.ts` extends `default_deny` to `operator_attested` for parity with `software`. The legacy env-driven registry loader is removed; the file now exposes the runtime contract used by the new admission path (see below).
- `src/services/agents_directory.ts` and `src/services/recent_record_activity.ts` recognize `operator_attested` in their `KNOWN_TIERS` lists.
- `src/services/session_info.ts` ranks `operator_attested` as 3 and `hardware` as 4 and threads the revocation field through the `/session` response.
- `src/services/feedback/admin_proxy.ts` recognizes `operator_attested` in its tier checks.
- `src/middleware/aauth_verify.ts` walks the new resolution cascade (attestation → operator allowlist → signature → clientInfo → anonymous) and populates the extended `attribution.decision` diagnostics. `attestationOutcomeForDiagnostics` maps verifier output (including the new `revocation` field) into the request-scoped `AttributionDecisionDiagnostics`.

### Attestation services

- New: `src/services/aauth_attestation_verifier.ts` — format-dispatching entry point. Defines `AttestationFormat`, `AttestationFailureReason` (including `"revoked"`), `AttestationOutcome` (including the optional `revocation` field), `AttestationEnvelope`, and `AttestationContext`. New `applyRevocationPolicy()` helper centralises how revocation results affect tier resolution per `RevocationMode` and `failOpen` setting.
- New: `src/services/aauth_attestation_apple_se.ts` — verifies Apple App Attestation chains against the bundled Apple App Attestation Root CA, derives the challenge from `iat` + `cnf.jwk` thumbprint, and binds the leaf's authenticated public key to the JWT's `cnf.jwk` thumbprint.
- New: `src/services/aauth_attestation_webauthn_packed.ts` — verifies the W3C WebAuthn §8.2 packed-format statement. Parses `alg` / `sig` / `x5c` / optional AAGUID-from-cert-extension (OID `1.3.6.1.4.1.45724.1.1.4`), walks the chain to a trusted root, verifies the signature over the canonical attestation data, and binds the leaf credential public key to `cnf.jwk` via RFC 7638 thumbprint. AAGUID admission honours `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`.
- New: `src/services/aauth_attestation_tpm2.ts` — parses the WebAuthn `tpm` statement (`ver`, `alg`, `x5c`, `sig`, `certInfo`, `pubArea`), walks the AIK chain to a trusted TPM CA root, verifies the signature over `certInfo`, and binds `pubArea`'s public key to `cnf.jwk` via RFC 7638 thumbprint.
- New: `src/services/aauth_tpm_structures.ts` — internal `parseTpmsAttest()` and `parseTpmtPublic()` helpers written by hand against the TCG spec; no external TPM library dependency.
- New: `src/services/aauth_attestation_trust_config.ts` — loads and caches the Apple root, the bundled TPM CA roots, and any operator-supplied PEM bundle from `NEOTOMA_AAUTH_ATTESTATION_CA_PATH`; loads the optional AAGUID trust list from `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`.
- New: `src/services/aauth_operator_allowlist.ts` — implements the `operator_attested` lookup against `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` and `NEOTOMA_OPERATOR_ATTESTED_SUBS`.
- New: `src/services/aauth_attestation_revocation.ts` — defines `RevocationMode`, `RevocationStatus`, `RevocationSource`, `RevocationOutcome`, `RevocationCheckContext`, and `RevocationFetcher`. Implements `checkRevocation()` (entry point), `checkAppleRevocation()` (Apple endpoint), and `checkOcspWithCrlFallback()` with hand-written DER builders / parsers (no external OCSP library dependency). 24-hour LRU cache keyed by certificate fingerprint; per-lookup network timeout; fail-open by default. `readRevocationMode()` defaults to `"enforce"` when the env var is unset.
- New: `config/aauth/apple_attestation_root.pem` — bundled Apple App Attestation Root CA.
- New: `config/aauth/tpm_attestation_roots/` — bundled TPM CA roots (Infineon, STMicro, Intel, AMD), each with sourcing notes and SHA-256 fingerprint.

### Agent grants and AAuth admission

- New: `src/services/agent_grants.ts` — domain layer over the `agent_grant` entity type. CRUD helpers, validation, and an in-memory cache for identity → grant lookups. Status transitions (`active` → `suspended` ↔ `active` → `revoked`) are written as ordinary observations so the observation history doubles as an audit log. Identity rules: thumbprint pin wins (a rotated JWT issuer cannot quietly replace the grant); otherwise a `(sub, iss)` composite; otherwise `sub` alone.
- New: `src/services/aauth_admission.ts` — maps a verified AAuth identity to a Neotoma `agent_grant` and returns an admission decision for downstream middleware. Records `last_used_at` observations for grants. Surfaces an `AAuthAdmissionContext` that the request context propagates to write-side guards.
- New: `src/services/protected_entity_types.ts` — write-side guard for governance-state entity types (today: `agent_grant`). Enforces rules based on AAuth admission context and agent capabilities so an admitted agent cannot mutate the very grants that admit it without explicit grant scope. Exposes `assertCanWriteProtected()` and `assertCanWriteProtectedBatch()`.
- New: `src/middleware/aauth_admission.ts` — HTTP middleware that runs after `aauth_verify`, resolves the verified identity to a grant via `aauth_admission`, and writes the result onto the request context.
- New: `src/cli/agents_grants_import.ts` — implementation of the `neotoma agents grants import` command. Reads `NEOTOMA_AGENT_CAPABILITIES_JSON`, `NEOTOMA_AGENT_CAPABILITIES_FILE`, or `config/agent_capabilities.default.json` and writes the equivalent `agent_grant` entities. Idempotent on `(match_sub, match_iss, match_thumbprint)`.
- New: registered `agent_grant` entity in `src/services/schema_definitions.ts` with `canonical_name_fields` ordered thumbprint > `(sub, iss)` > `sub`, last-write-wins reducer policies for all mutable fields, and `name_collision_policy: "merge"` so re-imports upsert.
- `src/services/observation_storage.ts` and `src/services/correction.ts` now route every `createObservation` and `createCorrection` call through `assertCanWriteProtected({ entity_type, op, identity, admission })`. Out-of-scope writes return a structured 403 with `code: "protected_entity_write_denied"`.
- `src/services/request_context.ts` extends `RequestContext` with `aauthAdmission?: AAuthAdmissionContext | null` and exports `getCurrentAAuthAdmission()`. Absent on requests that did not pass through admission (unsigned local stdio, public discovery routes).
- `src/actions.ts` registers admission middleware on every authenticated write route and adds the `/agents/grants*` REST surface (see API section).
- `src/server.ts` is wired to the admission middleware and the new admission failure mappers.

### CLI signer and four hardware backends

- `src/cli/aauth_signer.ts`:
  - `SignerBackend` extended from `"software"` to `"software" | "apple-secure-enclave" | "tpm2" | "windows-tbs" | "yubikey"`.
  - `generateAndStoreKeypair({ hardware: true })` dispatches to the platform-appropriate backend (`darwin` → `aauth-mac-se`, Linux → `aauth-tpm2`, Windows → `aauth-win-tbs`; `--backend yubikey` overrides on any platform that has libykcs11). Falls back to the software signer with a clear "no hardware backend available" message when no backend is reachable.
  - `mintCliAgentTokenJwt` manually constructs and signs JWTs for hardware backends (DER ECDSA → JOSE r||s); software backend continues via `jose.SignJWT`.
  - `buildAttestationEnvelope` returns the platform-appropriate envelope: `apple-secure-enclave` on macOS, `tpm` (WebAuthn) on Linux and Windows, `webauthn-packed` on YubiKey. Challenge derivation (`iat` + `cnf.jwk` thumbprint) is identical across backends.
  - `cliSignedFetch` / `seSignedFetch` perform RFC 9421 HTTP message signatures for hardware-backed keys, inlining the necessary signature-base / header construction logic from `@hellocoop/httpsig` (and dispatching the DER → JOSE step through the active backend).
  - `describeConfiguredSigner` returns `backend`, `se_key_tag` / `tpm2_handle_persistent_path` / `cng_key_name` / `yubikey_serial` (whichever applies), `hardware_supported`, and `hardware_supported_reason`. `neotoma auth session` surfaces this in both JSON and text output. `hardware_supported_reason` no longer hard-codes "darwin only" on Linux and Windows.
- New optional dependencies (each lives under `packages/<name>/`):
  - `@neotoma/aauth-mac-se` — darwin-only; N-API binding over `Security.framework`. Exposes `isSupported`, `generateKey`, `sign`, `attest`.
  - `@neotoma/aauth-tpm2` — Linux-only; N-API binding to libtss2. Same surface. Build inputs: libtss2-dev, node-gyp, C++17.
  - `@neotoma/aauth-win-tbs` — Windows-only; N-API binding to TBS + CNG. Same surface. Build inputs: Windows SDK, node-gyp, MSVC.
  - `@neotoma/aauth-yubikey` — cross-platform; N-API binding to libykcs11 plus the YubiKey PIV `YKPIV_INS_ATTEST` instruction. Same surface. Build inputs: libykcs11 (Yubico), node-gyp, C++17. Picks the YubiKey via PKCS#11 slot enumeration; tracks the active key by `yubikey_serial` so a host can ship multiple YubiKey-backed signers.
- New ambient module declarations: `src/types/aauth-mac-se.d.ts`, `src/types/aauth-tpm2.d.ts`, `src/types/aauth-win-tbs.d.ts`, `src/types/aauth-yubikey.d.ts`. The CLI dynamically imports each optional dep without a hard build-time dependency.

### CLI surface

- New: `neotoma agents grants import --owner-user-id <usr_…> [--file path/to/agent_capabilities.json]`. Migrates legacy `NEOTOMA_AGENT_CAPABILITIES_JSON` / `NEOTOMA_AGENT_CAPABILITIES_FILE` / `config/agent_capabilities.default.json` registries into `agent_grant` entities owned by the supplied user. Idempotent on `(match_sub, match_iss, match_thumbprint)`. JSON-mode and human-readable summaries supported.
- `neotoma auth keygen --hardware` works on macOS, Linux (with libtss2 + a TPM 2.0 device), and Windows (with TBS service running and a TPM). `--backend yubikey` is supported on any platform with libykcs11 and an inserted YubiKey.
- `neotoma auth session` reports honest `hardware_supported` / `hardware_supported_reason` per platform and surfaces `yubikey_serial` when the active signer is YubiKey-backed.
- New CLI subcommands `neotoma aauth tbs-attestation`, `neotoma aauth tpm2-attestation`, `neotoma aauth yubikey-attestation` (under `src/cli/aauth_*_attestation.ts`) print the envelope each backend would mint for a given challenge — useful for diagnosing trust-config rejections without re-running the full auth flow.

### Inspector and root site

- `frontend/src/components/MainApp.tsx`, `Layout.tsx`, and `DetailPage.tsx` are updated to mount the new route sets.
- New `/aauth/*` pages: `AauthReferencePage`, `AauthSpecPage`, `AauthAttestationPage`, `AauthCliKeysPage`, `AauthIntegrationPage`, `AauthCapabilitiesPage`. Together they document the four-tier cascade, the attestation envelope shape, the keygen / attest CLI flows, the integration contract for downstream agents, and the per-agent capability scoping model.
- New `/inspector/*` pages: `InspectorReferencePage`, `InspectorDashboardPage`, `InspectorEntitiesPage`, `InspectorObservationsAndSourcesPage`, `InspectorRelationshipsAndGraphPage`, `InspectorSchemasPage`, `InspectorTimelinePage`, `InspectorConversationsPage`, `InspectorAgentsPage`, `InspectorSearchPage`, `InspectorSettingsPage`, `InspectorSettingsConnectionPage`, `InspectorSettingsAttributionPolicyPage`, `InspectorSettingsRetentionPage`, `InspectorSettingsFeedbackPage`. New `InspectorPreview` component replaces the prior single-page Inspector demo.
- New `PrimitiveRecordTypePage` exposes the canonical record-type primitives (entity, entity snapshot, observation, interpretation, relationship, source, timeline event) at `/primitives` with cross-links to their subsystem docs.
- The agent-detail badge tooltip and a new `AttestationEnvelopePanel` render envelope-aware fields (`format`, AAGUID truncated, `key_binding_matches_cnf_jwk`, chain summary by CN + issuer, `revocation` status with source). `tierIcon()` covers all four tiers; `operator_attested` no longer falls through to the default glyph.
- `frontend/src/site/site_data.ts`, `seo_metadata.ts`, `repo_info.json`, and `doc_icons.tsx` are updated for the new navigation, SEO entries, and icon set. `frontend/src/index.css` and `tsconfig.json` are touched for the new route layouts.

## API surface & contracts

### Agent grants (new)

`openapi.yaml` adds the following routes under `/agents/grants`:

- `GET /agents/grants` — `listAgentGrants`. List grants for the authenticated user.
- `POST /agents/grants` — `createAgentGrant`. Create a grant.
- `GET /agents/grants/{id}` — `getAgentGrant`. Read a single grant.
- `PATCH /agents/grants/{id}` — `updateAgentGrant`. Update editable fields (label, capabilities, notes, match fields).
- `POST /agents/grants/{id}/suspend` — `suspendAgentGrant`. Move `active` → `suspended`.
- `POST /agents/grants/{id}/revoke` — `revokeAgentGrant`. Move `active` or `suspended` → `revoked`. Terminal.
- `POST /agents/grants/{id}/restore` — `restoreAgentGrant`. Move `suspended` → `active`. Cannot restore a revoked grant.

Status transitions are written as observations on the underlying `agent_grant` entity; the observation history is the audit log.

### Attribution decision shape

`attribution.decision` (returned on `/session` and present in the `attribution_decision` log line) gains:

- `attestation`: `{ envelope_present, format, outcome, failure_reason, key_binding_matches_cnf_jwk, revocation? }`. The `revocation` sub-object is omitted (not `null`) when `NEOTOMA_AAUTH_REVOCATION_MODE=disabled`, so operators can distinguish "we never checked" from "we checked and got `good`". When present, its shape is `{ checked: boolean, status: "good" | "revoked" | "unknown", source: "apple" | "ocsp" | "crl" | null, mode: "disabled" | "log_only" | "enforce", demoted: boolean }`.
- `operator_allowlist_source`: `null` | `"issuer_match"` | `"sub_match"` | `"issuer_and_sub_match"`.

`AttestationFailureReason` enum gains `"revoked"`, `"chain_invalid"`, `"signature_invalid"`, `"aaguid_not_trusted"`, `"pubarea_mismatch"`, and `"key_binding_mismatch"` as additive members alongside the v0.7.x set. Consumers that switch on `failure_reason` should expect new strings; the field type remains `string | null`.

`openapi.yaml` `AttributionDecision.attestation.revocation` is registered as an optional sub-schema. `npm run -s openapi:bc-diff -- --base v0.7.1` reports an additive change on `AttributionDecision`, additive routes under `/agents/grants*`, and no breaking changes to existing routes.

### Resource metadata

- `GET /.well-known/aauth-resource-metadata.json` returns a dereferenceable `jwks_uri`:

  ```json
  {
    "issuer": "https://<authority>",
    "client_name": "Neotoma",
    "signature_window": 60,
    "supported_algs": ["ES256", "EdDSA"],
    "supported_typ": ["aa-agent+jwt"],
    "jwks_uri": "https://<authority>/.well-known/jwks.json"
  }
  ```

- New global route: `GET /.well-known/jwks.json` → `{ "keys": [] }`. Neotoma remains verifier-only.

### Sandbox AAuth

- Sandbox AAuth identity partitions by stable agent token identity (`agent_iss + agent_sub`) instead of the ephemeral signing-key thumbprint. Two signed requests with the same `agent_iss + agent_sub` resolve to the same sandbox `user_id` even when their ephemeral key thumbprints differ. Existing thumbprint-derived rows from v0.7.1 are inert and not migrated.

## Behavior changes

- Pre-v0.8.0 ES256 / EdDSA-signed agents that previously rendered as `hardware` now render as `software` unless they ship a verified `cnf.attestation` envelope OR are placed on the operator allowlist (in which case they render as `operator_attested`).
- `NEOTOMA_MIN_ATTRIBUTION_TIER=hardware` is now strictly stricter than in v0.7.x — pre-attestation agents that previously satisfied this gate will be rejected with `ATTRIBUTION_REQUIRED` until they upgrade. Operators rolling forward should consider `min_tier=operator_attested` (admits the operator allowlist + hardware) or `min_tier=software` during the migration window.
- Revoked attestation keys demote from `hardware` (or `operator_attested`) to `software` with `failure_reason: "revoked"` by default. `attribution.decision.attestation.revocation.demoted` is `true` for the affected requests. Operators that need a soak window can set `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` ahead of upgrading.
- `NEOTOMA_AGENT_CAPABILITIES_*` env vars (or the legacy `config/agent_capabilities.default.json` registry) on a v0.8.0 process cause startup to fail with a structured error message pointing at `neotoma agents grants import`. Re-runs of the import are idempotent on `(match_sub, match_iss, match_thumbprint)`.
- Verification latency on `log_only` and `enforce` modes increases by one network round-trip on cache miss for the first request against a given attestation leaf; cache hits add ~microseconds. The 5-second timeout caps the worst case.
- `attribution_decision` log lines and a new `attestation_revocation_check status=<…> source=<…> source_url=<…> elapsed_ms=<n>` log line appear for every revocation lookup that hits the network. Cache hits are not logged. A rate-limited `attestation_demoted reason=revoked source=<…> agent_iss=<…> agent_sub=<…>` line is emitted per-fingerprint when revocation actually demotes a request under `enforce`.
- Sandbox AAuth callers now resolve to a stable `user_id` across ephemeral signing-key rotation; existing thumbprint-derived sandbox rows from v0.7.1 are inert.
- Inspector users see attestation diagnostics, AAGUID admission, and revocation status inline on every signed agent. The prior tier-badge-only presentation is gone.
- AAuth admission is a valid auth path on non-Sandbox deployments. The auth chain in `src/actions.ts` now accepts a verified AAuth signature whose identity matches an active `agent_grant` and resolves the request to that grant's owner `user_id` even when no Bearer header is present; missing-Bearer responses include a hint pointing at Inspector → Agents → Grants. In v0.7.x, the same request would have been rejected with `AUTH_REQUIRED` outside Sandbox.

## Agent-facing instruction changes (ship to every client)

- `docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md` are rewritten under the four-tier cascade. The `Preferred — AAuth` clauses describe four tiers and `cnf.attestation`. The MCP `Preflight your session` rule documents the extended `attribution.decision` shape including `attestation` (with `revocation`) and `operator_allowlist_source`. Setup docs flag that adding a new MCP server entry to `.cursor/mcp.json` requires reloading Cursor before its in-app MCP tools (including `CallMcpTool`) pick up the new server.
- `AGENTS.md` cross-references the Cursor MCP-reload note and the new attribution / admission contract so every Codex-style consumer picks up the same instructions.

## Docs site & CI / tooling

- New canonical primitive-record-type docs:
  - `docs/subsystems/entities.md`
  - `docs/subsystems/entity_snapshots.md`
  - `docs/subsystems/interpretations.md`
  - `docs/subsystems/timeline_events.md`
- `docs/foundation/timeline_events.md` is annotated as the doctrinal counterpart to the new architectural reference and gains a "Related Documents" section pointing at the subsystem docs and the determinism doctrine.
- New AAuth subsystem docs: `docs/subsystems/aauth.md`, `docs/subsystems/aauth_attestation.md` (envelope + verifier dispatch + revocation policy semantics + caching + `enforce` migration plan), `docs/subsystems/aauth_cli_attestation.md` (Apple SE, Linux TPM 2.0, Windows TBS, YubiKey keygen flows; `signer.json` schema; per-platform troubleshooting; YubiKey PIV slot / PIN-cached vs PIN-always interactions).
- New integration guides: `docs/integrations/aauth_tbs_windows.md`, `docs/integrations/aauth_tpm2_linux.md`, `docs/integrations/aauth_yubikey.md`.
- Rewritten: `docs/subsystems/agent_attribution_integration.md` — four-tier cascade, extended `/session` shape, new env vars, expanded diagnostics checklist, updated CLI signer section. Now also documents the per-agent capability scoping lifecycle through `agent_grant` entities and the admission contract.
- Updated for the new primitives: `docs/subsystems/agent_capabilities.md`, `docs/subsystems/observation_architecture.md`, `docs/subsystems/relationships.md`, `docs/subsystems/sources.md`, `docs/subsystems/events.md`, `docs/subsystems/record_types.md`, and `docs/doc_dependencies.yaml`.
- New FU scaffolds for the work consolidated into v0.8.0: `docs/feature_units/in_progress/FU-2026-04-aauth-hardware-attestation/`, `FU-2026-Q3-aauth-inspector-attestation-viz/`, `FU-2026-Q3-aauth-tpm2-verifier/`, `FU-2026-Q3-aauth-webauthn-packed-verifier/`, `FU-2026-Q4-aauth-attestation-revocation/`, `FU-2026-Q4-aauth-linux-tpm2-cli/`, `FU-2026-Q4-aauth-windows-tbs-cli/`, `FU-2026-Q4-aauth-yubikey-cli/`.

## Internal changes

- Workspace gains four new `packages/aauth-*` entries (`aauth-mac-se`, `aauth-tpm2`, `aauth-win-tbs`, `aauth-yubikey`) with consistent N-API binding shape, `binding.gyp`, generated build artefacts, TypeScript outputs, and per-package smoke tests under `tests/`.
- `src/services/aauth_attestation_verifier.ts` is the single module other verifiers route through; format-specific verifiers do not duplicate trust-config or `applyRevocationPolicy()` logic.
- The `aauth_admission` middleware composes with the existing `aauth_verify` middleware; admission state propagates to the write path through `request_context` rather than module-level globals.
- `frontend/tsconfig.json` and `frontend/tsconfig.tsbuildinfo` are touched for the new Inspector route set.

## Fixes

- AAuth tier attribution no longer overstates trust by promoting algorithm choice to `hardware`.
- `tierIcon()` no longer falls through to the default `○` glyph for `operator_attested`; the four-tier visual cascade now matches the four-tier semantic cascade.
- `attribution.decision` surfaces enough information to debug attestation failures and revocation outcomes without enabling debug logging.
- `eligible_for_trusted_writes` reflects the resolved tier honestly under the new cascade and the new revocation default.
- `neotoma auth session`'s `hardware_supported_reason` is honest about why hardware is or is not available on Linux and Windows; the prior "darwin only" hard-code is gone.
- WebAuthn-packed and TPM 2.0 envelopes that would have been silently rejected by an earlier framework version now produce real verifications (and real, format-specific failure reasons when they fail).
- A revoked attestation key that previously continued to authorise the agent at its prior tier indefinitely now demotes to `software` under the default `enforce` mode (and produces audit-trail evidence under `log_only`).
- Hardware AAuth is no longer reachable only on hosts with built-in TPM / Secure Enclave; YubiKey gives operators a portable hardware root they can carry between hosts.
- Sandbox follow-ups: real AAuth CLI flows that rotate ephemeral signing keys now perform write-read round trips against `sandbox.neotoma.io`; AAuth resource discovery no longer returns `jwks_uri: null`.

## Tests and validation

- New unit tests:
  - `tests/unit/aauth_attestation_apple_se.test.ts`, `tests/unit/aauth_attestation_webauthn_packed.test.ts`, `tests/unit/aauth_attestation_tpm2.test.ts`, `tests/unit/aauth_attestation_verifier.test.ts`, `tests/unit/aauth_attestation_revocation.test.ts`, `tests/unit/aauth_attestation_trust_config.test.ts`, `tests/unit/aauth_operator_allowlist.test.ts`, `tests/unit/aauth_tpm_structures.test.ts`, `tests/unit/aauth_admission.test.ts`, `tests/unit/aauth_authority_normalization.test.ts`.
  - `tests/unit/agent_grants_service.test.ts`, `tests/unit/agents_grants_import.test.ts`, `tests/unit/agent_capabilities.test.ts` (updated), `tests/unit/agent_identity.test.ts` (updated), `tests/unit/protected_entity_types.test.ts`.
  - `tests/unit/cli_aauth_tbs_attestation.test.ts`, `tests/unit/cli_aauth_tpm2_attestation.test.ts`, `tests/unit/cli_aauth_yubikey_attestation.test.ts`.
  - `tests/unit/features/FU-2026-Q3-aauth-inspector-attestation-viz/agent_badge_tier_icon.test.ts`.
  - `tests/unit/request_context.test.ts` (updated), `tests/unit/session_info.test.ts` (updated).
- New integration tests:
  - `tests/integration/aauth_tier_resolution.test.ts` — locks in the four-tier resolution cascade end-to-end.
  - `tests/integration/aauth_webauthn_packed_e2e.test.ts` — runtime-generated CA + leaf chain through the AAuth middleware end-to-end.
  - `tests/integration/aauth_tpm2_e2e.test.ts` — runtime-generated TPM CA + AIK chain through the AAuth middleware end-to-end.
  - `tests/integration/aauth_revocation_e2e.test.ts` — local HTTP impersonation of Apple's revocation endpoint; explicitly exercises `enforce`, `log_only`, and `disabled` modes against the middleware → Apple SE verifier → revocation service path.
  - `tests/integration/agent_capabilities_store.test.ts` (updated) — exercises grant-driven scoping through the new admission middleware.
- Per-package native binding tests under `packages/aauth-*/tests/` cover argument validation, error mapping, and the graceful "device not present" path. Real-hardware smoke tests are skipped unless `NEOTOMA_AAUTH_TPM2_TEST_ENABLED=1`, `NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED=1`, `NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED=1`, or the existing macOS Secure Enclave smoke condition holds.
- Existing tier-assertion sites across `src/` and `tests/` are updated for the new tier values, the new `attribution.decision` shape, and the new `failure_reason` codes.
- `tests/integration/aauth_resource_metadata.test.ts` continues to lock in the dereferenceable `jwks_uri` and empty JWKS response.
- `tests/integration/aauth_sandbox_attribution_partition.test.ts` and `tests/integration/aauth_sandbox_write_admission.test.ts` continue to validate stable agent-identity partitioning and AAuth-only write attribution to the stable agent-derived sandbox user.
- `npm run -s openapi:bc-diff -- --base v0.7.1` reports the additive `attestation.revocation` field on `AttributionDecision`, additive `/agents/grants*` routes, and no breaking changes to existing routes.

## New environment variables

| Env var                                          | Default                                | Purpose                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEOTOMA_AAUTH_ATTESTATION_CA_PATH`              | (bundled roots only)                   | Path to a PEM bundle that supplements (or replaces) the bundled Apple App Attestation Root CA and bundled TPM CA roots.                          |
| `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`           | (bundled defaults)                     | Path to a JSON allowlist of trusted AAGUIDs / vendor identifiers used by the WebAuthn-packed and TPM 2.0 verifiers.                              |
| `NEOTOMA_OPERATOR_ATTESTED_ISSUERS`              | _(empty)_                              | Comma-separated `iss` values whose verified-AAuth callers are promoted to `operator_attested`.                                                   |
| `NEOTOMA_OPERATOR_ATTESTED_SUBS`                 | _(empty)_                              | Comma-separated `sub` values (or `iss::sub` pairs) whose verified-AAuth callers are promoted to `operator_attested`.                             |
| `NEOTOMA_AAUTH_REVOCATION_MODE`                  | `enforce`                              | One of `disabled` / `log_only` / `enforce`. Controls whether revoked status demotes the tier.                                                    |
| `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS`     | `86400`                                | LRU cache TTL keyed by certificate fingerprint.                                                                                                  |
| `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`            | `5000`                                 | Per-lookup network timeout (Apple endpoint, OCSP, or CRL fetch).                                                                                 |
| `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN`             | `true`                                 | When the responder is unreachable, treat the result as `unknown` (true) or `revoked` (false).                                                    |
| `NEOTOMA_AAUTH_APPLE_REVOCATION_URL`             | Apple production endpoint              | Override the Apple anonymous-attestation revocation endpoint. Primarily for testing.                                                             |
| `NEOTOMA_AAUTH_TPM2_HANDLE`                      | `0x81010000`                           | Persistent TPM 2.0 handle the Linux backend uses for the AIK.                                                                                    |
| `NEOTOMA_AAUTH_TPM2_HIERARCHY`                   | `owner`                                | TPM 2.0 hierarchy under which the AIK is created.                                                                                                |
| `NEOTOMA_AAUTH_TPM2_TEST_ENABLED`                | `0`                                    | Enables real-TPM smoke tests in `packages/aauth-tpm2/`.                                                                                          |
| `NEOTOMA_AAUTH_WIN_TBS_PROVIDER`                 | `Microsoft Platform Crypto Provider`   | CNG provider used by the Windows backend.                                                                                                        |
| `NEOTOMA_AAUTH_WIN_TBS_KEY_NAME`                 | `neotoma-aauth-aik`                    | CNG key name reserved for the AIK.                                                                                                               |
| `NEOTOMA_AAUTH_WIN_TBS_SCOPE`                    | `user`                                 | `user` or `machine`. Selects the CNG scope.                                                                                                      |
| `NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED`             | `0`                                    | Enables real-TPM smoke tests in `packages/aauth-win-tbs/`.                                                                                       |
| `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH`              | platform default                       | Path to libykcs11. Override when libykcs11 is not on the loader path.                                                                            |
| `NEOTOMA_AAUTH_YUBIKEY_SERIAL`                   | _(unset)_                              | Pin the active YubiKey by serial when multiple devices are inserted.                                                                             |
| `NEOTOMA_AAUTH_YUBIKEY_PIN`                      | _(unset)_                              | Optional PIN. PIN-cached vs PIN-always behaviour follows the YubiKey PIV slot policy.                                                            |
| `NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED`             | `0`                                    | Enables real-hardware smoke tests in `packages/aauth-yubikey/`.                                                                                  |

All of the above are documented in `.env.example` and `docs/subsystems/aauth_attestation.md` / `docs/subsystems/aauth_cli_attestation.md`.

The following env vars are **removed** in v0.8.0: `NEOTOMA_AGENT_CAPABILITIES_JSON`, `NEOTOMA_AGENT_CAPABILITIES_FILE`, `NEOTOMA_AGENT_CAPABILITIES_ENFORCE`, and the bundled `config/agent_capabilities.default.json` registry. Setting any of those variables on a v0.8.0 process causes startup to fail with a structured error pointing at `neotoma agents grants import --owner-user-id <usr_…>`.

## Breaking changes

1. **Tier semantics changed.** Agents that previously rendered as `hardware` purely because of ES256 / EdDSA now render as `software` unless they present verified attestation. Tooling, dashboards, ACLs, and CI gates that branch on `attribution.tier === "hardware"` MUST be reviewed before upgrading. Operators that need a smoother migration window should consider `min_tier=operator_attested` (admits the operator allowlist + hardware) or `min_tier=software`.
2. **`NEOTOMA_AGENT_CAPABILITIES_*` removed.** The env-driven per-agent capability registry and the committed default JSON file are removed. Operators MUST run `neotoma agents grants import --owner-user-id <usr_…>` before upgrading; setting the legacy vars on a v0.8.0 process causes startup to fail with a structured error. Re-runs of the import are idempotent.
3. **Revocation enforcement on by default.** `NEOTOMA_AAUTH_REVOCATION_MODE=enforce` is the new default. Agents whose attestation keys appear on Apple's anonymous-attestation revocation endpoint, on the OCSP responder for their `webauthn-packed` leaf, or on the OCSP / CRL chain for their `tpm2` AIK demote from `hardware` (or `operator_attested`) to `software` with `failure_reason: "revoked"`. Operators that need a soak window should set `NEOTOMA_AAUTH_REVOCATION_MODE=log_only` ahead of upgrading.
4. **`attribution.decision` shape grew.** New required fields under `attestation` and `operator_allowlist_source`; new optional `attestation.revocation` sub-object. Field additions are backwards compatible, but consumers that asserted exact-shape equality on the decision object will need to update.
5. **`NEOTOMA_MIN_ATTRIBUTION_TIER=hardware` is stricter.** Pre-attestation agents that previously satisfied this gate are rejected with `ATTRIBUTION_REQUIRED` until they upgrade.

## Rollback

- Sandbox: redeploy the previous sandbox image. No migrations are required.
- npm: `v0.7.1` remains available; consumers can pin with `npm install neotoma@0.7.1`. Rolling back returns the env-driven capability registry, the algorithm-based `hardware` promotion, and removes `operator_attested`, `agent_grant`, and the entire attestation framework. Agents minted via `neotoma auth keygen --hardware` continue to verify after rollback (their signatures are unchanged) but appear at their pre-attestation tier.
- A more conservative in-place rollback (without downgrading) is available for revocation: `NEOTOMA_AAUTH_REVOCATION_MODE=disabled` suppresses the lookup and any demotion. There is no in-place rollback for the agent grants migration; operators that downgrade also restore the legacy env-driven registry.
