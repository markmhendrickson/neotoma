# Release v0.11.1 — Inspector Auth Bypass Hotfix

## 1. Release Overview

- **Release ID**: `v0.11.1`
- **Name**: Inspector Auth Bypass Hotfix
- **Release Type**: Not Marketed
- **Goal**: Ship a minimal hotfix release that closes the reverse-proxy loopback auth bypass affecting hosted Inspector/API access, without pulling in unrelated branch work.
- **Priority**: P0
- **Target Ship Date**: ASAP (after hotfix validation and release approval)
- **Marketing Required**: No

## 2. Scope

### 2.1 Included Scope

This hotfix release is intentionally limited to the isolated patch prepared on `hotfix/v0.11.1-inspector-auth-bypass`:

- `src/actions.ts`
  - fail closed for production loopback requests unless explicitly trusted
  - inspect `X-Forwarded-For` before treating loopback traffic as local
- `src/services/root_landing/index.ts`
  - mirror the production-safe local-request logic used by the auth layer
- `tests/integration/tunnel_auth.test.ts`
  - regression coverage for reverse-proxy and forwarded-client scenarios
- `tests/unit/security_hardening.test.ts`
  - regression coverage for production loopback rejection and public forwarded clients
- `tests/integration/root_landing.test.ts`
  - regression coverage for production landing-mode classification
- Release-prep and advisory artifacts for the hotfix itself

### 2.2 Explicitly Excluded

- Any unrelated working-tree changes from `test/current-branch-build`
- Unrelated hunks in the current branch's `src/actions.ts`
- Feature work, docs sweeps, frontend/site changes, or CI cleanup not required for the auth bypass hotfix
- Broader auth redesign beyond the minimal production-safe loopback classification change

## 3. Release-Level Acceptance Criteria

### 3.1 Product

- Unauthenticated public requests routed through a same-host reverse proxy no longer resolve as the local production user.
- Hosted `/inspector/` and `/me` return `401` for unauthenticated public traffic in the affected deployment shape.
- Legitimate local-development flows still work in development mode.

### 3.2 Technical

- The isolated hotfix branch contains only the intended code/test files for this fix.
- Targeted auth and landing-mode regression tests pass in a properly provisioned release environment.
- No lint errors are introduced in the hotfix-touched files.
- Release notes and advisory metadata clearly describe the affected range and mitigation.

### 3.3 Business / Operational

- The hotfix can be shipped without exposing or endangering unrelated branch work.
- Operators have clear upgrade guidance and a private advisory already exists for coordinated disclosure.
- Rollback remains straightforward: revert the hotfix commit or redeploy the previous known-good tag.

## 4. Cross-Release Validation Scenarios

The following scenarios must pass before release sign-off:

1. **Reverse-proxy public client is remote**
   - loopback socket + public `X-Forwarded-For` does not qualify as local
2. **Production loopback fails closed by default**
   - production loopback without explicit trust does not classify as local
3. **Root landing mirrors auth classification**
   - `resolveLandingMode()` returns `personal` for production reverse-proxy traffic
4. **Targeted deploy probe**
   - deployed `/me` and `/inspector/` return `401` without bearer auth
5. **Scope isolation**
   - release candidate diff contains only the intended hotfix files plus release artifacts

## 5. Deployment and Rollout Strategy

- **Strategy**: staging-first
  1. Validate targeted tests and smoke checks on the isolated hotfix branch.
  2. Ship `v0.11.1` as a patch release from the isolated hotfix branch.
  3. Verify deployed endpoints and sandbox version before closing the release.

- **Rollback Plan**
  - Revert the hotfix commit or redeploy `v0.11.0`.
  - Re-run public auth smoke checks against `/me` and `/inspector/`.
  - Keep the advisory in draft/unpublished state if rollout is aborted.

## 6. Post-Release Monitoring

- Monitor unauthenticated access attempts and `401`/`403` patterns for `/me`, `/inspector/`, and related API routes.
- Review access logs for unexpected pre-fix traffic patterns if available.
- Confirm no operator reports of broken local-development workflows after upgrade.
- Track GitHub advisory state, patched version metadata, and eventual CVE assignment.

## 7. Success Criteria

Release prep is complete when:

1. The isolated hotfix branch remains scoped to the intended patch.
2. `docs/releases/in_progress/v0.11.1/` contains the release plan, manifest, schedule, test plan, status tracker, and draft supplement.
3. Targeted validation commands and deployment smoke checks are documented and ready to run.
4. The GitHub Security Advisory draft references the released fix version once chosen.
5. The release is ready for commit/tag/publish workflow without relying on unrelated branch work.
