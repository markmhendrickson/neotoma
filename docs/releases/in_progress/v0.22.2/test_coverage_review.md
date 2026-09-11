# Test coverage review — v0.22.2

Per `/release` Step 3.6. Walks user-facing surfaces from the supplement and verifies test coverage actually exercises user-observable behavior, not just helper functions.

## User-facing surfaces walked

1. **`GET /ready` (new endpoint).** Covered end-to-end by `tests/unit/readiness_probe.test.ts` (10 tests: hang, error, throw, unhandled-rejection safety) and `tests/contract/fly_deploy_config.test.ts` (asserts the Fly configs actually point their health checks at `/ready`). The handler itself (`src/actions.ts`) delegates to `probeReadiness()`, which is what the unit tests exercise directly — this is the correct granularity since the handler is a thin wrapper (parse result, set status code, return JSON) with no independent logic worth a separate integration test. **Classification: covers user-observable behavior end-to-end.**

2. **`GET /entities/duplicates` route fix + guest-auth reserved-segment fix.** Covered by `src/services/route_shadowing.test.ts` (14 tests, including a replay of the exact pre-fix ordering to confirm the guard would have caught it) and 4 new cases in `tests/subscriptions/subscription_guest_auth.test.ts` (reserved-segment denial plus the reserved-word-containment non-denial edge case). Both exercise the actual route registration and guest-principal logic, not helpers in isolation. **Classification: covers user-observable behavior end-to-end.**

