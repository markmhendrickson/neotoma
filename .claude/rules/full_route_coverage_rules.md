<!-- Source: docs/testing/full_route_coverage_rules.md -->

# Full Route Coverage Rules

**Reference:** `docs/testing/testing_standard.md` — E2E test requirements

## Purpose

Ensures all application routes have E2E test coverage to catch routing, navigation, and component rendering issues across the entire application.

## Scope

This document covers:
- Mandatory E2E test coverage for all application routes
- Route discovery and coverage verification
- Test requirements per route type (list, detail, form, etc.)
- Coverage measurement and reporting

This document does NOT cover:
- Test quality standards (see `docs/testing/test_quality_enforcement_rules.mdc`)
- Test execution workflow (see `docs/conventions/agent_test_execution_rules.mdc`)
- Unit test requirements (see `docs/testing/testing_standard.md`)

## Trigger Patterns

Agents MUST verify and ensure full route coverage when:

- Adding new routes to the application
- Implementing new pages or views
- Refactoring routing configuration
- Conducting test coverage audits
- Preparing releases for deployment
- User requests "full test coverage" or "test all routes"

## Mandatory Requirements

### 1. All Routes Must Have E2E Tests

**MUST:** Every route defined in the application MUST have at least one E2E test that:
- Navigates to the route
- Verifies the page renders
- Tests primary user interaction
- Tests error states

**Routes include:**
- Static routes (e.g., `/sources`, `/entities`)
- Dynamic routes (e.g., `/entities/:id`, `/sources/:id`)
- Conditional routes (e.g., routes behind feature flags)
- Legacy routes (e.g., `/design-system` in LegacyApp)
- Error routes (e.g., `*` for 404)

### 2. Route Discovery Process

**MUST follow this process when ensuring full route coverage:**

1. **Identify all route definition files:**
   - Check `frontend/src/App.tsx` for top-level routing
   - Check `frontend/src/components/MainApp.tsx` for MVP routes
   - Check for `<Route>`, `<Routes>`, or `createBrowserRouter` usage
   - Check for conditional routing (feature flags, legacy components)

2. **Extract all route paths:**
   - List all static routes (e.g., `/sources`)
   - List all dynamic routes (e.g., `/entities/:id`)
   - List all conditional routes (e.g., routes behind feature flags)
   - Include error routes (`*` for 404, error boundaries)

3. **Verify test coverage for each route:**
   - Check if E2E test file exists for route
   - Verify test actually navigates to correct path
   - Verify test covers primary component functionality

4. **Create missing tests:**
   - Create E2E test for any route without coverage
   - Follow naming convention: `{route-name}.spec.ts` or `{feature}-flow.spec.ts`

### 3. Test Requirements Per Route Type

**List Routes** (e.g., `/sources`, `/entities`):
- MUST test list rendering
- MUST test empty state
- MUST test pagination (if applicable)
- MUST test filtering/sorting (if applicable)
- MUST test navigation to detail route

**Detail Routes** (e.g., `/entities/:id`, `/sources/:id`):
- MUST test detail view rendering
- MUST test with valid ID
- MUST test with invalid ID (404 handling)
- MUST test navigation back to list
- MUST test related data display

**Form Routes** (e.g., upload, settings):
- MUST test form rendering
- MUST test form submission (valid data)
- MUST test validation errors
- MUST test success/error states

**Special Routes**:
- MUST test OAuth flows (`/oauth/consent`)
- MUST test error pages (`*` → 404)
- MUST test conditionally rendered routes

### 4. Coverage Verification

**Before marking test coverage complete:**

1. **Generate route inventory:**
   ```bash
   # List all routes from source code
   grep -r "path=" frontend/src | grep Route
   ```

2. **Generate test file inventory:**
   ```bash
   # List all E2E test files
   ls playwright/tests/*.spec.ts
   ```

3. **Create coverage matrix:**
   - Map each route to its test file(s)
   - Identify routes without tests
   - Document coverage percentage

