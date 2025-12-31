# Pull Request Template
## Feature Unit ID (if applicable)
`fu_YYYY_MM_NNN` or N/A
## Description
Brief description of changes.
## Type of Change
- [ ] New Feature Unit
- [ ] Bug fix
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Test additions
## Risk Level
- [ ] Low
- [ ] Medium
- [ ] High
See `docs/private/governance/risk_classification.md` for classification.
## Documentation Loaded
List foundational and subsystem docs loaded before implementation:
- [ ] `docs/NEOTOMA_MANIFEST.md`
- [ ] `docs/subsystems/[relevant].md`
- [ ] Other: _______________
## Changes
### Code Changes
- File 1: Description
- File 2: Description
### Schema Changes
- [ ] No schema changes
- [ ] Schema changes (migration file: _______________)
### API/MCP Changes
- [ ] No API changes
- [ ] New/modified actions: _______________
### UI Changes
- [ ] No UI changes
- [ ] New/modified components: _______________
## Testing
### Tests Added/Modified
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
### Coverage
- Lines: ___%
- Branches: ___%
- Critical paths: ___%
### Tests Pass Locally
- [ ] All tests pass
- [ ] No flaky tests introduced
## Observability
### Metrics Added
- Metric 1: _______________
- Metric 2: _______________
### Logs Added
- Log 1: _______________
- Log 2: _______________
### Events Emitted
- Event 1: _______________
## Checklist (from `docs/private/governance/review_checklist_mark.md`)
- [ ] Respects Truth Layer boundaries
- [ ] Deterministic (if applicable)
- [ ] Tests verify determinism
- [ ] Schema changes are additive
- [ ] RLS policies maintained
- [ ] No PII in logs
- [ ] Keyboard accessible (if UI)
- [ ] ARIA labels present (if UI)
- [ ] Translatable strings (if UI)
- [ ] Documentation updated
- [ ] Rollback plan documented (if high-risk)
## Rollback Plan (if high-risk)
Steps to rollback if issues occur:
1. Step 1
2. Step 2
## Reviewer Notes
Additional context for reviewers:
