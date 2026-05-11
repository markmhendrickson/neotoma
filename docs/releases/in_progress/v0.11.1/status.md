# Release v0.11.1 — Status

**Release**: Inspector Auth Bypass Hotfix  
**Release Type**: Not Marketed  
**Deployment**: Production (staging-first rollout)  
**Status**: `in_progress`  
**Last Updated**: 2026-05-11

---

## Phase Status

| Phase | Status | Progress |
| --- | --- | --- |
| Batch 0: Finalize hotfix scope | Complete | 1/1 |
| Batch 1: Validate security behavior | Complete | 1/1 |
| Batch 2: Release/advisory readiness | In Progress | 0/1 |

---

## Workstream Status

| Workstream | Status | Notes |
| --- | --- | --- |
| HS-001 Auth classification hardening | Complete | Minimal `isLocalRequest` fix isolated on hotfix branch |
| HS-002 Root landing parity | Complete | Matching production-safe local classification validated in focused tests |
| HS-003 Regression coverage | Complete | Targeted integration/unit tests and build passed in the isolated worktree |
| HS-004 Release/advisory prep | In Progress | Hotfix release docs and draft supplement started |

---

## Validation Snapshot

- [x] Isolated hotfix worktree created from `v0.11.0`
- [x] Only the intended 5 hotfix code/test files are modified before release docs
- [x] Targeted runtime smoke checks were recorded during patch isolation
- [x] No lint diagnostics reported for the touched hotfix files
- [x] Targeted Vitest suites run in the isolated release environment
- [x] `npm run build:server` passed in the isolated release environment
- [x] Final release body preview rendered for approval
- [ ] Post-deploy protected-route probes confirmed

---

## Decision Log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-05-11 | Prepare patch release as `v0.11.1` | Isolated hotfix branch was cut from `v0.11.0`, making the next patch version the natural hotfix target |
| 2026-05-11 | Limit scope to the isolated Inspector auth bypass patch | Prevent unrelated working-tree changes from entering the hotfix |
| 2026-05-11 | Use staging-first rollout | Security fix is small but auth-sensitive; a staged verification step lowers release risk |
| 2026-05-11 | Link shared `node_modules` into the hotfix worktree for validation | The isolated checkout had no local dependency install, so Vitest/build could not resolve packages until the worktree reused the main repo dependency tree |