4. **Verify 100% coverage:**
   - MUST have at least one E2E test per route
   - MUST verify tests actually navigate to correct paths
   - MUST verify tests run successfully

## Route Coverage Matrix Template

Maintain a route coverage matrix in test documentation:

```markdown
| Route | Component | Test File | Status |
|-------|-----------|-----------|--------|
| / | MCPConfigurationPage | mcp-configuration.spec.ts | ✅ |
| /sources | SourceTable | sources-list.spec.ts | ✅ |
| /sources/:id | SourceDetail | source-detail.spec.ts | ✅ |
| /entities | EntityList | entity-list.spec.ts | ✅ |
| /entities/:id | EntityDetail | entity-detail.spec.ts | ✅ |
| /interpretations | InterpretationList | interpretations.spec.ts | ❌ Missing |
| ... | ... | ... | ... |
```

**Update this matrix:**
- When adding new routes
- When creating new E2E tests
- During test coverage audits

## Agent Actions

### When Ensuring Full Route Coverage

1. **Discover all routes:**
   - Read routing configuration files
   - Extract all route paths
   - Include conditional and legacy routes

2. **Check existing test coverage:**
   - List all E2E test files
   - Map tests to routes
   - Identify gaps

3. **Create missing tests:**
   - For each uncovered route, create E2E test
   - Follow test naming conventions
   - Include all mandatory test cases

4. **Verify coverage:**
   - Generate coverage matrix
   - Confirm 100% route coverage
   - Document any intentional exclusions

### When Adding New Routes

**MUST create E2E test for new route during same PR:**

1. Create route in routing configuration
2. Implement component
3. **Create E2E test immediately** (not "later")
4. Verify test passes
5. Update coverage matrix

## Test Naming Conventions

**Route-specific tests:**
- List routes: `{entity-name}-list.spec.ts` (e.g., `sources-list.spec.ts`)
- Detail routes: `{entity-name}-detail.spec.ts` (e.g., `source-detail.spec.ts`)
- Special routes: `{feature-name}.spec.ts` (e.g., `oauth-consent.spec.ts`, `not-found.spec.ts`)

**Flow-based tests:**
- User flows: `{flow-name}-flow.spec.ts` (e.g., `upload-flow.spec.ts`)
- Multi-step: `{feature-name}-workflow.spec.ts` (e.g., `correction-workflow.spec.ts`)

## Examples

### ✅ Correct: Full Route Coverage

```typescript
// All routes have tests
/ → mcp-configuration.spec.ts
/sources → sources-list.spec.ts
/sources/:id → source-detail.spec.ts
/entities → entity-list.spec.ts
/entities/:id → entity-detail.spec.ts
/interpretations → interpretations.spec.ts
/observations → observations.spec.ts
/schemas → schemas-list.spec.ts
/schemas/:entityType → schema-detail.spec.ts
/relationships → relationships-list.spec.ts
/relationships/:id → relationship-detail.spec.ts
/timeline → timeline.spec.ts
/search → search.spec.ts
/oauth/consent → oauth-consent.spec.ts
/design-system → design-system.spec.ts (active in MainApp)
* → not-found.spec.ts

Coverage: 17/17 routes (100%) ✅
```

### ❌ Incorrect: Partial Route Coverage

```typescript
// Only some routes tested
/entities → entity-list.spec.ts ✅
/entities/:id → entity-detail.spec.ts ✅
/timeline → timeline.spec.ts ✅
/search → search.spec.ts ✅

// Missing tests for:
/ (11 routes without tests) ❌

Coverage: 4/16 routes (25%) ❌
```

### ❌ Incorrect: Tests for Non-Existent Routes

```typescript
// Tests reference routes that don't exist
dashboard.spec.ts → Tests /dashboard (route doesn't exist) ❌
mcp-configuration.spec.ts → Tests /settings/mcp (route doesn't exist) ❌
upload-flow.spec.ts → Tests /upload (route doesn't exist) ❌

// Tests won't run because routes don't match actual application
```

