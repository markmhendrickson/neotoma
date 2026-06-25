---
title: Deployment Modes
summary: Local single-user vs hosted multi-user, the auth posture per mode, sandbox profiles, and deploy targets.
category: operations
audience: operator
visibility: public
order: 40
tags: [deployment, hosting, multi-user, sandbox, operations]
---

# Deployment Modes

Neotoma runs on one embedded SQLite engine in two modes. Tenancy is enforced by `user_id` scoping on every row, not by separate databases.

## Local single-user

Run it on your own machine for your cross-assistant memory. Local auth (or key-based auth when encryption is enabled), data stays local, and no network exposure is required. This is the default and the mode the privacy and "stays local" claims apply to.

## Hosted multi-user

Run a shared instance that several users and agents reach over the network. This mode adds:

- **MCP OAuth** for client authentication (set `NEOTOMA_OAUTH_CLIENT_ID` and provide token encryption; see [Auth](../subsystems/auth.md)).
- **Attested agent identity and grants** to constrain what each agent may write (see [Agent Access Control](agent_access_control.md)).
- **Guest submission tokens** for scoped, credential-free read-back of submitted entities.
- **Peer federation** to sync with other instances (see [peer sync](../subsystems/peer_sync.md)).

In hosted, OAuth, or peer-sync configurations, data is shared per those settings rather than staying purely local.

## Sandbox profiles

The server resolves a sandbox mode at boot from auth, bind address, and environment:

- `local` and `production`: normal authenticated installs.
- `hosted_sandbox` (`NEOTOMA_SANDBOX_MODE=1`): a public demo with unauthenticated writes to a shared sandbox user.
- `local_sandbox`: loopback-only, no auth, non-production.
- `refuse`: no auth plus a non-loopback bind. This topology matches a known auth-bypass advisory class, so the server warns by default and can be made fatal with `NEOTOMA_REFUSE_MODE=enforce`. Fix it by enabling auth, binding to loopback, or opting into a sandbox profile. See [sandbox deployment](../subsystems/sandbox_deployment.md).

## Deploy targets

The repository ships Docker and Fly configurations (`Dockerfile`, `fly.toml`, `fly.sandbox.toml`). Put TLS in front of the HTTP port for any networked deployment. See [Running the Server](running_the_server.md) and `developer/docker.md`.
