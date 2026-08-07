# Remediation plan — 2026-08-07 security probe

Source: operator-authorized probe of the operator's personal Neotoma instance, cross-checked against `origin/main` @ `9a21de393` (v0.21.3). Two client/personal instances (personal + bottega8) were confirmed live-exploitable and have been taken offline. Sandbox is public-but-low-risk.

This plan is **advisory drafts + fix plan only**. No code has been changed and nothing has landed on a public branch. Notifications (client + any RGPD scoping) are deliberately deferred to the end, after the operator scans the personal instance for other affected clients.

## Blast radius (confirmed)

| Instance | Mode | Data | Forged-key bypass | `sort_by` SQLi | State |
|---|---|---|---|---|---|
| personal (`neotoma.markmhendrickson.com`) | personal | operator real data | exploitable | exploitable | **offline** |
| bottega8 (`bottega8-neotoma.fly.dev`) | personal | **client real data** | **exploitable (live-confirmed)** | **exploitable (live-confirmed)** | **offline** |
| sandbox (`neotoma-sandbox.fly.dev`) | sandbox | demo only | **blocked** (user_id override → 403) | injection point present, public-user only | public (low risk) |

## Which findings warrant advisories

Precedent: this repo has issued a GHSA+CVE for an auth bypass (GHSA-5cvp-p7p4-mcx9) and for a tenant-isolation gap (GHSA-wrr4-782v-jhwh). Two of these findings are direct successors.

| # | Finding | Advisory | Rationale |
|---|---|---|---|
| 1 | Ed25519 forged-key REST auth bypass | **GHSA + CVE** | Pre-auth full read/write; worse than the prior auth-bypass advisory. Draft: `advisories/2026-08-07-ed25519-bearer-forged-key-auth-bypass.md`. |
| 2 | `sort_by` ORDER BY SQL injection | **GHSA + CVE** | Cross-tenant read primitive + classic SQLi. Draft: `advisories/2026-08-07-sort-by-order-by-sql-injection.md`. |
| 3 | Stored XSS in `publish_rendered_page` | **GHSA** (CVE optional) | Guest pages are a shared unauthenticated surface; CWE-79. |
| 4 | XOR key-wrap in response encryption (`envelope.ts`) | **Likely GHSA** | Weakens a shipped confidentiality feature (CWE-327). Downgrade to note-only if response-encryption mode has no real users — confirm before deciding. |
| 5 | BIP-39 seed uses SHA256 not SHA512 | Note-only unless load-bearing | Correctness/interop bug with security flavor; advisory only if a key anyone relies on is weakened. |
| 6–13 | SSRF, file-read, no-auth-rate-limit, Docker-root, replayable `crypto/auth.ts` signatures, ReDoS, CSP `unsafe-inline`, OAuth redirect any-path, manifest drift | No advisory | Deployment-gated, authenticated-only, or defense-in-depth. Normal-release hardening batch. |

## Phasing

### Phase 1 — coordinated hotfix `vX.Y.Z` (findings 1 + 2)

GHSA-first, per `SECURITY.md`: draft private advisories → fix on `hotfix/vX.Y.Z-...` from the affected `main` SHA → regression tests that fail pre-fix / pass post-fix → tag + deploy → mirror advisories public. **Do not** push a descriptively-named fix to a public branch before the private advisory exists (both repos are public; the commit title alone is disclosure).

**Finding 1 code changes** (`src/actions.ts`, `src/services/public_key_registry.ts`):
1. Make the signature **mandatory** on the Ed25519 accept path — reject when `signature` absent; verify over the body before accepting. (Replaces the `if (signature && req.body)` optional check at the accept block ~`actions.ts:4060-4070`.)
2. Stop treating `ensurePublicKeyRegistered() === true` as validation — authenticate only keys that map to a pre-provisioned `userId` **and** carry a valid signature.
3. In `getAuthenticatedUserId` (~`actions.ts:4231-4242`), **fail closed** (`AUTH_REQUIRED`) when a Bearer request never resolved an `authenticatedUserId`; delete the "we trust the provided user_id" tail.
4. **G3 row:** forged 32-byte key + `user_id=<nil-UUID>`, with and without a signature → 401/403 on every protected REST route.

**Finding 2 code changes** (`src/services/entity_queries.ts`, `src/repositories/sqlite/local_db_adapter.ts`):
1. Validate `snapshotField` against `^[A-Za-z_][A-Za-z0-9_]*$` before building `snapshot->>${field}` — for the sort path (~`entity_queries.ts:452-453`) and every `snapshot_filters` key.
2. `normalizeColumnName` (~`local_db_adapter.ts:302-333`): **throw** on any `->>` column whose sides are not bare identifiers, instead of `return column` at line 332.
3. Bound/parameterize `LIMIT`/`OFFSET`.
4. **G3 row:** non-identifier `sort_by` / `snapshot_filters` key → 400; adapter throw on non-identifier `->>`; cross-tenant non-influence assertion.

**Redeploy order after fix:** bottega8 and personal both need `vX.Y.Z` before going public again; sandbox after (same code fix, lower urgency).

### Phase 2 — findings 3–5

XSS (sanitize `html_body` server-side OR serve rendered pages from a sandboxed origin with `script-src 'none'`; drop `unsafe-inline` from the global scriptSrc) + the two crypto findings. GHSA for #3; decide #4/#5 once response-encryption usage is known. Coordinated release, embargoed if any get a GHSA.

### Phase 3 — hardening batch (findings 6–13)

Normal PRs into the regular release, no embargo:
- SSRF: shared `assertPublicHttpUrl()` on `subscribe` / `add_peer` registration and at fetch time (reject loopback/RFC1918/link-local/internal; pin resolved IP vs DNS-rebind).
- `file_path` read: gate `source_storage:"reference"` behind a trusted-host capability, off in hosted/multi-tenant; containment-check resolved path.
- Rate limit the bearer-auth path and `/mcp`.
- Dockerfile: add a non-root `USER`.
- `crypto/auth.ts`: bind signatures to timestamp + nonce + method/path.
- ReDoS: complexity-limit schema patterns; run matching under a bounded engine.
- CSP: nonce/hash inline scripts, SRI-pin or self-host CDN assets.
- OAuth: pin `chatgpt.com`/`chat.openai.com` to known callback paths.
- Fix `protected_routes_manifest.json`: the `.well-known/oauth-*` routes are correctly public (RFC 8414/9728) — set `requires_auth:false`.

### Phase 4 — notifications (deferred, operator-led)

After Phases 1–3, and after the operator scans the personal instance for other client instances, scope: client notification for bottega8 (real client data exposed on operator-run infra) and any other affected clients, plus RGPD breach-notification assessment for EU-context third-party personal data. Reproduction steps in any external-facing advisory must be **sanitized** — the probe's raw findings quote real IBANs/addresses and must never leave the private channel.

## Artifacts in this worktree

- `docs/security/advisories/2026-08-07-ed25519-bearer-forged-key-auth-bypass.md`
- `docs/security/advisories/2026-08-07-sort-by-order-by-sql-injection.md`
- `docs/security/2026-08-07-probe-remediation-plan.md` (this file)

Not yet done (await operator go-ahead): add index rows to `docs/security/advisories/README.md`, open private GHSAs, cut the hotfix branch, implement fixes + gates.
