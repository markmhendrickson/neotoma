# Agent capability scoping

**Audience:** operators wiring a new agent into Neotoma, and integrators
who need to predict whether their service-to-service calls will be
allowed.

This page documents the per-agent capability registry that sits above
the tier-based attribution policy. Where the [attribution
policy](./agent_attribution_integration.md#5-policy-knobs) asks *"is
this write attributable at all?"*, the capability registry asks *"is
*this* specific agent allowed to touch *this* specific `entity_type`
via *this* operation?"*.

Capabilities are now modelled as first-class `agent_grant` entities —
one per (user, agent identity) pair — managed in the Inspector under
**Agents → Agent grants**. The previous environment-variable registry
(`NEOTOMA_AGENT_CAPABILITIES_JSON`, `NEOTOMA_AGENT_CAPABILITIES_FILE`,
`NEOTOMA_AGENT_CAPABILITIES_ENFORCE`,
`config/agent_capabilities.default.json`) has been removed.

Implementation:
- [`src/services/agent_capabilities.ts`](../../src/services/agent_capabilities.ts) — capability lookup and enforcement.
- [`src/services/agent_grants.ts`](../../src/services/agent_grants.ts) — grant entity CRUD wrapper over the standard entity store.
- [`src/services/aauth_admission.ts`](../../src/services/aauth_admission.ts) — resolves a verified AAuth identity to a grant.
- [`src/services/protected_entity_types.ts`](../../src/services/protected_entity_types.ts) — guards writes to `agent_grant` (and any future protected type).

## When does this apply?

| Caller                                                               | Enforced? |
| -------------------------------------------------------------------- | --------- |
| User-authenticated callers (Bearer / OAuth / local Inspector session) | No — full access to their own user_id's data, modulo attribution policy. |
| AAuth-verified agent matched to an `active` grant                    | Yes — restricted to declared `(op, entity_type)` pairs on the grant. |
| AAuth-verified agent with no matching grant                          | Falls through to attribution-only behaviour (no admission, must use Bearer/OAuth). |
| AAuth-verified agent whose `sub` / `iss` names a grant that pins no key | Not admitted, and capability-gated writes are refused (`capability_denied`) even when Bearer/OAuth authenticates the request, until the grant is pinned. See [Identity rule](#identity-rule). |
| AAuth-verified agent whose key is pinned to a grant that is `suspended` or `revoked` | Not admitted, and capability-gated writes are refused (`capability_denied`) even when Bearer/OAuth authenticates the request, until the grant is restored to `active`. See [Identity rule](#identity-rule). |
| Anonymous / unverified-client tier                                   | No admission; subject to attribution policy. |

The canonical use is pinning the Netlify forwarder
(`sub: agent-site@neotoma.io`) to the `neotoma_feedback` entity type, so
a compromised forwarder key cannot be used to write observations for
unrelated entities.

### Transports where capabilities are enforced

Capability scoping runs on both the HTTP direct-write endpoints and the MCP
tool path, so an AAuth-admitted agent gets the same `(op, entity_type)`
ceiling regardless of how it reaches Neotoma:

- HTTP `/store`, `/correct` (and store-time `create_relationship`) —
  `enforceAgentCapability` in `src/actions.ts`.
- MCP `store` / `correct` tools — `enforceAgentCapability` in the
  `storeStructuredInternal` and `correct` paths of `src/server.ts`, mirroring
  the HTTP gate. (Before AAuth admission could authenticate an MCP session,
  the MCP tools ran only the protected-entity-types guard; the capability
  gate was added alongside MCP admission so the two transports stay at
  parity.)

The protected-entity-types guard (`assertCanWriteProtected`) runs in addition
to capability scoping on both transports, so governance state such as
`agent_grant` is never writable via a `*` capability — `*` widens only to
non-protected types.

## Grant shape

An `agent_grant` is a normal Neotoma entity — observation history doubles
as the audit log. Canonical fields (see
[`src/services/agent_grants.ts`](../../src/services/agent_grants.ts) for
the source of truth):

```jsonc
{
  "entity_type": "agent_grant",
  "owner_user_id": "usr_…",
  "label": "Cursor on macbook-pro",
  "match_thumbprint": "abcd…",               // RFC 7638 JWK thumbprint; required to admit
  "match_sub": "agent-cursor@example.com",   // AAuth sub claim (descriptive)
  "match_iss": "https://agent.example.com",  // optional; descriptive
  "capabilities": [
    { "op": "store",               "entity_types": ["neotoma_feedback"] },
    { "op": "create_relationship", "entity_types": ["neotoma_feedback"] },
    { "op": "correct",             "entity_types": ["neotoma_feedback"] },
    { "op": "retrieve",            "entity_types": ["neotoma_feedback"] }
  ],
  "status": "active",   // active | suspended | revoked
  "notes": "issued 2026-04",
  "last_used_at": "2026-04-26T09:54:00Z"
}
```

### Identity rule

Admission to a grant requires a key binding. A grant admits a signed
request only when its `match_thumbprint` equals the RFC 7638 thumbprint
of the key that signed the request.

`match_sub` / `match_iss` are descriptive: they are recorded on the
grant and shown in Inspector, but do not admit on their own. A grant
without `match_thumbprint` does not admit signed requests. A request
whose `sub` / `iss` match such a grant gets admission reason
`grant_key_unbound` (visible in `/session` under
`aauth.admission_reason`), and the server logs an
`aauth_admission_key_unbound` warning that points to
[Pin a key to an existing grant](#pin-a-key-to-an-existing-grant).

A grant's `status` is likewise part of the key binding: a key pinned to
a grant that is later set to `suspended` or `revoked` stops admitting
that key's signed requests — the pin does not carry over to "no grant
at all". Admission reports `grant_revoked` or `grant_suspended`
accordingly, and the server logs an `aauth_admission_inactive_grant`
warning naming the grant and its current status. Restoring the grant to
`active` (Inspector, `PATCH /agents/grants/{id}`, or `correct`) is what
re-admits it; the key binding itself does not need to be re-pinned.

Authentication and capability limits are separate decisions. A request
can be authenticated by Bearer or OAuth and also carry an AAuth
signature; the signature still decides which capability limits apply:

- Signature bound to an `active` grant (`match_thumbprint` matches):
  the grant's capabilities are the ceiling, whatever authenticated the
  request.
- Signature whose `sub` / `iss` names a grant that pins no key
  (`grant_key_unbound`), or whose key is pinned to a grant that is now
  `suspended` or `revoked` (`grant_suspended` / `grant_revoked`):
  capability-gated writes (`store`, `correct`, `create_relationship`,
  relationship-type registration, protected types) are refused with
  `capability_denied`. This does not depend on
  `NEOTOMA_AGENT_DEFAULT_DENY`, and a Bearer/OAuth credential on the
  same request does not lift it.
- No grant involved: `NEOTOMA_AGENT_DEFAULT_DENY` decides, as before.

Take the thumbprint from the agent's own key material (for example
`neotoma auth session` on the agent's host, which prints the configured
signer's thumbprint), not from observed request traffic.

A grant may still be created with only `match_sub` (for example while
the agent's key is being provisioned); it stays inert until
`match_thumbprint` is set. `POST /agents/grants` and
`PATCH /agents/grants/{id}` return a `warnings` entry for such a grant,
and `neotoma agents grants import` prints one per grant.

#### Pin a key to an existing grant

There is no dedicated CLI edit subcommand; use any of the paths below.
Writes to `agent_grant` are protected, so make them from a
user-authenticated session (Bearer / OAuth / Inspector) or from an agent
whose own grant carries the bootstrap capability.

1. **Get the thumbprint** from the agent's own key material: run
   `neotoma auth session` on the agent's host and copy `thumbprint`.
2. **Apply it to the grant** (`<grant_id>` is the grant's entity id,
   shown in Inspector and in `GET /agents/grants`):
   - **Inspector:** Agents → Agent grants → open the grant
     (`/agents/grants/<grant_id>`) → set **match_thumbprint** → Save.
   - **REST (grant route):**
     `PATCH /agents/grants/<grant_id>` with body
     `{ "match_thumbprint": "<thumbprint>" }`. This also clears the
     admission cache, so the pin applies to the next request.
   - **MCP `correct`:**
     ```json
     {
       "entity_id": "<grant_id>",
       "entity_type": "agent_grant",
       "field": "match_thumbprint",
       "value": "<thumbprint>",
       "idempotency_key": "pin-<grant_id>-<thumbprint>"
     }
     ```
   - **REST `correct`:** `POST /correct` with the same JSON body.
   - **CLI (generic correction):**
     `neotoma corrections create <grant_id> --entity-type agent_grant --field-name match_thumbprint --corrected-value <thumbprint>`

   A pin written through `correct` is picked up after the admission
   cache TTL (a few seconds).
3. **Verify** from the agent's host: `neotoma auth session` should
   report `aauth.admitted: true` with `aauth.admission_reason: "admitted"`.
   Check the pinned value against the agent's key material itself; a
   grant's admission status before the pin is applied does not confirm
   the value.

#### Agents that cannot be pinned

Agents that use the `jkt_jwt` Signature-Key scheme sign with a
short-lived key, so the thumbprint changes whenever the key does and
cannot be pinned on a grant. Grant admission does not admit such
agents. They need issuer-verified identity (the agent token verified
against its issuer's keys), which grant admission does not provide
today. Give an agent that needs a grant a long-lived signing key
(`hwk`, `jwt` with a stable `cnf.jwk`, or `jwks_uri`).

### Capability ops

| Op                   | Covers                                                 |
| -------------------- | ------------------------------------------------------ |
| `store` / `store_structured` | Creating / observing entities (write path). `store_structured` remains accepted on persisted grants as a legacy synonym. |
| `create_relationship`| Creating relationships between entities.               |
| `correct`            | Correcting / updating existing observations / fields.  |
| `retrieve`           | Reading entities and observations.                     |

`entity_types` is a string array of permitted entity types for that op.
Use `["*"]` to widen to every type — only do this for trusted grants.

### Matching order

Admission resolves the verified identity to at most one grant:

1. The most recently observed `active` grant whose `match_thumbprint`
   equals the signing key's thumbprint wins.
2. Otherwise, no admission — the request stays attribution-only, and
   capability-gated writes fail closed rather than falling back to an
   unrecognized-agent ceiling. The reason is:
   - `grant_revoked` / `grant_suspended` when the signing key is pinned
     to a `revoked` / `suspended` grant (a key binding survives a
     status change — it is not silently treated as unmatched),
   - `grant_key_unbound` when a grant without a thumbprint pin matched
     `sub` / `iss`,
   - `no_match` otherwise.

## Status lifecycle

`status` is a small state machine enforced by
[`src/services/agent_grants.ts`](../../src/services/agent_grants.ts):

```
active  ⇄  suspended
   │           │
   ▼           ▼
       revoked (terminal in normal flow)
       │
       ▼  restore (within grace window)
     active
```

Only the user who owns the grant (or an agent the user has authorised
with the bootstrap `(store | store_structured | correct, agent_grant)`
capability) can flip status. Admission caches the resolved grant for a
small TTL plus invalidates on observation events, so a revoke
propagates to in-flight clients within seconds.

## Protected entity types — the trust mechanism

Writes to `agent_grant` (and any future protected type) are gated by
[`src/services/protected_entity_types.ts`](../../src/services/protected_entity_types.ts):

- User-authenticated callers (Bearer / OAuth / local Inspector
  session for the same user) pass through.
- AAuth-admitted callers must hold an explicit capability in their
  grant for the protected type. The bootstrap capability is
  `{ op: "store_structured", entity_types: ["agent_grant"] }`
  (and `correct`).
- Anonymous / unverified-client tier writes to protected types are
  rejected with `capability_denied`.

This is what lets a user safely delegate grant management to a trusted
agent: only that one grant carries the bootstrap capability; every other
grant remains locked out of `agent_grant` writes by the protected-types
guard, even if it has otherwise broad capabilities.

## Strict-require AAuth for claimed subjects

Set `NEOTOMA_STRICT_AAUTH_SUBS` to a comma-separated list of agent
subjects that MUST present a valid AAuth signature whenever the request
claims that identity via the `X-Agent-Label` header. This is a second
line of defence against a compromised tunnel / edge:

- `X-Agent-Label: agent-site@neotoma.io` + missing signature → 401.
- `X-Agent-Label: agent-site@neotoma.io` + signature verified, but the
  `sub` claim is something else → 401.
- Any label NOT listed in `NEOTOMA_STRICT_AAUTH_SUBS` behaves as before
  (best-effort attribution hint).

See [`src/middleware/aauth_verify.ts`](../../src/middleware/aauth_verify.ts).

## Error surface

A denial produces HTTP 403 with:

```json
{
  "error": {
    "code": "capability_denied",
    "message": "Agent \"agent-site@neotoma.io\" is not permitted to store_structured entity_type \"person\".",
    "op": "store_structured",
    "entity_type": "person",
    "agent_label": "agent-site@neotoma.io",
    "hint": "Agent \"agent-site@neotoma.io\" holds an active grant but no \"store_structured\" capability for entity_type \"person\". Edit the grant in Inspector → Agents → Agent grants if intentional."
  }
}
```

## Operator runbook

### Upgrading from the env-config era

The previous release loaded capabilities from
`NEOTOMA_AGENT_CAPABILITIES_JSON` / `_FILE` /
`config/agent_capabilities.default.json`. After upgrading, **starting
the server with any of those variables set fails fast** with a
structured error linking to the import command.

Migrate once, per deployment:

```bash
neotoma agents grants import --owner-user-id <usr_…> \
  [--file path/to/agent_capabilities.json]
```

- `--owner-user-id` decides which user account owns the imported
  operational grants. Pick the operator's own user account, or a
  dedicated account you maintain for infrastructure agents (e.g. the
  agent-site forwarder).
- The command is idempotent on `(match_sub, match_iss, match_thumbprint)`
  — re-running it after a partial migration upserts grants without
  duplicating.
- Each created/updated grant is stamped with provenance
  `import_source: "env_config"` so the audit timeline clearly records
  the migration origin.
- Once the import succeeds, unset the legacy variables and redeploy.

### Grant a new scope

1. In Inspector, go to **Agents → Agent grants → New grant**.
2. Paste the agent's key thumbprint (required for admission), its AAuth
   `sub` / `iss`, and a readable label.
3. Select capabilities by `(op, entity_type)`.
4. Save. Admission picks up the new grant within the cache TTL.

Equivalent flows:

- "Promote observed agent" from the existing
  [`/agents`](../../inspector/src/pages/agents.tsx) page prefills the
  match fields from observed provenance.
- An agent that holds the bootstrap capability can issue a normal
  `store_structured` MCP call against `entity_type: "agent_grant"`.

### Revoke or suspend a scope

1. Open the grant in Inspector → **Agents → Agent grants → :id**.
2. Click **Suspend** (reversible) or **Revoke** (terminal).
3. The next request from that agent reverts to attribution-only after
   the admission cache TTL.

### Roll back a botched grant edit

Grant edits are observations — open the grant detail view and use the
audit timeline to see what changed. Apply a `correct` to restore the
prior values (or use the **Restore** action to roll back a recent
revoke within the grace window).

## See also

- [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md) — tier-based attribution policy; runs below this layer.
- [`docs/subsystems/feedback_neotoma_forwarder.md`](./feedback_neotoma_forwarder.md) — the forwarder that relies on this scoping.
- [`docs/proposals/agent-trust-framework.md`](../proposals/agent-trust-framework.md) — long-term agent-trust roadmap.
