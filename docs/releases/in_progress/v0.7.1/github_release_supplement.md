v0.7.1 is a surgical hotfix on top of v0.7.0 that turns Neotoma into a credible AAuth resource server in public form: it exposes the `/.well-known/aauth-resource.json` discovery endpoint everywhere, partitions sandbox writes by AAuth thumbprint so signed agents land under their own deterministic identity instead of the shared sandbox public user, and adds a sandbox-only AAuth-required write route so the “signature → admission → identity-bound provenance” chain is demonstrable end-to-end without changing any non-sandbox auth behavior.

## Ship constraints

- This release is intentionally narrow. It assumes the working-tree changes for the AAuth metadata endpoint, the sandbox attribution branch (Option α), and the sandbox-only AAuth-required write route (γ-write) land before tagging. It excludes local-only and protected paths such as `docs/private/`, `.tmp_*`, backup files, and generated cache output, and it does not assume any uncommitted internals inside dirty submodules ship unless those submodules are committed and the parent pointers are updated.
- No schema changes, no migrations, no changes to the global auth admission gate, OAuth flows, Bearer flows, `/mcp` admission, `aauthVerify` middleware semantics, or `sandboxDestructiveGuard`.

## Highlights

- **Neotoma is now machine-discoverable as an AAuth resource server.** Every Neotoma instance — hosted, sandbox, or self-hosted — serves `GET /.well-known/aauth-resource.json` advertising the issuer, supported algorithms (`ES256`, `EdDSA`), supported token typ (`aa-agent+jwt`), signature window (`60`), and an explicit `jwks_uri: null` with a `jwks_uri_reason` documenting that Neotoma is verifier-only and agents convey JWKs per-request via the `Signature-Key` header.
- **Sandbox writes are now identity-partitioned by AAuth thumbprint.** When a request lands on the sandbox bypass branch and carries a verified AAuth signature, it is attributed to a deterministic per-thumbprint user id (derived via `ensureSandboxAauthUser`) instead of the shared `SANDBOX_PUBLIC_USER_ID`. Same key on two requests resolves to the same `user_id`; different keys resolve to different `user_id`s. Unsigned requests keep the existing public-user fallback unchanged. Read paths inherit the partition automatically because every read scopes by `req.authenticatedUserId`.
- **Sandbox gains a public AAuth admission demo.** A new sandbox-only route, `POST /sandbox/aauth-only/store`, registered only when `NEOTOMA_SANDBOX_MODE=1`, explicitly rejects unsigned requests with `401 AAUTH_REQUIRED` and otherwise delegates to the existing `/store` handler. Verified writes round-trip through identity-scoped reads so the full “AAuth gate → admission → identity-bound provenance → identity-scoped retrieval” chain is visible in one terminal session.

## What changed for npm package users

**CLI / runtime**

- `npm run start:server` (and the `dist/server.js` entry point) now serves `GET /.well-known/aauth-resource.json` with the AAuth resource descriptor on every Neotoma instance, regardless of mode. Self-hosted and hosted operators get this for free; the descriptor is honest about what is supported and reflects the existing globally applied `aauthVerify` middleware.
- The internal `/store` POST handler is now exposed as a named function (`handleStorePost`) inside `src/actions.ts`. This is a pure code-organization refactor with no behavioral change for `POST /store`; existing `/store` integration tests pass unchanged.
- `src/services/local_auth.ts` adds `ensureSandboxAauthUser(thumbprint)` and a small `hashStringToUserId` helper (the existing `hashEmailToUserId` now delegates to it). The sandbox AAuth users use `aauth-<short-thumbprint>@sandbox.neotoma.local` as their stored email and an unguessable password hash so they cannot be used to log in via local auth.

**Runtime / data layer**

- The sandbox bypass branch in `src/actions.ts` now reads `req.aauth?.verified` and `req.aauth?.thumbprint` (populated by the existing global `aauthVerify` middleware) and partitions attribution accordingly. This is the only change to existing auth-resolution code in this release; no other admission path is touched.
- The new sandbox-only `POST /sandbox/aauth-only/store` route is registered inside the existing `if (isSandboxMode())` block, so it physically does not exist in non-sandbox builds. It uses the same `writeRateLimit` and request shape as `POST /store`.

**Shipped artifacts**

- The npm package picks up the new metadata route handler, the `ensureSandboxAauthUser` / `hashStringToUserId` helpers in `dist/services/local_auth.js`, and the `handleStorePost` extraction in `dist/actions.js`.
- `openapi.yaml` is not materially tightened in this release; the `openapi:bc-diff` preflight reports no breaking changes versus `v0.7.0`.

## API surface & contracts

- **New global route:** `GET /.well-known/aauth-resource.json` — public, no auth required, returns:

  ```json
  {
    "issuer": "https://<authority>",
    "client_name": "Neotoma",
    "signature_window": 60,
    "supported_algs": ["ES256", "EdDSA"],
    "supported_typ": ["aa-agent+jwt"],
    "jwks_uri": null,
    "jwks_uri_reason": "Neotoma is verifier-only; agent JWKs are conveyed per-request via the Signature-Key header (with thumbprint binding via the jkt claim)."
  }
  ```

  `issuer` is derived from `canonicalAauthAuthority()`: it trusts an explicit `NEOTOMA_AAUTH_AUTHORITY` configuration first, then the host the process is listening on, and is normalized to a fully-qualified URL when possible.

