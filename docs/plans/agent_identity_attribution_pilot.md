# Per-Agent Identity Attribution Pilot — Lemonbrand

## Context

Lemonbrand operates a fleet of 6+ agents writing to 2 Neotoma instances (Bolden, ottawa-meetup). Today all writes collapse to a single user profile. Their auditability sales pitch requires that each agent's writes are individually attributable.

## Current State

- **AAuth infrastructure shipped**: RFC 9421 HTTP Message Signatures + `aa-agent+jwt` tokens are verified on every HTTP surface (`/mcp`, `/store`, `/correct`, `/session`).
- **Attribution tiers**: `hardware` (ES256/EdDSA), `software` (other algorithms), `unverified_client` (clientInfo only), `anonymous`.
- **Inspector columns**: Agent column and filter exist across entities, observations, relationships, sources, timeline events, and interpretations.
- **Access policies**: Entity-type-level access policy framework is implemented (`src/services/access_policy.ts`).
- **Agent capabilities**: Capability enforcement layer exists (`src/services/agent_capabilities.ts`).
- **Session endpoint**: `GET /session` returns resolved attribution tier and identity fields.

## Pilot Scope (Lemonbrand)

### Phase 1: Keygen + Identity Setup (1-2 days)
- Generate AAuth keypairs for each Lemonbrand agent using `neotoma auth keygen`
- Configure each agent's MCP proxy with its own key (`~/.neotoma/aauth/` per agent)
- Verify via `GET /session` that each agent resolves to `software` or `hardware` tier
- Confirm Inspector surfaces distinct agent identities in observation provenance

### Phase 2: Attribution Audit (1 day)
- Run Lemonbrand agents against Bolden instance
- Verify all new observations carry distinct `agent_thumbprint` / `agent_sub`
- Confirm Inspector filtering by agent works end-to-end
- Document any gaps or friction in the setup flow

### Phase 3: Access Policy Pilot (3-5 days)
- Define per-entity-type access policies for Lemonbrand agents
- Test `closed` mode (only admitted agents can write specific types)
- Pilot guest credentials for the observer agent (see observer wire plan)

## Timeline

| Milestone | Target | Dependency |
|-----------|--------|------------|
| Phase 1 complete | 2026-05-12 | None (infra already shipped) |
| Phase 2 report | 2026-05-14 | Phase 1 |
| Phase 3 design | 2026-05-16 | Phase 2 feedback |
| Phase 3 implementation | 2026-05-23 | Design approval |

## Success Criteria

1. Each Lemonbrand agent has a unique, verifiable identity in Neotoma
2. Inspector shows distinct agents in provenance for all observation types
3. Access policies can restrict writes by agent identity per entity type
4. Setup documented in under 15 minutes per agent

## Open Questions

- Should agent identity be per-instance or fleet-wide? (Recommendation: per-instance for maximum auditability)
- What capability model makes sense for the observer agent? (read-only + issue writes)
