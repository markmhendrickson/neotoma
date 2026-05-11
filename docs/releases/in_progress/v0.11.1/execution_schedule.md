# Release v0.11.1 — Execution Schedule

## Batch Plan

### Batch 0: Finalize Hotfix Patch Scope
- **Workstreams**: HS-001, HS-002, HS-003
- **Focus**:
  - verify `src/actions.ts` contains only the minimal auth-bypass fix
  - verify `src/services/root_landing/index.ts` mirrors the same production-safe classification
  - confirm the three focused test files cover the regression surface
- **Commands**:
```bash
git diff --stat v0.11.0..HEAD
git status --short
```
- **Exit criteria**:
  - only intended hotfix paths and release artifacts are present
  - no unrelated branch work is included in the release candidate

### Batch 1: Validate Security Behavior
- **Workstreams**: HS-003
- **Focus**:
  - targeted test coverage
  - direct behavior smoke checks for local classification and landing mode
- **Commands**:
```bash
npx vitest run tests/integration/tunnel_auth.test.ts tests/integration/root_landing.test.ts tests/unit/security_hardening.test.ts
npm run build:server
```
- **Exit criteria**:
  - targeted auth/landing-mode regression tests pass
  - server build succeeds in a properly provisioned environment

### Batch 2: Release and Advisory Readiness
- **Workstreams**: HS-004
- **Focus**:
  - release-note accuracy
  - security-advisory metadata alignment
  - deployment smoke-test plan readiness
- **Commands**:
```bash
npm run -s release-notes:render -- --tag v0.11.1 --head-ref HEAD --supplement docs/releases/in_progress/v0.11.1/github_release_supplement.md
curl -i https://neotoma.markmhendrickson.com/me
curl -i https://neotoma.markmhendrickson.com/inspector/
```
- **Exit criteria**:
  - draft supplement accurately reflects the hotfix scope
  - preview release body is ready for user approval
  - deployment probes and advisory follow-up steps are documented

## Sign-Off Gate

Release prep is ready for execution when:
- Batch 0, 1, and 2 exit criteria are met
- the hotfix branch is committed without unrelated paths
- the GitHub Security Advisory can be updated to name `v0.11.1` as the patched version
- the status tracker is updated to `ready_for_deployment`
