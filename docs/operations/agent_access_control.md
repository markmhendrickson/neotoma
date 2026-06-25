---
title: Agent Access Control
summary: How agents are identified, how grants and capabilities constrain them, and how to manage access.
category: operations
audience: operator
visibility: public
order: 50
tags: [agents, grants, capabilities, attestation, security, operations]
---

# Agent Access Control

Every write to Neotoma is attributed to an agent identity, and what an agent may do is governed by grants. This matters most when more than one agent, or a third-party agent, writes to your instance.

## Agent identity

An agent is identified, in order of strength, by its attested key thumbprint, its JWT subject, or its client name and version. Unattributed writes are recorded as anonymous. The identity and a trust tier are stamped on every observation, so the audit trail always shows who wrote what.

## Trust tiers and attestation

Agents that present hardware-attested keys (Apple Secure Enclave, TPM 2.0, WebAuthn/FIDO2, YubiKey, or Windows TBS) resolve to a higher trust tier than unverified clients. Optional revocation checks can demote a key whose attestation is revoked. See [AAuth](../subsystems/aauth.md) and [agent attribution](../subsystems/agent_attribution_integration.md).

## Grants and capabilities

A grant is a first-class record that maps an agent identity (matched on subject, issuer, or thumbprint) to a set of capabilities. A capability names an operation (for example `store`, `create_relationship`, `correct`, `retrieve`) and the entity types it applies to. A grant has a lifecycle: `active`, `suspended`, and `revoked`, with restoration back to active. Set `NEOTOMA_AGENT_DEFAULT_DENY` to require an explicit grant before an agent may write. See [agent capabilities](../subsystems/agent_capabilities.md).

## Guest access

Guest submission flows return a scoped, time-limited token that grants read-back (and limited append) to a specific submitted entity without full credentials. Guests cannot escalate beyond their token. See [guest access policy](../subsystems/guest_access_policy.md).

## Managing access

- **Inspector:** the Agents and Agent Grants screens list every writer and let you create, suspend, revoke, and restore grants, scoped by entity type. See [Using the Inspector](../getting_started/using_the_inspector.md).
- **REST API:** the `/agents` and `/agents/grants` endpoints expose the same operations for automation.

## Multi-tenant scoping

Every query is scoped to the authenticated user's `user_id`, so one instance can serve multiple users without cross-user reads. See [Auth](../subsystems/auth.md).
