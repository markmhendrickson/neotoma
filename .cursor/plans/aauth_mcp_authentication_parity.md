# AAuth/MCP authentication parity

**Status:** draft · **Priority:** P2 · **Repo:** neotoma · **Risk:** high (auth-topology hold point)

## Overview

Make AAuth-admitted requests authenticate MCP-over-HTTP sessions the same way
they already authenticate CLI/REST direct-write endpoints, with per-tool
capability enforcement, so a machine AAuth identity + `agent_grant` works
uniformly across CLI, REST, and MCP.

## Problems (key problems solved)

- The `/mcp` StreamableHTTP handler ignores `req.aauthAdmission` and derives the
  MCP session user **only** from an OAuth connection-id or Bearer token, so an
  AAuth-signed, grant-matched MCP tool call over HTTPS fails with
  `-32600 Authentication required. Set NEOTOMA_CONNECTION_ID` — even though the
  same identity authenticates CLI/REST.
- `docs/subsystems/agent_capabilities.md` promises an AAuth-verified agent
  matched to an active grant is admitted; MCP-over-HTTP does not honor it
  (asymmetry vs REST/CLI).
- Stdio-only harnesses (Claude Desktop) are forced to embed a Bearer secret in
  config or run a per-harness OAuth flow to get authed MCP usage.

### Evidence

- `src/actions.ts:1553` — `aauthAdmission()` middleware mounted on `/` stamps
  `req.aauthAdmission` / `req.authenticatedUserId` (why CLI/REST works).
- `src/services/aauth_admission.ts` — `admitFromAAuthContext` returns
  `{ admitted, user_id, grant_id, capabilities }` (owner user already resolved).
- `src/server.ts:570` — `/mcp` calls `setSessionAgentIdentity()` for
  *attribution only*.
- `src/server.ts:~380-460` — initialize auth resolution sets
  `authenticatedUserId` solely from connection-id/bearer; never reads
  `req.aauthAdmission`.
- Empirical: signed `initialize` → HTTP 200; signed `tools/call` → `-32600`;
  same key authenticates `neotoma --api-only` against production (grant
  `air.local laptop (Mark)`, `ent_9e3edbfdddb6b3083e61b6bb`).
- The comment at `src/actions.ts:1530` shows parity was the intent — the MCP
  initialize path simply predates consuming the admission. **Unfinished parity,
  not a deliberate guardrail.**

## Goals

- AAuth authenticates uniformly across CLI, REST, and MCP.
- Machine identity + `agent_grant` works for stdio-only harnesses without
  bearer secrets in config or per-harness OAuth.
- MCP capability scoping reaches exact parity with REST direct-write
  enforcement.
- No regression to OAuth/Bearer MCP auth or to tenant isolation.

## Solutions (key solutions implemented)

1. **`/mcp` handler** (`app.all('/mcp', ...)` in `src/actions.ts`): thread
   `req.aauthAdmission` into `NeotomaServer` via a new setter parallel to
   `setSessionAgentIdentity()`.
2. **`server.ts` initialize resolution** (`~380-460`): after the existing
   connection-id/bearer checks, if still unauthenticated **and**
   `admission?.admitted === true`, set `authenticatedUserId =
   admission.user_id`, record `requestAuth` for the request, and stash
   `admission.capabilities` + `grant_id` on the session. Connection-id/Bearer
   keep precedence; AAuth admission is the no-OAuth fallback only.
3. **Per-tool capability guard**: on the MCP tool dispatch path, when the
   session was authenticated via AAuth admission, enforce the grant's
   `(op, entity_type)` pairs before executing — reusing the REST capability
   enforcement helper (`src/services/agent_capabilities.ts`). An admitted MCP
   session gets exactly the grant scope, never broader.

## Critical invariant (fail-safe conditions)

AAuth may authenticate an MCP session **only when** the signature is verified
**and** an active `agent_grant` matches. The session `user_id` is always the
grant owner — never a request-supplied `user_id` — so an AAuth caller cannot
pivot owners (admission matching order in `aauth_admission.ts` guarantees this).
MCP capability scope is always `<=` the grant, identical to REST.

## Scope

In: the three code changes above + the security tests/docs below.

Out: AAuth signing/verification primitives, keypair format, admission matching
order; OAuth connection-id / Bearer flows (remain default for browser/url
harnesses); capability semantics (`*` still excludes protected types); local
stdio `dev-local` behavior; new credential types. Claude Desktop config itself
is a separate downstream step.

## Automated tests

- **Unit**: initialize resolution sets `authenticatedUserId` from
  `admission.user_id` only when admitted, never from request params; capability
  guard allows declared `(op, entity_type)` and rejects undeclared.
- **Integration**: signed MCP `initialize` + `tools/call`
  (`get_entity_type_counts`, then a scoped `store`) succeeds for the grant
  owner; unsigned / no-grant stays `-32600`; grant missing the op/type is
  rejected with a capability error.
- **Security (required by `change_guardrails_rules`)**: add rows to
  `tests/security/auth_topology_matrix.test.ts` (MCP-over-AAuth admitted vs
  unadmitted) and `tests/security/tenant_isolation_matrix.test.ts` (admitted
  AAuth cannot read another user's rows). Run
  `npm run test:security:auth-matrix`, `npm run security:lint`,
  `npm run security:manifest:check`.

## QA needs

Reproduce the `-32600` via the signing proxy before the change; confirm it
resolves after. Verify OAuth/url harnesses (Cursor, Claude Code) are
unaffected. Verify the production grant `ent_9e3edbfdddb6b3083e61b6bb` admits
MCP tool calls post-merge.

## Documentation update needs

- `docs/subsystems/agent_attribution_integration.md` and
  `docs/subsystems/agent_capabilities.md`: state AAuth admission now
  authenticates MCP sessions, not just REST.
- `docs/security/threat_model.md`: widened MCP auth surface + fail-safe
  conditions.
- `docs/releases/in_progress/<TAG>/security_review.md`: required (diff
  classifies `sensitive=true`).

## Hold-point / risk

Auth-topology change (high-risk per `change_guardrails_rules` §MUST 5/16;
v0.11.1 advisory class). Requires the security tests, manifest check, lint, and
a filled `security_review.md` in the same PR before merge.
