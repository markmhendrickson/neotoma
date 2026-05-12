---
description: "Repository-wide architectural guardrails every code change and plan must respect. Thin index: links to the canonical doc that owns each constraint."
globs:
  - "openapi.yaml"
  - "src/**"
  - "docs/developer/mcp/**"
  - "docs/developer/cli_agent_instructions.md"
  - "docs/developer/cli_reference.md"
  - "docs/releases/**"
  - ".cursor/plans/**"
  - "tests/contract/**"
  - "tests/contract/legacy_payloads/**"
  - "tests/cli/cli_command_coverage_guard.test.ts"
  - "scripts/openapi_bc_diff.js"
  - ".cursor/skills/release/SKILL.md"
  - ".cursor/skills/create-release/SKILL.md"
  - "foundation_config.yaml"
---

<!-- Source: docs/architecture/change_guardrails_rules.mdc -->


# Change Guardrails Rules

**Scope:** Repository-wide architectural constraints that every code change and every plan MUST respect. This rule is intentionally thin: each constraint delegates to the canonical doc that owns it, so guidance evolves with the subsystem rather than drifting in a central copy.

## How to use this rule

1. Identify which surfaces your change touches (see the Touchpoint Matrix below).
2. Read the canonical doc for each touched surface before writing code or drafting a plan.
3. Satisfy the MUST / MUST NOT constraints below — they are cross-cutting rules that sit at the seams between subsystems and therefore have no other owner.
4. Run the Pre-PR Checklist.

## Touchpoint matrix

For each change type, follow the linked canonical doc. The matrix lists only the *seams* — the places where a change in one system forces a coordinated change in another. Implementation details live in each doc.

**API & contract surfaces**

| Change type | Canonical doc | Seams you must update together |
|-------------|---------------|-------------------------------|
| HTTP endpoint / request / response field | `docs/architecture/openapi_contract_flow.md` | `openapi.yaml` → `src/shared/openapi_types.ts` → `src/shared/contract_mappings.ts` → handler → contract tests |
| Request-shape tightening (closing `additionalProperties`, adding required fields, narrowing types) | `docs/architecture/openapi_contract_flow.md` § Legacy-payload corpus + `docs/subsystems/errors.md` § Tightening-change hint obligation | `openapi.yaml` schema, `src/middleware/unknown_fields_guard.ts` (if new closed shape), `tests/contract/legacy_payloads/` fixture flip + `CHANGES.md` note, supplement "Breaking changes" section |
| New or changed MCP tool | `docs/architecture/openapi_contract_flow.md` + `docs/developer/mcp/` | `src/tool_definitions.ts`, `src/server.ts`, `src/shared/contract_mappings.ts`, `docs/developer/mcp/tool_descriptions.yaml` |
| New or changed CLI command | `docs/developer/cli_reference.md` | `src/cli/index.ts`, `tests/cli/cli_command_coverage_guard.test.ts`, `docs/developer/cli_reference.md`, `docs/developer/cli_agent_instructions.md` (via anchor rule) |
| New CLI runtime override (env var + flag) | `docs/developer/cli_reference.md` § Runtime overrides | `src/cli/index.ts` `preAction` hook, env-var precedence table in cli_reference |
| Error response / envelope change | `docs/subsystems/errors.md` | `openapi.yaml` schema, server builders, contract / unit tests |
| User-scoped endpoint / user-id handling | `docs/subsystems/auth.md` § User-ID Resolution | `getAuthenticatedUserId` usage; `openapi.yaml` query params; never parallel resolution paths |
| Auth middleware / proxy trust / local-dev shortcuts (the v0.11.1 class) | `docs/security/threat_model.md` + `.cursor/plans/pre-release_security_gates_44e01d74.plan.md` | `src/actions.ts` (`isLocalRequest`, `forwardedForValues`, `isProductionEnvironment`); `src/services/root_landing/**` mirrors; `protected_routes_manifest.json` regenerated via `npm run security:manifest:write`; `npm run security:lint` clean; `tests/security/auth_topology_matrix.test.ts` updated when the topology surface changes; supplement `Security hardening` section + `docs/security/advisories/` entry on regression |
| MCP ↔ CLI agent-instruction parity | `docs/developer/agent_instructions_sync_rules.mdc` | Mirrored edits in both instruction files + anchor-table row |

**Data model & core semantics**

