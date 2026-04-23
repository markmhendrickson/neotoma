# Agent capability scoping

**Audience:** operators wiring a new agent into Neotoma, and integrators
who need to predict whether their service-to-service calls will be
allowed.

This page documents the per-agent capability registry that sits above
the tier-based attribution policy. Where the [attribution
policy](./agent_attribution_integration.md#5-policy-knobs) asks *"is
this write attributable at all?"*, the capability registry asks *"is
*this* specific agent allowed to touch *this* specific `entity_type` via
*this* operation?"*.

Implementation: [`src/services/agent_capabilities.ts`](../../src/services/agent_capabilities.ts).

## When does this apply?

| Caller                                        | Enforced? |
| --------------------------------------------- | --------- |
| Humans + general MCP clients (no registry entry) | No — preserves legacy behaviour unless `default_deny=true`. |
| Service agents listed in the registry (e.g. `agent-site@neotoma.io`) | Yes — restricted to declared `(op, entity_type)` pairs. |
| AAuth-verified agent not in the registry, `default_deny=true`, tier `hardware`/`software` | Yes — denied. |
| Anonymous / unverified_client callers         | No — falls through to attribution policy. |

The canonical use is pinning the Netlify forwarder
(`sub: agent-site@neotoma.io`) to the `neotoma_feedback` entity type,
so a compromised forwarder key cannot be used to write observations for
unrelated entities.

## Registry format

A registry is a JSON document with two top-level keys:

```jsonc
{
  "default_deny": false,
  "agents": {
    "agent-site@neotoma.io": {
      "match": {
        "sub": "agent-site@neotoma.io",
        "iss": "https://agent.neotoma.io"
      },
      "capabilities": [
        { "op": "store_structured",      "entity_types": ["neotoma_feedback"] },
        { "op": "create_relationship",   "entity_types": ["neotoma_feedback"] },
        { "op": "correct",               "entity_types": ["neotoma_feedback"] },
        { "op": "retrieve",              "entity_types": ["neotoma_feedback"] }
      ]
    }
  }
}
```

### Fields

| Field                           | Type                      | Purpose                                                                                     |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| `default_deny`                  | boolean (default `false`) | When `true`, AAuth-verified callers without a registry entry are denied. Opt-in tightening. |
| `agents`                        | map of label → agent      | Labels are human-readable; matching is driven by the `match` fields inside each agent.      |
| `agents.*.match.sub`            | string                    | Matched against the AAuth `sub` claim on the verified JWT.                                  |
| `agents.*.match.iss`            | string                    | When set, `iss` must ALSO match — protects against a spoofed issuer.                        |
| `agents.*.match.thumbprint`     | string                    | RFC 7638 JWK thumbprint. Pins a specific key; takes precedence over `sub` matching.         |
| `agents.*.capabilities[*].op`   | enum                      | `store_structured` \| `create_relationship` \| `correct` \| `retrieve`.                     |
| `agents.*.capabilities[*].entity_types` | `string[]`        | Allowed types. Use `"*"` to widen to every type (rarely appropriate).                       |

### Matching order

1. If the request has a JWK thumbprint AND any registry entry has a
   matching `thumbprint`, that entry wins.
2. Otherwise, the first entry whose `match.sub` equals the request's
   `sub` and (if set) whose `match.iss` equals the request's `iss`.
3. Otherwise, no match — the request falls through to attribution
   policy (or is denied outright when `default_deny=true` and the tier
   is `hardware`/`software`).

## Configuration sources

The registry is loaded once per process (cached; call
`resetAgentCapabilitiesCache()` in tests). Sources are tried in order;
the first that parses successfully wins:

1. `NEOTOMA_AGENT_CAPABILITIES_JSON` — inline JSON. Useful for hosted
   deploys where the registry is small and mutable.
2. `NEOTOMA_AGENT_CAPABILITIES_FILE` — absolute or cwd-relative path
   to a JSON file. Useful for larger registries under secret management.
3. `config/agent_capabilities.default.json` — committed default. The
   current repo ships this file pinning `agent-site@neotoma.io` to
   `neotoma_feedback`.

When none of the above parses, the registry is treated as empty and
nothing is gated by capability checks.

## Enforcement mode

`NEOTOMA_AGENT_CAPABILITIES_ENFORCE` controls whether denials actually
throw:

| Value           | Behaviour                                                          |
| --------------- | ------------------------------------------------------------------ |
| unset / `0` / `false` / `no` | Observe-only. Logs `agent_capability_denied` at WARN and allows through. Use this during rollout. |
| `1` / `true` / `yes`         | Rejects with HTTP 403 `capability_denied`. |

The log event is always emitted, so an operator can inspect real
traffic against the registry before flipping enforcement on.

## Strict-require AAuth for claimed subjects

Set `NEOTOMA_STRICT_AAUTH_SUBS` to a comma-separated list of agent
subjects that MUST present a valid AAuth signature whenever the request
claims that identity via the `X-Agent-Label` header. This is a second
line of defense against a compromised tunnel / edge:

- `X-Agent-Label: agent-site@neotoma.io` + missing signature → 401.
- `X-Agent-Label: agent-site@neotoma.io` + signature verified, but
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
    "hint": "Agent \"agent-site@neotoma.io\" is registered but has no \"store_structured\" capability for entity_type \"person\". Grant it in the capability registry if intentional."
  }
}
```

## Operator runbook

### Grant a new scope

1. Edit `config/agent_capabilities.default.json` (or your deployed
   override). Add the agent entry and the `(op, entity_types)` pairs.
2. Deploy. The registry is read on the next process start or the next
   call that triggers `resetAgentCapabilitiesCache()` — rolling deploys
   naturally pick it up.
3. Confirm via the log line `{"event":"agent_capability_denied",...}` —
   it should disappear for the newly-granted op/type.

### Revoke a scope

1. Remove the entry (or shrink `entity_types`) in the registry.
2. Flip `NEOTOMA_AGENT_CAPABILITIES_ENFORCE` to `1` if still in
   observe-only mode.
3. Monitor `agent_capability_denied` logs — a denied caller will now
   receive `403 capability_denied` rather than silent allow.

### Rollout playbook for a new agent

1. Deploy with the registry entry in place, `default_deny=false`, and
   `NEOTOMA_AGENT_CAPABILITIES_ENFORCE` unset. This runs in
   observe-only mode.
2. Exercise the agent's production traffic for a full day. Grep logs
   for `agent_capability_denied` — any hit indicates a scope gap.
3. When the log is clean, set
   `NEOTOMA_AGENT_CAPABILITIES_ENFORCE=1`.
4. (Optional, high-trust deployments) flip `default_deny=true` to
   deny any AAuth-verified agent not in the registry.

### Rollback

Setting `NEOTOMA_AGENT_CAPABILITIES_ENFORCE=0` (or unsetting it)
restores the prior behaviour on the next request without redeploying
code. The registry is still consulted for logging, so a botched rollout
remains diagnosable.

### Emergency bypass

To temporarily grant a scope without a deploy, set
`NEOTOMA_AGENT_CAPABILITIES_JSON` with the expanded registry and
restart the process. The inline JSON overrides the committed default.

## See also

- [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md) — tier-based attribution policy; runs below this layer.
- [`docs/subsystems/feedback_neotoma_forwarder.md`](./feedback_neotoma_forwarder.md) — the forwarder that relies on this scoping.
- [`docs/proposals/agent-trust-framework.md`](../proposals/agent-trust-framework.md) — long-term agent-trust roadmap.