3. **`countVisibleEntities` / `getDeletedEntityIds` performance fix.** Covered by `tests/integration/entity_query_deleted_count.test.ts` (213 lines — real SQLite DB, asserts count/page parity across deleted, merged-away, and never-observed entity states) and `tests/unit/entity_queries_status_projection.test.ts`. Performance claim itself is backed by `tests/performance/entity_query_count.bench.test.ts` (not a correctness test, but the release supplement's timing table is not just asserted, it is benchmarked in-repo). **Classification: covers user-observable behavior end-to-end**, with one documented, tested, and now doubly-commented edge case (never-observed entities excluded from the default count but present on the page — see Code review Advisory 1, resolved by adding a cross-referencing code comment, not a behavior change).

4. **`scripts/check_fly_config_drift.sh` (new script).** Not run in CI (no Fly credentials there, by design per the PR). Its config-shape invariants are covered instead by `tests/contract/fly_deploy_config.test.ts`, which iterates the `fly*.toml` directory so new config files are covered automatically. The script's actual drift-detection logic (comparing a config against a *live* Fly machine) cannot be unit-tested without real Fly API access; the PR body documents it was exercised manually against the live production app for all three exit codes (0/1/2). **Classification: covers the testable subset end-to-end (config shape); the live-comparison logic is manually verified and documented, appropriately, since it requires infrastructure the CI environment does not have.**

5. **`deploy-operator-instance.yml` (new CI workflow).** No automated test — cannot be meaningfully unit-tested (it's a GitHub Actions workflow gated on live CI check-run polling and Fly deployment). This is consistent with how `deploy-client-instance.yml` (the existing sibling workflow) is handled in this codebase — no test coverage for CI/CD orchestration YAML is an established, accepted pattern here, not a gap introduced by this release. **Classification: no test — accepted pre-existing pattern, not a new gap.**

## Code review

Full structured review from `/review v0.22.1..HEAD`, run against this worktree.

**Scope:** `git diff v0.22.1..HEAD` — 29 files, +2616/-174. Four squash-merged PRs: #2284 (Fly readiness + deploy-drift guard), #2278 (operator auto-deploy CI workflow), #2267 (entity-count performance fix via `entity_snapshots`), #2221 (fix `GET /entities/duplicates` route-shadowing + guest-auth regex).

### Docs loaded
`docs/architecture/openapi_contract_flow.md`, `docs/subsystems/auth.md`, `docs/security/advisories/2026-05-11-inspector-auth-bypass.md`, `docs/security/threat_model.md`, `docs/foundation/entity_resolution.md`, `docs/testing/testing_standard.md`, `.claude/rules/change_guardrails_rules.md`.

### Pre-PR checklist walk

| Item | Status |
|---|---|
| `openapi.yaml` edited first; `npm run openapi:generate` output committed | ✓ — `ReadinessResult` schema + `/ready` path added; `openapi_types.ts` regenerated in same diff |
| `contract_mappings.ts` updated for new operationId | ✓ — `readinessCheck` row added, adapter `infra` |
| `npm test -- tests/contract/` passes | ✓ — 188/188 (verified directly in this release-prep pass) |
| New top-level CLI commands in coverage guard test | — N/A, no new CLI commands |
| MCP/CLI agent-instruction parity | — N/A, no behavioral-instruction changes |
| Runtime overrides follow `flag > env > default`, `NEOTOMA_`-prefixed, in `preAction` | ✓ — `NEOTOMA_READY_DB_TIMEOUT_MS`, read via `resolveReadyTimeoutMs(process.env)`; server-only readiness knob, consistent with existing timeout env var pattern |
| Error hints as structured fields, not concatenated into `message` | ✓ — `/ready` 503 body is `{ok, checks, latency_ms, error}`, matches schema |
| Tightening-change hint + legacy-payload fixture if input newly rejected | — N/A, no request-shape tightening in this diff |
| `openapi:bc-diff` reviewed; breaking entries named in supplement | ✓ — no breaking changes, one additive `GET /ready`; supplement has `## Breaking changes` section |
| Legacy-payload replay test passes | ✓ — contract suite green |
| New top-level request bodies declare `additionalProperties: false` | — N/A, `/ready` has no request body |
| New response fields declared in openapi.yaml, populated consistently | ✓ — `ReadinessResult` fully declared and returned on both 200/503 paths |
| Release-visible changes documented in supplement | ✓ — `docs/releases/in_progress/v0.22.2/github_release_supplement.md` |
| `schema_agnostic_design_rules.md` re-read for per-type behavior | — N/A, no entity-type-conditional logic added |
| Determinism preserved (reproducible IDs, stable ordering, canonicalized LLM output) | ✓ — no ID/ordering logic touched; count/deletion resolution is simplified (presence check), not more nondeterministic |
| Idempotency honored; ingestion writes transactional | — N/A, no ingestion/mutation path touched |
| No new PII in logs/metrics/events/error messages | ✓ — `/ready` logs latency + generic DB error message only; no entity data |
| Renamed files snake_case, `foundation_config.yaml`/symlinks updated | — N/A, no renames |
| `security:classify-diff` recorded; if sensitive=true, gates clean | ✓ — see `security_review.md` |
| New Express routes in `protected_routes_manifest.json` or allow-list with reason | ✓ — `/ready` added with an explicit override + stated reason |
| No bare `req.socket.remoteAddress`/XFF/Host reads outside `src/actions.ts`/`root_landing/**` | ✓ — no such reads added |

### Architectural review

**State-layer boundaries:** Clean. No strategy/execution logic introduced — readiness probing, route-shadowing detection, and count optimization are infrastructure/correctness concerns internal to the State Layer.

**Schema-agnostic design:** N/A — no entity-type-conditional logic added or modified.

**Determinism:** Preserved. The rewritten `getDeletedEntityIds`/`countVisibleEntities` replace an "observation log, sort by priority/recency, take first" reduction with a presence check against `entity_snapshots`, itself a deterministic, already-materialized projection maintained by the existing write path. No new randomness; `Date.now()` in `readiness.ts` is used only for latency reporting (an ops metric), not for correctness/branching.

**Immutability:** Not implicated — no observation/source mutation.

**Auth surface:**
- `/ready` and `/health` are both registered consistently across all three required gates: the auth-bypass middleware, `PUBLIC_DISCOVERY_PREFIXES` in `aauth_admission.ts`, and `protected_routes_manifest.json` (with an explicit override + reason for the 503 case). No fourth gate was missed.
- `RESERVED_ENTITY_PATH_SEGMENTS` fix closes a real fail-open bug (guest principal could be stamped on `/entities/duplicates`, calling `getAuthenticatedUserId()` inside a guest-eligible dispatch and 500ing). Fails closed by default.
- `entity_queries.ts`'s new snapshot/observation lookups correctly add `.eq("user_id", userId)` scoping (change-guardrail MUST #5); the ids fed in were already tenant-scoped upstream, so this is defense-in-depth, not a fix for a pre-existing gap.

**Error handling:** `/ready` 503 body matches its own OpenAPI schema on both success and failure paths. `probeReadiness` avoids unhandled-rejection risk by consuming the losing promise when the timeout wins, backed by a dedicated test.

**Portability (workflows/scripts):** `scripts/check_fly_config_drift.sh` uses standard GNU/BSD-compatible constructs (`set -euo pipefail`, `awk`/`grep`/`jq`), no bash-4-only features. Correctly distinguishes exit 0/1/2. `.github/workflows/deploy-operator-instance.yml` uses standard `ubuntu-latest` + `gh`/`flyctl`/`curl` patterns, no portability concern (GH Actions only). Fly TOML changes are pure config.

### Findings

**BLOCKING** — none.

**ADVISORY**

1. **category: correctness / residual-risk** — `src/shared/action_handlers/entity_handlers.ts` (`countLiveSnapshots`, default count path)
   **Finding:** The filtered-path live count explicitly separates "never-observed" (no snapshot row, but also no observation row — live) from "genuinely deleted" via a bounded `observations` existence probe (`getDeletedEntityIds` in `entity_queries.ts`). The default (unfiltered) count path does not do this probe — a never-observed `entities` row is silently excluded from the default `total_count` while still appearing on the page.
   **Resolution:** Not a defect — deliberate and tested (`entity_query_deleted_count.test.ts`, "keeps a never-observed entity visible on the page"), with a stated rationale that the never-observed state is transient in production (both writers that create a bare `entities` row do so as a precursor to writing the observation in the same flow) and that closing the gap would reintroduce the exact corpus-proportional cost this release removes. **Fixed during this release-prep pass:** added a cross-referencing code comment on `countLiveSnapshots` documenting the asymmetry and its rationale explicitly, so a future reader does not have to infer it applies to the default path too (previously stated only on the filtered path).

2. **category: documentation-completeness** — release supplement
   **Finding:** This release also fixes a real, user-visible bug: `include_merged: true` on `POST /entities/query`'s default (unfiltered) count path previously silently returned the same total as `include_merged: false` (merged-away entities have no snapshot row, so a plain snapshot count could never surface them regardless of flag value). This was not called out in the initial supplement draft as a distinct behavior change.
   **Resolution:** **Fixed during this release-prep pass** — added an explicit bullet to the supplement's "Behavior changes" section describing the fix and advising any caller with a workaround for the old (buggy) no-op behavior to remove it.

**NIT**

1. **category: consistency** — `fly.toml`, `fly.operator.toml`
   Different resource floors (`2gb`/`shared`/2 CPU vs `8gb`/`performance`/2 CPU) are both correctly commented as deliberate, instance-specific floors rather than a template inconsistency. Each Fly config file carries its own explanatory comment block repeating overlapping incident history — defensible since each file is deployed independently and a reader of just one file needs the full context. No action needed.

2. **category: naming** — `src/services/route_shadowing.ts` doc comment vs. `protected_routes_manifest.json` route count
   The route-shadowing module's doc comment cites "142 registrations" (all Express route registrations found at audit time) while the protected-routes manifest reports 120 routes (deduplicated path+method manifest entries) — different counts measuring different things, not a discrepancy. No fix needed.

## --- Review Summary ---

Base..Head: `v0.22.1..HEAD`
Files reviewed: 29/29
Blocking: 0
Advisory: 2 (both resolved during this release-prep pass — see Resolution notes above)
Nit: 2

**Verdict: APPROVED**

Both advisory findings from the initial pass were resolved in this same release-prep session (a documentation-only code comment and a supplement behavior-change bullet — neither required a logic change). No blocking findings at any point. Full test suite comparison against `v0.22.1` baseline (see `security_review.md` and the supplement's "Tests and validation" section) confirms zero new test regressions: the same 22 test files / 83 tests fail at both baseline and this release candidate, and this candidate adds 4 more passing test files / 61 more passing tests than baseline.