- **New sandbox-only route:** `POST /sandbox/aauth-only/store` — identical request/response shape to `POST /store`, but admission is gated by a verified AAuth signature. Unsigned requests get `401` with `error_code: "AAUTH_REQUIRED"`. Registered only when `NEOTOMA_SANDBOX_MODE=1`; returns `404` (route not registered) in non-sandbox deployments.

- **No changes** to `POST /store`, `POST /entities/query`, `GET /entities/:id`, `GET /stats`, OAuth flows, Bearer flows, `/mcp` admission, or any other existing route. Internal handler organization changes (extraction of `handleStorePost`) are not observable through any HTTP contract.

## Behavior changes

- On `sandbox.neotoma.io` (and any other deployment running with `NEOTOMA_SANDBOX_MODE=1`), AAuth-signed requests now land on a deterministic per-thumbprint `user_id` instead of the shared `SANDBOX_PUBLIC_USER_ID`. As a direct consequence, two AAuth-signed agents see disjoint slices of the entity graph through `/stats`, `POST /entities/query`, and `GET /entities/:id`. Unsigned sandbox requests are unchanged: they continue to attribute to `SANDBOX_PUBLIC_USER_ID`.
- A new log line, `auth_method=sandbox_aauth user_id=<...> thumbprint=<...>`, appears for AAuth-attributed sandbox requests; the existing `auth_method=sandbox_public` log line continues to cover unsigned sandbox traffic.
- Self-hosted and personal-mode deployments are not affected by either of the sandbox-only changes (α, γ-write); the only externally observable difference is the new `/.well-known/aauth-resource.json` endpoint.

## Tests and validation

- `tests/integration/aauth_resource_metadata.test.ts` locks in the contract of the new metadata endpoint: `200` with `application/json`, `client_name === "Neotoma"`, `signature_window === 60`, `supported_algs` includes `ES256` and `EdDSA`, `supported_typ` includes `aa-agent+jwt`, `jwks_uri === null`, and `issuer` is a non-empty string (host or fully-qualified URL).
- `tests/integration/aauth_sandbox_attribution_partition.test.ts` mirrors the production sandbox bypass branch in a minimal Express app and exercises it via real HTTP with `@hellocoop/httpsig` mocked at the module level. It locks in: (i) unsigned → `SANDBOX_PUBLIC_USER_ID`, (ii) signed → a deterministic id distinct from `SANDBOX_PUBLIC_USER_ID`, (iii) two requests with the same thumbprint → same id (deterministic), and (iv) two different thumbprints → two different ids (partitioned). Companion unit assertions cover `ensureSandboxAauthUser` directly, including UUID shape, determinism per thumbprint, distinct ids per thumbprint, and rejection of empty / non-string inputs.
- `tests/integration/aauth_sandbox_write_admission.test.ts` validates the γ-write contract end-to-end: unsigned `POST /sandbox/aauth-only/store` → `401 AAUTH_REQUIRED`, AAuth-signed `POST` → `200` with the response `user_id` matching `ensureSandboxAauthUser(thumbprint).id`, requests with a failed AAuth verification → `401`, and the route is absent (`404`) when not registered (the non-sandbox case). The existing `tests/integration/store_*.test.ts` coverage continues to validate the underlying `handleStorePost` behavior unchanged.
- `npm run -s openapi:bc-diff -- --base v0.7.0` reports no breaking changes.

## Internal changes

- `src/actions.ts` extracts the `/store` POST handler from an anonymous closure into a named `async function handleStorePost(req, res)` so both `POST /store` and the sandbox-only `POST /sandbox/aauth-only/store` route can bind it. This is a pure refactor.
- `src/services/local_auth.ts` factors the existing `hashEmailToUserId` into a shared `hashStringToUserId(input)` helper, used by both `hashEmailToUserId` and the new `ensureSandboxAauthUser`. Behavior of `hashEmailToUserId` is unchanged byte-for-byte.

## Fixes

- AAuth client libraries can now auto-configure against any Neotoma instance from a single `GET /.well-known/aauth-resource.json` fetch instead of failing the discovery probe.
- Sandbox AAuth-signed writes are no longer indistinguishable from anonymous sandbox writes: the entity graph, the Inspector, `/stats`, and `POST /entities/query` now all show the signing agent's identity instead of collapsing it to `SANDBOX_PUBLIC_USER_ID`.

## Breaking changes

None.

## Rollback

- Sandbox: `flyctl deploy --config fly.sandbox.toml --image registry.fly.io/neotoma-sandbox:v0.7.0` — no DB migrations to undo. The thumbprint-derived `local_auth_users` rows written by α are functionally inert (cannot be used to log in) and can be ignored, or pruned offline if desired.
- npm: `v0.7.0` remains intact on the registry; consumers can pin or downgrade with `npm install neotoma@0.7.0`.
