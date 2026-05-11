# Release v0.11.1 — Integration Tests

## Test Catalog

### IT-001: Reverse-Proxy Public Client Rejection
- **Goal**: Loopback socket traffic with a public `X-Forwarded-For` value is not treated as local.
- **Command**:
```bash
npx vitest run tests/integration/tunnel_auth.test.ts
```
- **Pass condition**: the reverse-proxy regression cases pass, including public forwarded-client rejection.

### IT-002: Production Loopback Fail-Closed Behavior
- **Goal**: Production loopback traffic without explicit trust is rejected as local.
- **Command**:
```bash
npx vitest run tests/unit/security_hardening.test.ts
```
- **Pass condition**: security hardening tests prove loopback sockets are rejected in production unless explicitly trusted.

### IT-003: Root Landing Classification Parity
- **Goal**: Root landing mode mirrors the auth-layer classification for production reverse-proxy traffic.
- **Command**:
```bash
npx vitest run tests/integration/root_landing.test.ts
```
- **Pass condition**: landing-mode tests prove production reverse-proxy traffic resolves to `personal`, not `local`.

### IT-004: Hotfix Build Integrity
- **Goal**: The server still builds cleanly with the hotfix applied.
- **Command**:
```bash
npm run build:server
```
- **Pass condition**: build completes successfully with no compile failures.

### IT-005: Deployed Auth Smoke Checks
- **Goal**: Hosted protected routes reject unauthenticated public access after rollout.
- **Command**:
```bash
curl -i https://neotoma.markmhendrickson.com/me
curl -i https://neotoma.markmhendrickson.com/inspector/
```
- **Pass condition**: both endpoints return `401` (or an equivalent protected response), not a successful authenticated session.

## Pre-Deployment Checklist

- [ ] `git status --short` shows only intended hotfix paths plus release artifacts
- [ ] IT-001 through IT-004 pass in the release environment
- [ ] IT-005 is run after deploy and confirmed
- [ ] Advisory draft is updated with the shipped patched version and disclosure notes
