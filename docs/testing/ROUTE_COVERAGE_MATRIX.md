---
title: Route Coverage Matrix
summary: "**Date**: 2026-01-23 **Purpose**: Track E2E test coverage for all application routes"
---

# Route Coverage Matrix

**Date**: 2026-01-23  
**Purpose**: Track E2E test coverage for all application routes

> Update (2026-04-15): Operational routes such as `/sources`, `/entities`, `/observations`, `/relationships`, and `/schemas` have moved to the Inspector app. This matrix is historical for the legacy in-repo operational UI. Current operational UI lives in the Inspector submodule/repo: [neotoma-inspector](https://github.com/markmhendrickson/neotoma-inspector).

## Coverage Summary

**Current Coverage: 16/16 routes (100%)**

- ✅ Covered: 16 routes
- ❌ Missing: 0 routes

**Status**: ✅ **100% Route Coverage Achieved**

## Route Coverage Matrix

### Active Routes (useMvpUI = true, MainApp.tsx)

**All 16 routes below are active in the MVP UI:**

| Route | Component | Test File | Status | Notes |
|-------|-----------|-----------|--------|-------|
| `/` | MCPConfigurationPage | mcp-configuration.spec.ts | ✅ | Fixed to test correct route |
| `/sources` | SourceTable | sources-list.spec.ts | ✅ | Created |
| `/sources/:id` | SourceDetail | source-detail.spec.ts | ✅ | Created |
| `/entities` | EntityList | entity-list.spec.ts | ✅ | Pre-existing |
| `/entities/:id` | EntityDetail | entity-detail.spec.ts | ✅ | Pre-existing |
| `/interpretations` | InterpretationList | interpretations.spec.ts | ✅ | Created |
| `/observations` | ObservationList | observations.spec.ts | ✅ | Created |
| `/schemas` | SchemaList | schemas-list.spec.ts | ✅ | Created |
| `/schemas/:entityType` | SchemaDetail | schema-detail.spec.ts | ✅ | Created |
| `/relationships` | RelationshipList | relationships-list.spec.ts | ✅ | Created |
| `/relationships/:id` | RelationshipDetail | relationship-detail.spec.ts | ✅ | Created |
| `/timeline` | TimelineView | timeline-navigation.spec.ts | ✅ | Pre-existing |
| `/search` | SearchResults | search-flow.spec.ts | ✅ | Pre-existing |
| `/oauth/consent` | OAuthConsentPage | oauth-flow.spec.ts | ✅ | Enhanced with direct tests |
| `/design-system` | StyleGuide | design-system.spec.ts | ✅ | Created (now active in MainApp) |
| `*` (404) | NotFound | not-found.spec.ts | ✅ | Created |

## Existing E2E Tests (Pre-existing)

These tests already existed and provide additional coverage:

| Test File | Routes Covered | Status |
|-----------|----------------|--------|
| oauth-flow.spec.ts | `/oauth/consent` | ✅ Partial |
| ingestion-pipeline.spec.ts | Upload dialog | ✅ |
| record-details.spec.ts | Legacy record details | ✅ |
| chat-panel.spec.ts | Legacy chat | ✅ |
| settings-keys.spec.ts | Legacy settings | ✅ |
| error-handling.spec.ts | Error states | ✅ |
| entity-explorer.spec.ts | Entity explorer | ✅ Enhanced |
| timeline-navigation.spec.ts | Timeline | ✅ Enhanced |

## Implementation Summary

### Phase 1: Fixed Misaligned Tests (Completed)

1. ✅ **mcp-configuration.spec.ts** - Fixed to test `/` instead of `/settings/mcp`
2. ✅ **dashboard.spec.ts** - Deleted (route doesn't exist)
3. ✅ **upload-flow.spec.ts** - Fixed to test upload dialog workflow instead of `/upload` route

### Phase 2: Created Missing Tests (Completed)

1. ✅ **sources-list.spec.ts** - Tests `/sources` route
2. ✅ **source-detail.spec.ts** - Tests `/sources/:id` route
3. ✅ **interpretations.spec.ts** - Tests `/interpretations` route
4. ✅ **observations.spec.ts** - Tests `/observations` route
5. ✅ **schemas-list.spec.ts** - Tests `/schemas` route
6. ✅ **schema-detail.spec.ts** - Tests `/schemas/:entityType` route
7. ✅ **relationships-list.spec.ts** - Tests `/relationships` route
8. ✅ **relationship-detail.spec.ts** - Tests `/relationships/:id` route
9. ✅ **oauth-flow.spec.ts** - Enhanced with direct `/oauth/consent` tests
10. ✅ **not-found.spec.ts** - Tests 404 error page
11. ✅ **design-system.spec.ts** - Tests `/design-system` route

### Phase 3: Documentation Updated (Completed)

- ✅ Route Coverage Matrix updated to show 100% coverage
- ✅ All test files documented in matrix
- ✅ Coverage status updated from 24% to 100%

## Coverage Tracking

This matrix is updated:
- ✅ When new route tests are created
- ✅ When routes are added/removed
- ✅ During test coverage audits
- ✅ Before releases

**Achievement**: ✅ **100% route coverage (16/16) - January 23, 2026**

## Route Migration Note

**2026-01-23**: `/design-system` migrated from LegacyApp to MainApp
- Previously: Only accessible when `useMvpUI = false`
- Now: Active route in MainApp (line 367)
- Accessible via: Direct navigation or keyboard shortcut (Ctrl/Cmd + Shift + S)

## Related Documents

- `docs/testing/full_route_coverage_rules.md` — Full route coverage requirements
- `.cursor/rules/conventions_ui_test_requirements_rules.mdc` — UI test requirements
- `docs/testing/testing_standard.md` — Testing standards
