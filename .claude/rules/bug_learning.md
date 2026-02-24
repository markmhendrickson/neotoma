---
alwaysApply: true
---

<!-- Source: foundation/agent_instructions/cursor_rules/bug_learning.mdc -->


# Bug Learning and Continuous Improvement Rules

## Purpose

Ensures that when bugs are discovered, agents systematically improve both test coverage and foundation rules to prevent similar bugs in the future.

## Scope

This document covers:
- Required actions when bugs are discovered
- Test coverage improvement requirements
- Foundation rule generalization process
- Learning documentation requirements

This document does NOT cover:
- Bug fix workflow (see foundation `bug_fix_detection.mdc`)
- Testing standards (see repository testing standards)
- Rule creation process (see foundation `instruction_documentation.mdc`)

## Core Instruction

**ALWAYS increase automated test coverage and integrate learnings into foundation rules when bugs are found.**

## Trigger Patterns

When any bug is discovered through:
- Manual testing
- Production incidents
- User reports
- Integration testing gaps
- Code review findings
- Runtime errors

Agents MUST:
1. Fix the bug
2. Add regression test
3. Analyze why existing tests missed it
4. Strengthen test coverage
5. Evaluate if learnings should be generalized to foundation

## Mandatory Actions When Bugs Are Found

### Step 1: Fix the Bug

Follow standard bug fix workflow (see foundation `bug_fix_detection.mdc`).

### Step 2: Add Regression Test

**MUST add test that would have caught the bug.**

**Requirements:**
- Test must fail before fix
- Test must pass after fix
- Test must exercise the specific code path that had the bug
- Test must verify the specific condition that was broken

### Step 3: Analyze Test Coverage Gap

**MUST document why existing tests missed the bug.**

**Required analysis:**
1. What test coverage existed?
2. Why did it not catch the bug?
3. What was wrong with the test approach?
4. What test patterns were missing?

**Create analysis document:**
- Location: `docs/reports/{BUG_NAME}_TEST_COVERAGE_GAPS.md` (or repository equivalent)
- Contents: Detailed analysis of why tests missed the bug
- Include: Specific test code that would have caught it
- Include: Root cause analysis (mocking, weak assertions, missing edge cases, etc.)

### Step 4: Strengthen Test Coverage

**MUST add tests that fill the identified gaps.**

**Required new tests:**
1. **Edge case tests** if bug was in edge case handling
2. **Integration tests without mocks** if bug was hidden by mocks
3. **Strong assertion tests** if weak assertions allowed bug to pass
4. **Foreign key tests** if bug was FK-related
5. **Database state verification tests** if bug left incorrect state
6. **Complete workflow tests** if bug was in multi-step process

**Add to appropriate test file** per repository structure (unit, integration, E2E).

### Step 5: Evaluate Foundation Generalization

**MUST assess if learnings apply to other repositories.**

**Questions to answer:**
1. Is this bug pattern specific to this repo or generic?
2. Would other repositories benefit from this lesson?
3. Are the test improvements generic or specific?
4. Should new rules be added to foundation?

**If 80%+ generic → Generalize to foundation:**
1. Extract generic principles
2. Create or update foundation document
3. Update repository document to reference foundation
4. Keep repository-specific applications separate

**If mostly specific → Keep in repository:**
1. Document in repository rules
2. Reference foundation where applicable
3. No foundation changes needed

### Step 6: Document Learning

**MUST create learning summary document.**

**Location**: `docs/reports/{BUG_NAME}_LEARNING_SUMMARY.md` (or repository equivalent)

**Contents:**
- What happened (bug summary)
- Why tests missed it (root cause)
- What we learned (principles)
- Rules created/updated (with links)
- Impact assessment (before/after)
- Validation (how future bugs will be caught)

## Constraints

Agents MUST:
- Add regression test when fixing bugs (never fix without test)
- Analyze why existing tests missed the bug
- Document test coverage gaps
- Add tests to fill identified gaps
- Evaluate if learnings are generic (80%+ → foundation)
- Generalize to foundation when appropriate
- Document learning summary
- Sync rules to `.claude/rules/` when repository uses setup_cursor_copies

Agents MUST NOT:
- Fix bugs without adding regression tests
- Skip gap analysis ("tests just missed it")
- Skip test coverage improvements
- Skip foundation generalization evaluation
- Keep generic learnings siloed in repository
- Leave learning undocumented

## Related Documents

- Foundation `bug_fix_detection.mdc` — Bug fix workflow
- Foundation `instruction_documentation.mdc` — Rule creation process
- Repository testing standards
- Foundation testing conventions (if present)