## Coverage Requirements

**Minimum route coverage: 100%**

- Every route MUST have at least one E2E test
- Tests MUST navigate to actual route paths
- Tests MUST verify primary component renders
- Tests MAY share test files for related routes (list + detail)

**Exceptions:**
- Internal/redirect-only routes
- Routes explicitly documented as not requiring tests
- Routes behind disabled feature flags (document why excluded)

## Constraints

Agents MUST:
- Discover all routes (including conditional and legacy)
- Create E2E tests for 100% of routes
- Verify tests use correct route paths
- Update coverage matrix when routes change
- Create tests alongside route implementation

Agents MUST NOT:
- Skip route coverage verification
- Create tests for non-existent routes
- Assume routes don't need tests
- Mark coverage complete without 100% route coverage
- Defer test creation to "later"

## Validation Checklist

Before marking E2E test coverage complete:

- [ ] All routes discovered (main app, legacy app, conditional)
- [ ] Coverage matrix created showing all routes
- [ ] E2E test exists for every route (100% coverage)
- [ ] All tests use correct route paths (match actual routes)
- [ ] All tests verify component rendering
- [ ] All tests verify primary user interactions
- [ ] Tests for conditional routes documented
- [ ] Coverage matrix updated in documentation

## Integration with Existing Rules

This rule extends `.claude/rules/conventions_ui_test_requirements_rules.mdc`:

**Existing rule:** "Write Playwright tests **when** creating/modifying UI components"  
**This rule:** "Ensure 100% route coverage **exists** for all routes"

Both apply:
- When creating/modifying → write tests immediately (existing rule)
- When auditing/ensuring full coverage → verify 100% route coverage (this rule)

## Why This Rule Was Added

**Date Added**: 2026-01-23

**Reason**: Previous test coverage implementation achieved only 27% route coverage (4/16 routes) because:

1. **Existing UI test rules** trigger only for **changes** ("when creating/modifying UI components")
2. **No rule mandated** testing **all existing routes**
3. **"Full test coverage" request** was interpreted as following test quality standards, not route completeness
4. **Tests were created** for non-existent routes (e.g., `/dashboard`, `/upload`, `/settings/mcp`)

This rule now explicitly mandates:
- **100% route coverage** for E2E tests
- **Route discovery process** to find all routes (including conditional/legacy)
- **Verification** that tests use correct paths
- **Coverage matrix** to track route-to-test mapping

## Related Documents

- `.claude/rules/conventions_ui_test_requirements_rules.mdc` — UI test requirements for changes
- `docs/testing/testing_standard.md` — E2E test requirements
- `docs/conventions/agent_test_execution_rules.mdc` — Test execution workflow
- `docs/testing/ROUTE_COVERAGE_MATRIX.md` — Current route coverage tracking

## Agent Instructions

### When to Load This Document

Load this document when:
- User requests "full test coverage" or "test all routes"
- Conducting test coverage audits
- Preparing releases for deployment
- Adding new routes to application

### Required Co-Loaded Documents

- `docs/testing/testing_standard.md` — Testing requirements
- `.claude/rules/conventions_ui_test_requirements_rules.mdc` — UI test requirements

### Constraints Agents Must Enforce

1. **MANDATORY 100% route coverage** — Every route must have E2E tests
2. **MANDATORY route discovery** — Find all routes (main, legacy, conditional)
3. **MANDATORY correct paths** — Tests must use actual route paths
4. **MANDATORY coverage matrix** — Document route-to-test mapping

### Forbidden Patterns

- Partial route coverage (less than 100%)
- Tests for non-existent routes
- Skipping conditional or legacy routes
- Assuming existing tests cover all routes without verification
- Creating tests without verifying actual route paths

### Validation Checklist

Before marking route coverage complete:
- [ ] All routes discovered and listed
- [ ] E2E test exists for every route
- [ ] All tests navigate to correct paths
- [ ] Coverage matrix shows 100% coverage
- [ ] Tests run successfully
- [ ] Documentation updated
