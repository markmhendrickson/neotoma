---
name: Test coverage audit and frontend cleanup
overview: First remove orphan marketing subpages not reachable at localhost (Part B). Then run the qualitative test coverage audit (Part A) so dead code is not in scope for coverage or manual-testing notes.
todos:
  - id: verify_orphans
    content: Re-verify orphan subpage files (no imports outside own file) and scan site_data/seo/playwright for path references
    status: completed
  - id: delete_orphan_pages
    content: Delete confirmed orphan *Page.tsx files under frontend/src/components/subpages/
    status: completed
    dependencies:
      - verify_orphans
  - id: post_delete_build
    content: Run frontend build and validate site scripts (e.g. validate:site-export, validate:route parity if applicable)
    status: completed
    dependencies:
      - delete_orphan_pages
  - id: coverage_audit_part_a
    content: Qualitative test coverage audit (layers, gaps, where manual testing remains) after frontend tree is trimmed
    status: completed
    dependencies:
      - post_delete_build
isProject: false
---

# Test coverage audit and frontend cleanup

## Order of work

1. **Part B first** — Delete unreachable orphan page components. They add noise to the tree and do not need test coverage.
2. **Part A second** — Map automated coverage and manual-testing reliance against the **trimmed** `frontend/src` surface (and the rest of the repo).

## Relationship to “Frontend App” vs site

The **marketing site and homepage** live in the same `[frontend/src/](frontend/src/)` tree as the rest of the UI. The **public site shell** is `[MainApp](frontend/src/components/MainApp.tsx)` only (`[App.tsx](frontend/src/App.tsx)` renders `MainApp`).

**Reachable at `http://localhost:5195/`** means: any path that resolves to a `<Route>` in `MainApp` (including `APP_ROUTES`, `/markdown/*`, locale-prefixed copies, and explicit redirects like `/quick-start` → `/install`). Anything not matched falls through to `<NotFound />`.

## Part B — Remove unused frontend pages (not reachable)

### Problem

`[MainApp.tsx](frontend/src/components/MainApp.tsx)` wires routes via `APP_ROUTES` and redirects. **Older standalone page components** were superseded by **hash navigation** on consolidated pages (e.g. `/memory-guarantees#…`, `/memory-models#…`, `/foundations#…`). Those standalone files remain **dead code**: they are **not** imported anywhere, so they never render at any URL including `localhost:5195`.

### Candidate orphan files (verify before delete)

Ripgrep shows **no** `import ... from` of these modules outside their own definition file. They are candidates for deletion:


