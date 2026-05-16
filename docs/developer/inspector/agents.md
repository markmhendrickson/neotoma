---
title: Inspector — Agents
summary: View agent grants, capabilities, and revocations.
category: development
subcategory: ui
order: 80
audience: developer
visibility: public
tags: [inspector, agents, aauth]
---

# Inspector — Agents

The Agents screen (`/inspector/agents`) is the human surface over Neotoma's
agent-authentication subsystem (aauth). It surfaces every grant the local
instance has issued, the capabilities each grant carries, and the revocation
history.

## What you see

- **Grant list.** One row per active grant: agent key, scope, capability
  set, issued-at, expires-at, attestation kind.
- **Grant detail.** Full record including the capability bundle, the
  attestation evidence (WebAuthn, TPM2, or none), and any sandbox
  attribution policy applied.
- **Revocations.** Revoked grants stay visible (immutable history) with a
  revoked-at timestamp and reason.

## Operations

- Issue a new grant (CLI or admin API; the Inspector links out rather than
  issuing in-place).
- Revoke a grant.
- Restore a previously-revoked grant within the grace window.

## Related

- `docs/subsystems/aauth.md`
- `docs/subsystems/aauth_attestation.md`
- `docs/subsystems/aauth_cli_attestation.md`
- `docs/security/threat_model.md`
