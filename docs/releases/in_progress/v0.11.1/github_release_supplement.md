v0.11.1 is a minimal security hotfix that closes the hosted Inspector/API auth bypass caused by production reverse-proxy loopback traffic being treated as local development traffic.

## Highlights

- **Close the production auth bypass behind reverse proxies.** `src/actions.ts` now checks `X-Forwarded-For` and fails closed in production instead of trusting loopback sockets by default.
- **Keep root landing behavior aligned with auth behavior.** `src/services/root_landing/index.ts` now uses the same production-safe local-request classification so reverse-proxy traffic no longer falls into the wrong landing mode.
- **Ship focused regression coverage for the exploit path.** The hotfix adds targeted tests for forwarded public clients, production loopback rejection, and landing-mode parity.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- No CLI surface changes are included in this hotfix.

**Runtime / data layer**

- Production local-request detection no longer trusts loopback sockets by default when the request is arriving through a reverse proxy.
- If `X-Forwarded-For` is present, every forwarded hop must also be loopback before the request is treated as local.
- Production operators can still opt into trusting loopback-only production traffic with `NEOTOMA_TRUST_PROD_LOOPBACK=1`, but the default now fails closed.

**Shipped artifacts**

- Runtime code changed in `src/actions.ts` and `src/services/root_landing/index.ts`.
- Regression coverage changed in `tests/integration/tunnel_auth.test.ts`, `tests/integration/root_landing.test.ts`, and `tests/unit/security_hardening.test.ts`.

## API surface & contracts

- No OpenAPI path or schema changes are included in this hotfix.
- Protected-route behavior changes operationally: unauthenticated public traffic that previously slipped through the local-dev shortcut is now rejected.

## Behavior changes

- Hosted reverse-proxy traffic without bearer auth is no longer treated as the local production user.
- Production loopback requests now default to remote/untrusted behavior unless explicitly trusted.
- Root landing mode no longer classifies production reverse-proxy requests as `local` by default.

## Agent-facing instruction changes

- No agent-instruction changes ship in this hotfix.

## Plugin / hooks / SDK changes

- No plugin, hook, or SDK changes ship in this hotfix.

## Security hardening

- The local-development auth shortcut is now constrained so a public client cannot inherit it just because the app server sees a loopback socket from a reverse proxy.
- The root landing page mirrors the same hardening so deployment mode detection stays consistent with auth boundaries.

## Docs site & CI / tooling

- No docs-site, CI workflow, or tooling changes ship in this hotfix.

## Internal changes

- Added helper logic for loopback-address detection, forwarded-hop parsing, and production-environment checks in the affected runtime paths.

## Fixes

- Fixed a security regression where public hosted Inspector/API traffic could be resolved as the local production user when a reverse proxy forwarded the request over a loopback socket.

## Tests and validation

- `npx vitest run tests/integration/tunnel_auth.test.ts`
- `npx vitest run tests/integration/root_landing.test.ts`
- `npx vitest run tests/unit/security_hardening.test.ts`
- `npm run build:server`
- deployed `curl` probes against `/me` and `/inspector/`

## Execute note

- This preview assumes the current hotfix patch and release-prep docs are committed on `hotfix/v0.11.1-inspector-auth-bypass` before tagging. Until then, the rendered body is accurate for the narrative sections, but the commit list remains empty because there are no commits above `v0.11.0` yet.

## Breaking changes

No breaking changes.