| File                                                                                                                  | Notes                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `[ReproducibleStateReconstructionPage.tsx](frontend/src/components/subpages/ReproducibleStateReconstructionPage.tsx)` | Route uses `Navigate` to `/memory-guarantees#reproducible-state-reconstruction` |
| `[PrivacyFirstPage.tsx](frontend/src/components/subpages/PrivacyFirstPage.tsx)`                                       | Route uses `Navigate` to `/foundations#privacy-first`                           |
| `[VersionedHistoryPage.tsx](frontend/src/components/subpages/VersionedHistoryPage.tsx)`                               | Hash on memory-guarantees                                                       |
| `[DockerPage.tsx](frontend/src/components/subpages/DockerPage.tsx)`                                                   | `/docker` redirects to `/install#docker`                                        |
| `[QuickStartPage.tsx](frontend/src/components/subpages/QuickStartPage.tsx)`                                           | `/quick-start` redirects to `/install`                                          |
| `[SilentMutationRiskPage.tsx](frontend/src/components/subpages/SilentMutationRiskPage.tsx)`                           | Hash redirect                                                                   |
| `[MemoryVendorsPage.tsx](frontend/src/components/subpages/MemoryVendorsPage.tsx)`                                     | Hash redirect                                                                   |
| `[DeterministicMemoryPage.tsx](frontend/src/components/subpages/DeterministicMemoryPage.tsx)`                         | Hash redirect                                                                   |
| `[PlatformMemoryPage.tsx](frontend/src/components/subpages/PlatformMemoryPage.tsx)`                                   | Hash redirect                                                                   |
| `[FileBasedMemoryPage.tsx](frontend/src/components/subpages/FileBasedMemoryPage.tsx)`                                 | Hash redirect                                                                   |
| `[RetrievalMemoryPage.tsx](frontend/src/components/subpages/RetrievalMemoryPage.tsx)`                                 | Hash redirect                                                                   |
| `[SemanticSimilaritySearchPage.tsx](frontend/src/components/subpages/SemanticSimilaritySearchPage.tsx)`               | Hash redirect                                                                   |
| `[SchemaConstraintsPage.tsx](frontend/src/components/subpages/SchemaConstraintsPage.tsx)`                             | Hash redirect                                                                   |
| `[AuditableChangeLogPage.tsx](frontend/src/components/subpages/AuditableChangeLogPage.tsx)`                           | Hash redirect                                                                   |
| `[ConflictingFactsRiskPage.tsx](frontend/src/components/subpages/ConflictingFactsRiskPage.tsx)`                       | Hash redirect                                                                   |
| `[DeterministicStateEvolutionPage.tsx](frontend/src/components/subpages/DeterministicStateEvolutionPage.tsx)`         | Hash redirect                                                                   |
| `[DirectHumanEditabilityPage.tsx](frontend/src/components/subpages/DirectHumanEditabilityPage.tsx)`                   | Hash redirect                                                                   |
| `[HumanInspectabilityPage.tsx](frontend/src/components/subpages/HumanInspectabilityPage.tsx)`                         | Hash redirect                                                                   |
| `[ReplayableTimelinePage.tsx](frontend/src/components/subpages/ReplayableTimelinePage.tsx)`                           | Hash redirect                                                                   |
| `[ZeroSetupOnboardingPage.tsx](frontend/src/components/subpages/ZeroSetupOnboardingPage.tsx)`                         | Hash redirect                                                                   |
| `[CrossPlatformPage.tsx](frontend/src/components/subpages/CrossPlatformPage.tsx)`                                     | Hash redirect                                                                   |


### Do not delete (still used)

- **[IcpDetailPage.tsx](frontend/src/components/subpages/IcpDetailPage.tsx)** — imported by ICP landing pages (e.g. AiInfrastructureEngineersPage).
- `**vertical_landing/`*** — imported by vertical landing pages.
- Any file **imported** in `[MainApp.tsx](frontend/src/components/MainApp.tsx)` or another live component.

### Execution steps

1. **Re-verify** with a repo-wide search for each component name and `subpages/<FileName>` (no references in docs, tests, or `site_data` / SEO).
2. **Delete** the orphan files in one PR or commit.
3. **Run** `npm run build` (or project-standard UI build) and any `validate:site-export` / route parity scripts from `[package.json](package.json)`.
4. **Optional**: Add a short note in `[docs/testing/automated_test_catalog.md](docs/testing/automated_test_catalog.md)` or a dev README only if this changes listed test surface (unlikely if files were never routed).

### Risk

- **Low** if grep confirms no imports: these components cannot be reached today.
- **Medium** if external links pointed to old paths that no longer exist as separate routes — **current** routing already uses redirects/hashes in `MainApp` for those topics, so public URLs should remain the same as today.

## Part A — Test coverage audit (after Part B)

Run this **after** orphan files are deleted and the build validates, so the audit does not treat dead components as part of the live frontend surface.

- **Vitest**: Broad CLI, integration, services, contract coverage; default run excludes many integration tests unless `RUN_REMOTE_TESTS=1`; frontend unit tests unless `RUN_FRONTEND_TESTS=1`.
- **Playwright**: E2E for listed flows; `playwright/tests/coverage-map.json` must list every spec.
- **V8 thresholds**: Only a narrow `coverage.include` in `[vitest.config.ts](vitest.config.ts)`, not repo-wide.
- **CI**: Deploy workflows do not run `npm test`; local pre-commit is the main gate.

(See repo docs: `[docs/testing/automated_test_catalog.md](docs/testing/automated_test_catalog.md)`, `[docs/testing/README](docs/testing/)` as needed.)