| Change type | Canonical doc | Seams you must update together |
|-------------|---------------|-------------------------------|
| Schema / entity-type behavior | `docs/foundation/schema_agnostic_design_rules.md` | `SchemaDefinition`, bootstrap, tests for seeded + unseeded paths |
| Ingestion / store / correction path | `docs/subsystems/ingestion/ingestion.md` + `docs/architecture/idempotence_pattern.md` | `idempotency_key` enforcement; transactional write; hash-based IDs; `StoreStructuredResponse` parity (see OpenAPI flow) |
| Source / observation lifecycle | `docs/subsystems/sources.md` + `docs/subsystems/observation_architecture.md` | No in-place mutation; reinterpretation = new observation; provenance chain preserved |
| Reducer / merge / snapshot | `docs/subsystems/reducer.md` | Deterministic output; stable ordering `observed_at DESC, id ASC`; merge policies declared on schema |
| Relationships | `docs/subsystems/relationships.md` | Typed edges only; no cycles in hierarchical types (`PART_OF`, `DEPENDS_ON`) |
| Timeline / events | `docs/foundation/timeline_events.md` + `docs/subsystems/events.md` | Events from extracted dates; deterministic event IDs; no PII in payloads |

**Runtime & ops surfaces**

| Change type | Canonical doc | Seams you must update together |
|-------------|---------------|-------------------------------|
| Release / supplement | `docs/developer/github_release_process.md` § Supplement immutability + § Validation tightening is breaking | In-progress supplement under `docs/releases/in_progress/<TAG>/`; historical supplements untouched; supplement MUST contain an explicit "Breaking changes" section (even if only `No breaking changes.`); `npm run openapi:bc-diff` output reconciled against the supplement in the release SKILL preflight |
| Logging, metrics, events, traces | `docs/observability/logging.md` + `docs/observability/metrics_standard.md` + `docs/subsystems/privacy.md` | No PII in any observable payload; structured logs include `trace_id`; metrics follow `neotoma_{subsystem}_…` naming |
| File / folder rename | `foundation/agent_instructions/cursor_rules/file_naming.mdc` | Snake_case; update `foundation_config.yaml` references; rewire `.claude/rules/` symlinks |
| npm script rename / new prefix | `docs/developer/package_scripts.md` | Match the three-category convention (`watch:*` for dev watchers, `serve:*`/`start:*` for compiled-dist runners, `dev:*` for other dev tooling); keep aliases inside the same category; one-minor alias back-compat when renaming |

## Cross-cutting constraints

These rules sit between subsystems. Each canonical doc covers its own surface; only this rule defines how the surfaces interact.

### MUST

