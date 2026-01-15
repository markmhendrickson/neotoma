# Bug Learning Protocol Established

**Date**: 2026-01-15  
**Status**: ✅ Active

## Instruction Documented

User provided permanent instruction:

> "always increase automated test coverage and integrate learnings into foundation rules when bugs are found"

## Rule Created

**Location**: `docs/developer/bug_learning_rules.mdc`  
**Synced to**: `.cursor/rules/developer_bug_learning_rules.mdc`  
**Status**: Active and enforced by agents

## What This Rule Enforces

When ANY bug is discovered, agents MUST:

### 1. Fix + Regression Test (Mandatory)
- Fix the bug
- Add test that would have caught it
- Test must fail before fix, pass after

### 2. Analyze Gap (Mandatory)
- Document why existing tests missed it
- Create analysis: `docs/reports/{BUG_NAME}_TEST_COVERAGE_GAPS.md`
- Include root cause and specific examples

### 3. Strengthen Tests (Mandatory)
- Add tests to fill identified gaps
- Cover edge cases that were missing
- Use strong assertions
- Verify database state

### 4. Evaluate Generalization (Mandatory)
- Assess if learnings are 80%+ generic
- If yes → generalize to foundation
- If no → keep in repository
- Document decision

### 5. Generalize to Foundation (If Applicable)
- Extract generic principles
- Create/update foundation document
- Update repository document to reference foundation
- Keep repository-specific applications

### 6. Document Learning (Mandatory)
- Create summary: `docs/reports/{BUG_NAME}_LEARNING_SUMMARY.md`
- Include what happened, why tests missed it, what we learned
- Document rules created/updated
- Explain how future bugs will be caught

### 7. Sync Rules (Mandatory)
- Run `bash foundation/scripts/setup_cursor_copies.sh`
- Verify rules appear in `.cursor/rules/`
- Ensure agents have access to new rules

## Example: Auto-Enhancement Bugs (2026-01-15)

**Applied this protocol:**

1. ✅ Fixed 4 bugs (foreign key, observation query, fragment queries)
2. ✅ Added regression tests (manual verification scripts)
3. ✅ Analyzed gaps → `docs/reports/AUTO_ENHANCEMENT_TEST_COVERAGE_GAPS.md`
4. ✅ Strengthened tests → Created quality rules with specific patterns
5. ✅ Evaluated → 95% generic, should generalize
6. ✅ Generalized → `foundation/conventions/testing_conventions.md`
7. ✅ Documented → `docs/reports/TEST_QUALITY_LEARNING_SUMMARY.md`
8. ✅ Synced → Rules active in `.cursor/rules/`

**Result:**
- Generic testing principles now in foundation
- Neotoma applies foundation to specifics
- Future bugs of this type will be caught
- Other repos can benefit from lessons learned

## Workflow Diagram

```
Bug Discovered
    ↓
1. Fix bug
    ↓
2. Add regression test
    ↓
3. Analyze: Why did tests miss it?
    ↓
4. Document gap analysis
    ↓
5. Add tests to fill gaps
    ↓
6. Evaluate: 80%+ generic?
    ↓
    ├─→ YES (80%+ generic)
    │   ├─→ Extract principles
    │   ├─→ Create/update foundation doc
    │   ├─→ Update repo doc to reference
    │   └─→ Document: Foundation contains X, repo contains Y
    │
    └─→ NO (mostly specific)
        ├─→ Document in repo rules
        └─→ Reference foundation where applicable
    ↓
7. Document learning summary
    ↓
8. Sync rules: setup_cursor_copies.sh
    ↓
Done: Agents enforce automatically
```

## Enforcement

**This rule is now active.**

Agents will:
- Detect when bugs are found
- Require regression tests
- Require gap analysis
- Require test improvements
- Require generalization evaluation
- Require learning documentation
- Reject bug fixes that skip these steps

**Location**: `.cursor/rules/developer_bug_learning_rules.mdc`

## Integration with Existing Rules

**Works with:**
- `.cursor/rules/bug_fix_detection.mdc` — Bug fix workflow
- `.cursor/rules/instruction_documentation.mdc` — Rule creation
- `docs/testing/integration_test_quality_rules.mdc` — Test quality standards
- `foundation/conventions/testing_conventions.md` — Generic testing principles

**Extends bug fix workflow with:**
- Mandatory test coverage analysis
- Mandatory test improvements
- Mandatory foundation generalization evaluation
- Mandatory learning documentation

## Success Metrics

**Before this rule:**
- Bugs fixed reactively
- Test coverage improvements optional
- Learnings stayed siloed
- No systematic generalization

**After this rule:**
- Bugs trigger systematic improvement
- Test coverage improvements mandatory
- Learnings documented and shared
- Generalization evaluated systematically

**Target:**
- 100% of bugs result in test improvements
- 100% of bugs analyzed for test gaps
- 80%+ generic learnings generalized to foundation
- 0% of similar bugs repeated

## Validation

This rule ensures:
- ✅ Every bug improves test coverage
- ✅ Test gaps are systematically identified
- ✅ Generic learnings benefit all repos
- ✅ Specific learnings documented in repo
- ✅ Future similar bugs are caught by tests
- ✅ Continuous improvement is systematic, not ad hoc

## Related Documents

- [`docs/developer/bug_learning_rules.mdc`](../developer/bug_learning_rules.mdc) — Complete rule specification
- [`.cursor/rules/developer_bug_learning_rules.mdc`](../../.cursor/rules/developer_bug_learning_rules.mdc) — Active agent rule
- [`docs/reports/AUTO_ENHANCEMENT_TEST_COVERAGE_GAPS.md`](./AUTO_ENHANCEMENT_TEST_COVERAGE_GAPS.md) — Example gap analysis
- [`docs/reports/TEST_QUALITY_LEARNING_SUMMARY.md`](./TEST_QUALITY_LEARNING_SUMMARY.md) — Example learning doc
- [`foundation/conventions/testing_conventions.md`](../../foundation/conventions/testing_conventions.md) — Generic principles
