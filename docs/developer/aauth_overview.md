---
title: aauth overview
summary: Index of agent-authentication (aauth) subsystem docs — spec, attestation, CLI keys, capabilities, integration.
category: operations
subcategory: security
order: 20
audience: developer
visibility: public
tags: [aauth, auth, security]
---

# aauth overview

**aauth** is Neotoma's agent-authentication subsystem. It issues
capability-bound grants to agents, optionally backed by hardware attestation,
and enforces those capabilities at every mutating call site.

This doc is an index that points at the canonical deep-dive material in
`docs/subsystems/aauth*` and the live operator surface at
`/inspector/agents`.

## What aauth is

- **Capability grants.** An agent presents a key; the server resolves it to
  a grant; the grant carries a capability bundle (what the agent may write,
  read, and to which scope).
- **Attestation.** Grants may be backed by WebAuthn (browser-resident keys),
  TPM2 (server-resident hardware), or none (development / local).
- **Tier resolution.** A grant resolves to a tier that drives admission
  control: read-only, write-restricted, write-full.
- **Sandbox attribution.** Writes from sandbox sessions are stamped with
  attribution policy so the originating session can be audited later.

## Surface map

| Concern | Canonical doc | Site page (if any) |
|---|---|---|
| Subsystem overview | `docs/subsystems/aauth.md` | `/aauth` |
| Spec / data model | `docs/subsystems/aauth.md` | `/aauth/spec` |
| Attestation (WebAuthn / TPM2) | `docs/subsystems/aauth_attestation.md` | `/aauth/attestation` |
| CLI key issuance | `docs/subsystems/aauth_cli_attestation.md` | `/aauth/cli-keys` |
| Capability set | `docs/subsystems/aauth.md` (capabilities section) | `/aauth/capabilities` |
| Integration (how a harness wires up) | `docs/subsystems/aauth.md` (integration section) | `/aauth/integration` |
| Threat model | `docs/security/threat_model.md` | — |

## How aauth fits the rest of the system

- The base auth layer (`getAuthenticatedUserId`) resolves the calling user.
- aauth resolves the calling **agent** within that user, plus capabilities.
- The two together determine whether a given write is admissible.
- Subscription, peer-sync, and issue-reporting write paths all consult
  aauth before mutating state.

## Operator surfaces

- `neotoma agent grant ...` — CLI to issue / revoke / restore grants.
- `/inspector/agents` — read-only browse of grants and history.
- `POST /agents/grants` — programmatic surface for harnesses.

## Related

- `docs/subsystems/auth.md` — the base user-auth layer aauth builds on.
- `docs/security/threat_model.md` — including the v0.11.1 Inspector
  auth-bypass regression class and the gates that prevent recurrence.
- `docs/developer/inspector/agents.md`