1. Spec before handler. Edit `openapi.yaml` and run `npm run openapi:generate` before implementing any endpoint or field change (`docs/architecture/openapi_contract_flow.md`).
2. Every `operationId` has a `src/shared/contract_mappings.ts` row; every new MCP tool or CLI command is reachable from that table.
3. Behavioral rules that affect agents appear in both `docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md`, mirrored via the anchor rule.
4. Runtime overrides follow `flag > env > default`, are read in the `preAction` hook with a `NEOTOMA_`-prefixed name, and appear in the `cli_reference.md` Runtime overrides table.
5. Authorization goes through `getAuthenticatedUserId`. Body / query `user_id` is never read directly for access control.
6. New response or error fields are declared in `openapi.yaml` first; clients gate on declared fields, not on the presence or absence of ambient rich properties.
7. Post-release fixes ship as a new patch (or higher) version. Historical supplements under `docs/releases/completed/` are not rewritten.
8. New top-level CLI commands are added to `tests/cli/cli_command_coverage_guard.test.ts` in the same change.
9. Data-layer behavior is deterministic: entity IDs, event IDs, observation ordering, and reducer output MUST be reproducible from the same inputs (`docs/architecture/determinism.md`, `docs/NEOTOMA_MANIFEST.md`). LLM interpretation is canonicalized before storage (`docs/architecture/idempotence_pattern.md`).
10. Ingestion writes (sources → observations → entity updates) MUST be transactional. Mutations that commit partially on failure are a bug (`docs/subsystems/ingestion/ingestion.md`).
11. Mutating operations (`ingest`, `store`, `correct`) MUST accept and honor an `idempotency_key`; reuse with a different payload is a validation error, not a silent overwrite.
12. File and folder names use `snake_case`; renames update `foundation_config.yaml` and any `.claude/rules/` symlinks in the same change.
13. A PR that causes previously-accepted input to start returning an `ERR_*` MUST populate a structured `hint` at the validation seam in the same change (`docs/subsystems/errors.md` § Tightening-change hint obligation) and update an entry in `tests/contract/legacy_payloads/` (flip `outcome` to `rejected`, populate `hint_match`, add a line to `CHANGES.md`).
14. Tightening request-shape validation — closing an `additionalProperties`, adding a required field, narrowing a type, removing an enum value — is a breaking change and MUST be named in the release supplement's "Breaking changes" section (`docs/developer/github_release_process.md` § Validation tightening is breaking), regardless of whether the tightened shape was previously declared in `openapi.yaml`.
15. Every release supplement MUST contain an explicit "Breaking changes" section. Use the literal line `No breaking changes.` when none exist; never omit the section (`.cursor/skills/release/SKILL.md` § Step 3).
16. Authority over loopback / proxy / `X-Forwarded-For` trust lives in `src/actions.ts` (`isLocalRequest`, `forwardedForValues`, `isProductionEnvironment`) and the matching helpers in `src/services/root_landing/**`. Any new code that needs to know "is this request local?" MUST consume those exports — not a bare `req.socket.remoteAddress` check, not a `Host` header read, not an inlined fork (`docs/security/threat_model.md`). Treat the v0.11.1 advisory shape as a regression class, not a one-off.
17. Every new Express route MUST land in `scripts/security/protected_routes_manifest.json` (auth-required) or in the runtime allow-list with a stated `reason`. Run `npm run security:manifest:write` in the same change; CI's `security_gates` job runs `--check` and rejects drift.
18. Every release that the diff classifier (`scripts/security/classify_diff.js`) labels `sensitive=true` MUST land with a filled `docs/releases/in_progress/<TAG>/security_review.md` and a supplement `Security hardening` section linking it. `none` provider mode is acceptable, manual fill is mandatory.

### MUST NOT

1. Modify a handler's accepted query / body fields without a matching `openapi.yaml` edit in the same change.
2. Add an MCP tool or CLI command without the matching `contract_mappings.ts` row + contract-test update.
3. Rewrite a released (completed) supplement in-repo to backfill behavior discovered after the tag shipped.
4. Gate CLI warnings or client logic on "was this property present in the response?" as a proxy for a state flag. Declare an explicit flag in `openapi.yaml`.
5. Introduce a parallel user-id resolution path that bypasses `getAuthenticatedUserId`.
6. Widen the `LOCAL_DEV_USER_ID` override surface without an explicit security review.
7. Concatenate upgrade / hint text into error `message` strings when the envelope provides a structured `hint`, `details`, or `issues` field.
8. Mutate sources or observations after creation. New information creates a new observation; corrections are new observations, not edits (`docs/subsystems/observation_architecture.md`).
9. Introduce nondeterminism into the data layer: no `Math.random()`, no `Date.now()` in ID derivation, no unstable iteration / sort keys, no wall-clock fallbacks in reducer output.
10. Implement strategy or execution logic inside Neotoma (filter suggestions, agent orchestration, scheduled runs). Neotoma is the State Layer; upper layers read truth and write only through the prescribed ingestion / correction flows (`docs/foundation/layered_architecture.md`, `docs/NEOTOMA_MANIFEST.md`).
11. Emit PII in any observable surface — logs, metric labels, event payloads, or error messages. Use IDs and redacted references (`docs/subsystems/privacy.md`, `docs/observability/logging.md`).
12. Create untyped relationships or cycles in hierarchical relationship types (`docs/subsystems/relationships.md`).
13. Tighten validation of a previously-tolerated request shape without (a) a structured `hint`, (b) a legacy-payload fixture flipped to `rejected`, and (c) a line in the release supplement's "Breaking changes" section. Silent tightenings are the specific regression mode the legacy-payload corpus and the OpenAPI breaking-change diff gate exist to catch.
14. Omit the "Breaking changes" section from a release supplement, even for patch releases with no breaking changes. Write `No breaking changes.` explicitly.
15. Read `req.socket.remoteAddress`, `req.headers["x-forwarded-for"]`, `req.headers["host"]`, or `req.header("host")` directly outside `src/actions.ts` and `src/services/root_landing/**`. Use the canonical helpers; the static rule `forwarded-for-trust` (gate G2) is gating, not advisory.
16. Reference `LOCAL_DEV_USER_ID` outside `src/cli/**`, `src/services/local_auth.ts`, and `tests/**`. Widening the local-dev surface is the same class as the v0.11.1 Inspector auth-bypass; gate any exception behind `assertExplicitlyTrusted("…")` and a written rationale in `docs/security/threat_model.md`.
17. Register a new public Express route without either `auth.requireUser()` / `assertGuestWriteAllowed()` middleware OR an entry in the runtime unauth allow-list of `protected_routes_manifest.json` with a stated `reason`. Silent additions are the exact regression mode the manifest sync gate exists to catch.

