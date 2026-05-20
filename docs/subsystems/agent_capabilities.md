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
| Anonymous / unverified-client tier                                   | No admission; subject to attribution policy. |

The canonical use is pinning the Netlify forwarder
(`sub: agent-site@neotoma.io`) to the `neotoma_feedback` entity type, so
a compromised forwarder key cannot be used to write observations for
unrelated entities.

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
  "match_sub": "agent-cursor@example.com",   // AAuth sub claim
  "match_iss": "https://agent.example.com",  // optional; both must match when set
  "match_thumbprint": "abcd…",               // optional RFC 7638 JWK thumbprint
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

At least one of `match_sub` or `match_thumbprint` MUST be set;
`match_iss` is optional but, when set, BOTH `match_sub` and `match_iss`
MUST match the verified identity for the grant to admit.

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

1. If the request carries a JWK thumbprint AND any of the user's grants
   has a matching `match_thumbprint`, that grant wins.
2. Otherwise, the first `active` grant whose `match_sub` equals the
   request's `sub` and (when set on the grant) whose `match_iss` equals
   the request's `iss`.
3. Otherwise, no admission — the request stays attribution-only.

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
2. Paste the agent's AAuth `sub` (and `iss`, or thumbprint) and a
   readable label.
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
