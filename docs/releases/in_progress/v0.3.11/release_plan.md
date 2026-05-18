---
title: "Release v0.3.11 — Outstanding Changes Consolidation"
summary: "- **Release ID**: `v0.3.11` - **Name**: Outstanding Changes Consolidation - **Release Type**: Not Marketed - **Goal**: Ship all currently outstanding repository changes in one coordinated patch release with explicit reliability validatio..."
---

# Release v0.3.11 — Outstanding Changes Consolidation

## 1. Release Overview

- **Release ID**: `v0.3.11`
- **Name**: Outstanding Changes Consolidation
- **Release Type**: Not Marketed
- **Goal**: Ship all currently outstanding repository changes in one coordinated patch release with explicit reliability validation, docs consistency, and deployment safety checks.
- **Priority**: P0
- **Target Ship Date**: ASAP (when checks pass)
- **Marketing Required**: No

## 2. Scope

### 2.1 Included Scope

This release includes all currently outstanding changes in the working tree, grouped into release workstreams:

- **RS-001 Retrieval Reliability and Parity**
  - lexical retrieval fallback improvements
  - identifier retrieval parity across MCP/REST
  - user isolation and pagination-total correctness hardening
  - new retrieval reliability integration tests

- **RS-002 CLI and Instructions Contract Alignment**
  - CLI alias compatibility improvements (`entities search --query`, `store --json=<...>`)
  - atomic `store-turn` command
  - developer docs and MCP interaction-instructions contract alignment

- **RS-003 Site, Docs, and Localization Updates**
  - docs updates and generated site pages
  - i18n/runtime and localized pack updates
  - static site rebuild outputs and SEO/page-generation changes

- **RS-004 CI/QA Updates**
  - workflow and Playwright updates
  - command/test guard updates

Inventory coverage is tracked in `outstanding_changes_inventory.md` with a current snapshot of **556** outstanding paths and explicit path-to-workstream mapping.

### 2.2 Explicitly Excluded

- New feature-unit creation beyond already modified code
- Schema-model redesigns not already present in current changes
- New product/marketing launch content

## 3. Release-Level Acceptance Criteria

### 3.1 Product

- Retrieval/search behavior remains stable and improved for report-style queries.
- CLI workflows remain backward-compatible and deterministic.
- Generated site/docs render and route correctly for updated pages/locales.

### 3.2 Technical

- Reliability regression tests pass for:
  - MCP/REST identifier retrieval parity
  - user isolation in retrieval endpoints
  - observations pagination totals
  - `store-turn` idempotency/default-key behavior
- Existing high-signal CLI and retrieval integration tests pass.
- TypeScript build passes with no compile errors.

### 3.3 Business/Operational

- Release can be shipped without ad hoc recovery steps.
- No known cross-user data leakage in covered retrieval surfaces.
- Release package is reproducible from documented commands.

## 4. Cross-Workstream Integration Scenarios

The following scenarios must pass before release sign-off:

1. **CLI -> REST -> Retrieval**
   - `entities search` with positional, `--identifier`, and `--query` produces consistent behavior.
2. **MCP/REST Identifier Parity**
   - same identifier query returns equivalent entity IDs across transports.
3. **Observation Pagination Semantics**
   - `total` reflects full count, not page length.
4. **Atomic Turn Store**
   - `store-turn` writes conversation + message + relationships in one call and replays safely with idempotency key.
5. **Site/Docs Build Integrity**
   - generated site output is internally consistent and build pipelines complete successfully.

## 5. Deployment and Rollout Strategy

- **Strategy**: staging-first
  1. Run release validation commands locally/CI.
  2. Deploy to staging and run smoke checks.
  3. Promote to production when smoke checks pass.

- **Rollback Plan**
  - Revert release commit set and redeploy previous known-good tag.
  - Re-run retrieval smoke checks and docs/site smoke checks on rollback target.

## 6. Post-Release Monitoring

- Monitor retrieval-related error rates and endpoint latencies.
- Monitor CLI command failure rates for search/store workflows.
- Watch deploy/build health for docs/site pipeline.
- Verify no unexpected cross-user retrieval incidents.

## 7. Success Criteria

Release is complete when:

1. Outstanding change set is reviewed and grouped into final release commits.
2. Integration test matrix in `integration_tests.md` is green.
3. Staging smoke tests pass.
4. Production deployment completes without rollback.
5. Status is updated to `completed` with release notes summary.