### SHOULD

1. When behavior varies by `entity_type`, express it as a `SchemaDefinition` declaration rather than a per-type branch (`docs/foundation/schema_agnostic_design_rules.md`).
2. Gate verbose debug logging behind `NEOTOMA_DEBUG_<SCOPE>` env vars rather than raising default log levels or leaving stray `console.log` calls.
3. When uploading bytes from CLI to a remote API, include a client-side size guard consistent with the server's `express.json({ limit: ... })` config.
4. Cross-link new architectural claims back to the decision record in `docs/architecture/architectural_decisions.md` where one exists.
5. When a change fixes a reported production or implementation error, add a regression test in the same PR (`docs/feature_units/standards/error_protocol.md`).
6. Operations that change state SHOULD emit a structured event for observability (`docs/subsystems/events.md`).

## Pre-PR checklist

Before opening a PR that touches any surface in the Touchpoint Matrix, confirm:

- [ ] `openapi.yaml` edited first; `npm run openapi:generate` output committed alongside.
- [ ] `src/shared/contract_mappings.ts` updated for any new `operationId`, MCP tool, or CLI command.
- [ ] `npm test -- tests/contract/` passes.
- [ ] New top-level CLI commands listed in `tests/cli/cli_command_coverage_guard.test.ts`.
- [ ] MCP and CLI agent-instruction parity confirmed via `neotoma cli config --yes`.
- [ ] Runtime overrides follow `flag > env > default` and appear in the cli_reference Runtime overrides table.
- [ ] New env vars are `NEOTOMA_`-prefixed and read in `preAction`.
- [ ] Error hints emitted as structured `hint` / `details` fields, not concatenated into `message`.
- [ ] If this PR causes previously-accepted input to be rejected, a structured `hint` is populated in the same change and a legacy-payload fixture under `tests/contract/legacy_payloads/` is updated (see `docs/subsystems/errors.md` § Tightening-change hint obligation).
- [ ] For release PRs: `npm run openapi:bc-diff` output reviewed; any "Breaking" entries named in the supplement's "Breaking changes" section (or the supplement contains the literal line `No breaking changes.`).
- [ ] `tests/contract/legacy_payloads/replay.test.ts` passes; any outcome flips (`valid` → `rejected` or similar) are paired with a new entry in `CHANGES.md` under the affected version.
- [ ] New top-level request bodies added to `openapi.yaml` declare `additionalProperties: false` unless implicit tolerance is intentional and documented in the schema `description`.
- [ ] New response fields declared in `openapi.yaml`; populated consistently across all code paths that return the schema.
- [ ] Release-visible changes documented in a supplement under `docs/releases/in_progress/<TAG>/`; historical supplements untouched.
- [ ] `docs/foundation/schema_agnostic_design_rules.md` re-read when adding per-type behavior.
- [ ] Data-layer changes preserve determinism (reproducible IDs, stable ordering, canonicalized LLM output).
- [ ] Mutating ops honor `idempotency_key`; ingestion writes are transactional.
- [ ] No new PII in logs, metric labels, event payloads, or error messages.
- [ ] Renamed files are `snake_case` and `foundation_config.yaml` + `.claude/rules/` symlinks are updated.
- [ ] `npm run security:classify-diff` recorded; if `sensitive=true`, `npm run security:lint` is clean, `npm run security:manifest:check` passes, `npm run test:security:auth-matrix` passes, and `docs/releases/in_progress/<TAG>/security_review.md` exists with a sign-off verdict.
- [ ] New Express routes registered in `protected_routes_manifest.json` (or runtime unauth allow-list with a `reason`); manifest regenerated via `npm run security:manifest:write` when needed.
- [ ] No bare `req.socket.remoteAddress`, `X-Forwarded-For`, or `Host` reads outside `src/actions.ts` / `src/services/root_landing/**`; auth-local fallbacks (`!auth && isLocalRequest`) gated through `assertExplicitlyTrusted`.

