# Security review — v0.23.0

`npm run security:classify-diff --base v0.22.2 --head HEAD` reports `sensitive=true`, driven by one concern:

- `auth-middleware` — `src/actions.ts` (the MCP session-recovery fix touches the `/mcp` request-handling path, which sits adjacent to the auth-middleware surface classifier watches).

## Gate results

- **G1 `security:classify-diff`**: `sensitive=true`, one concern (`auth-middleware` on `src/actions.ts`).
- **G2 `security:lint`**: 0 errors, 133 warnings across 407 files — identical warning count and categories to the v0.22.2 baseline (`unauth-public-route` matches on long-standing routes: `/submit/:entity_type/:entity_id`, `/events/stream`, `/recompute_snapshots_by_type`, `/openapi_actions.yaml`, `/docs`, `/docs/*`, plus three pre-existing matches inside `route_shadowing.test.ts` fixture code; `local-dev-user-widening` matches on the two pre-existing `LOCAL_DEV_USER_ID` references in `sandbox_mode.ts`). No new warning categories or new files introduced this release.
- **G3 `security:manifest:check`**: in sync (120 routes, unchanged from v0.22.2 — this release adds no new Express routes).
- **G3 `test:security:auth-matrix`**: 18 passed / 1 skipped (19 total) — identical to the v0.22.2 baseline.

## Adversarial review

### Alternate-path auth

The session-recovery code path in `src/actions.ts` (`app.all("/mcp", ...)`) is reached only when a request has already passed whatever auth middleware gates the route — the added comment states this explicitly: "Auth already passed above — do not mint on 401 paths." The recovery branch fires for `POST` requests with a non-empty `Mcp-Session-Id` header, a non-`initialize` JSON-RPC body, and no matching in-memory transport. It does not introduce a new way to reach an authenticated code path without authenticating; it only changes what happens after authentication succeeds but the session id is stale (server restart, load-balancer replica mismatch, or client holding an expired id).

Verified: the new `mintMcpHttpSession` / `completeSyntheticMcpHandshake` helpers in `src/mcp_http_session.ts` are called from the same post-auth position in the request pipeline that the old `initialize`-only branch occupied. No new entry point bypasses whatever auth check already gated `/mcp`.

### Proxy trust / `X-Forwarded-For`

No changes to `isLocalRequest`, `forwardedForValues`, or `isProductionEnvironment`. The auth-matrix test suite's XFF-trust cases (18/19, matching baseline) pass unchanged, including the `isLocalRequest: loopback socket rejected because XFF contains untrusted IP(s)` cases exercised during this run.

### Local-dev widening

The `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR` / `NEOTOMA_ALLOW_USER_ENV_IN_TEST` env vars added in `src/config.ts` narrow, not widen, the surface: they make a previously-silent fallback (any process without an explicit `NEOTOMA_DATA_DIR` inheriting the user-level `~/.config/neotoma/.env` data directory) refuse under test-shaped conditions instead of silently resolving to a real operator's data. `LOCAL_DEV_USER_ID` itself is untouched by this release; the two pre-existing references in `sandbox_mode.ts` are unchanged.

### Unauth public route

No new Express routes in this release (`security:manifest:check` confirms 120 routes, unchanged). The instance-skills feature is MCP-transport-level (surfaced through the existing `/mcp` endpoint's `initialize` response), not a new REST route.

### Guest-access widening

Not applicable — no guest-principal or subscription-auth code touched in this release.

### AAuth downgrade

Not applicable — `aauth_admission.ts` does not appear in this release's diff.

## Skill-injection surface (new in this release, reviewed as an adjacent concern)

The instance-skills feature (`src/services/skills/instance_skills.ts`) reads graph-stored `skill` rows and renders their `name` and `description` fields into the MCP instructions block every connecting agent receives. This is a text-injection surface: any principal able to write a `skill` row for a user can inject text into that user's agent instruction stream. Mitigations verified in the diff:

- Descriptions are stripped of control/bidi/zero-width characters, collapsed to a single line, stripped of leading markdown structure, and have inline authority tokens neutered before rendering.
- Names are validated as identifiers (the token later used to fetch the skill body via `retrieve_entity_by_identifier`), so a name that fails validation cannot be used to fetch anything regardless.
- The read is scoped to `this.authenticatedUserId` — an unscoped read would return HTTP 200 with zero rows rather than an error, making a scoping regression silently indistinguishable from "no skills." This is asserted directly in `tests/integration/instance_skills_initialize_effect.test.ts`.
- Only descriptions are ever rendered — never skill bodies or scripts. Nothing executable is materialized by this feature; obtaining a skill's body still requires an explicit `retrieve_entity_by_identifier` call.

## Suggested negative tests

- Attempt to write a `skill` row with a `description` containing bidi override or zero-width characters; confirm the rendered instructions do not contain the raw injected text. **Already covered**: `tests/unit/mcp_instance_skill_hints.test.ts:567` ("strips Unicode bidi and zero-width characters from a description") asserts this exact case with a real payload.
- Attempt to write a `skill` row with a `description` containing markdown that resembles an instruction-block section header (e.g. `[SYSTEM]` or a fenced-block opener); confirm the rendered instructions do not let it masquerade as a structural section. Not independently verified against this specific payload shape — residual gap, not blocking (the general markdown-structure-stripping behavior is tested, but not this specific adversarial framing).
- Attempt to reach the session-recovery branch pre-auth (no valid credentials, stale session id, non-initialize body); confirm the request 401s before reaching `mintMcpHttpSession` rather than recovering. Not independently verified beyond code inspection of call order; the existing auth-matrix suite does not exercise this specific interaction.

## Residual risks

- The skill-description sanitizer's bidi/zero-width stripping is directly tested (`tests/unit/mcp_instance_skill_hints.test.ts:567`) with a real payload. The remaining residual gap is narrower than initially scoped: only the "forged section-header-like markdown" and "pre-auth session-recovery interaction" cases above lack a direct adversarial test. Low risk: the sanitizer's stated behavior (strip control/bidi/zero-width, single-line collapse, markdown-structure strip, authority-token neutering) is a narrowing of what previously reached the instructions block (previously: outer-trim only), not a new exposure.
- Session recovery introduces a new failure mode where a *forged* `Mcp-Session-Id` header on an otherwise-authenticated request now triggers a full synthetic handshake (mint transport + replay initialize) instead of an immediate 404. This is more server work per malformed request than before, but does not appear to allow any state or data access beyond what the caller's own authentication already grants. No rate-limiting change was made in this release to bound this; flagged as a residual consideration for a future release, not blocking.

## Sign-off verdict

**with-caveats** — the two residual risks above (sanitizer not independently adversarially re-tested; no new rate-limiting on the recovery handshake) do not block this release. Both are narrowing/neutral relative to pre-release behavior, and the existing security-lane test counts (auth-matrix 18/19, lint 0 errors/133 warnings, manifest 120 routes) are unchanged from the v0.22.2 baseline.
