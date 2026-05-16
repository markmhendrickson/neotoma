---
title: "Agent authorization & governance"
summary: "As AI agents gain the ability to act autonomously — executing transactions, accessing sensitive data, and making decisions on behalf of humans — the question of authorization provenance becomes critical. Neotoma provides versioned policy..."
---

# Agent authorization & governance

As AI agents gain the ability to act autonomously — executing transactions, accessing sensitive data, and making decisions on behalf of humans — the question of authorization provenance becomes critical. Neotoma provides versioned policy state, consent timelines, delegation provenance, and DAO governance lineage, enabling platforms to reconstruct whether an agent was authorized for a specific action at a specific time, under which policy version, and through which delegation chain. This is foundational for multi-agent systems, DAOs, and any environment where autonomous action requires auditable consent and governance traceability.

## Entity examples

- `auth_decision`
- `consent_grant`
- `delegation_chain`
- `policy_evaluation`
- `governance_vote`

## Key question

> "Was this agent authorized for this action at this time, and under which policy or governance decision?"

## Data sources

- Policy definition documents and version histories
- Consent grant records and revocation events
- Delegation chain configurations
- DAO governance proposals and vote results
- Agent action audit logs
- Identity and access management system events

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists policy evaluations, consent grants, and delegation chains |

## External tools

- None specific — uses Neotoma MCP directly for policy state versioning and authorization provenance