## Canonical doc index

Load the canonical doc for the surface your change touches, not this rule, for substantive guidance.

**Foundation & architecture**

- `docs/NEOTOMA_MANIFEST.md` — root invariants: State Layer, determinism, immutability, schema-first, no PII, no synthetic data.
- `docs/foundation/layered_architecture.md` — State Layer / Operational Layer boundaries.
- `docs/architecture/architectural_decisions.md` — three-layer truth model and registry evolution.
- `docs/architecture/determinism.md` — deterministic data layer vs bounded-convergence agents.
- `docs/architecture/idempotence_pattern.md` — LLM stochasticity bounded by post-hoc canonicalization / hashing.
- `docs/foundation/schema_agnostic_design_rules.md` — schema-driven behavior, no per-type branches.
- `docs/security/threat_model.md` — channels the pre-release security gates cover (alternate-path auth, proxy trust, local-dev shortcuts, unauth public route, guest-access widening).
- `docs/security/advisories/` — disclosed advisories, indexed by `README.md`; the seed entry `2026-05-11-inspector-auth-bypass.md` documents the v0.11.1 regression class the gates were designed against.
- `.cursor/plans/pre-release_security_gates_44e01d74.plan.md` — Track 1 (this) plan; Track 2 (advisory + rollout via subscriptions / peer / guest) follows.

**API & contract**

- `docs/architecture/openapi_contract_flow.md` — OpenAPI-first workflow, contract mappings, response-shape changes, legacy-payload corpus (`tests/contract/legacy_payloads/`), OpenAPI breaking-change diff gate (`scripts/openapi_bc_diff.js`).
- `docs/subsystems/errors.md` — error envelope taxonomy (standard + `ERR_STORE_RESOLUTION_FAILED` with `issues[]` / `hint`), `ERR_UNKNOWN_FIELD` for closed request shapes, and the Tightening-change hint obligation.
- `docs/subsystems/auth.md` — user-id resolution via `getAuthenticatedUserId` and the `LOCAL_DEV_USER_ID` override.
- `docs/developer/agent_instructions_sync_rules.mdc` — MCP ↔ CLI instruction anchor table.
- `docs/developer/cli_reference.md` — CLI commands, flags, and runtime overrides.

**Data-model subsystems**

- `docs/subsystems/ingestion/ingestion.md` — transactional ingestion, idempotency, hash-based IDs.
- `docs/subsystems/sources.md` + `docs/subsystems/observation_architecture.md` — source & observation immutability, reinterpretation semantics.
- `docs/subsystems/reducer.md` — deterministic reducer, stable observation ordering, merge policies.
- `docs/subsystems/relationships.md` — typed relationships, cycle prevention.
- `docs/foundation/timeline_events.md` + `docs/subsystems/events.md` — event generation, immutability, no-PII.

**Ops & process**

- `docs/developer/github_release_process.md` — release supplement lifecycle, immutability, and the "Validation tightening is breaking" rule.
- `.cursor/skills/release/SKILL.md` (mirrored in `.cursor/skills/create-release/SKILL.md` and under `.claude/skills/`) — release preflight including `openapi:bc-diff` reconciliation and the explicit "Breaking changes" supplement section.
- `docs/subsystems/privacy.md` + `docs/observability/logging.md` + `docs/observability/metrics_standard.md` — no PII in observable surfaces; logging/metric naming.
- `docs/feature_units/standards/error_protocol.md` — class 2/3 errors require regression tests.
- `foundation/agent_instructions/cursor_rules/file_naming.mdc` — repo-wide snake_case; `foundation_config.yaml` sync on rename.
- `docs/developer/package_scripts.md` — three-category npm-script prefix convention (`watch:*` / `serve:*` / `dev:*`), alias rules, and renaming policy.

## When to load this rule

- Before planning or executing any change that touches a surface in the Touchpoint Matrix.
- Before drafting a plan under `.cursor/plans/` that references endpoints, MCP tools, CLI commands, error responses, store behavior, release artifacts, data-model subsystems, or agent instructions.
- When reviewing a PR that claims to modify one of those surfaces.

This rule does not restate the canonical docs. If a constraint is ambiguous here, the canonical doc wins; open a PR against the canonical doc rather than this rule.
