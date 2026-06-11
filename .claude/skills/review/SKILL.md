---
name: review
description: Code review skill for PRs, branches, or uncommitted changes. Loads the appropriate subset of architecture/subsystem docs based on what changed, walks the change_guardrails_rules pre-PR checklist, and emits structured findings (blocking / advisory / nit) with a verdict.
triggers:
  - review
  - /review
  - code review
  - review pr
  - review branch
  - review changes
  - review diff
---

# Review

Perform a structured code review of a GitHub PR, a branch, or the current working tree against a base ref.

## Invocation forms

| Form | Meaning |
|---|---|
| `/review` | Review uncommitted + committed changes on current branch vs `main` |
| `/review <base>..<head>` | Review a specific ref range (e.g. `v0.13.0..HEAD`, `main..feature/x`) |
| `/review PR#N` | Fetch PR diff via `gh pr diff N` and review it |
| `/review --base <ref>` | Override the base ref; head defaults to `HEAD` |

## When to invoke

- Before merging any feature branch to `main`
- As part of `/release` Step 3.6 (test coverage review) on the full release diff
- When changes went directly to `main` and need a retroactive review pass
- When asked to review a specific PR or diff range
- From `run_feature_workflow` before the final merge step

## Workflow

### Phase 1 — Scope the diff

1. Determine base and head refs from the invocation form above.
2. Run:
   ```bash
   git diff --stat <base>..<head>
   git diff --name-only <base>..<head>
   ```
   For a PR: `gh pr diff <N> --name-only` and `gh pr view <N>` for metadata.
3. Compute surface summary:
   - Files changed, lines added/removed
   - Which surface categories are touched (data layer, API/contract, auth/security, CLI, tests, docs, release, observability)
   - Whether any high-risk surfaces are present (destructive ops, file-shape parsers, new CLI commands, HTTP runtime config, auth middleware)

4. Print a one-line scope summary before proceeding:
   > "Reviewing <base>..<head> — N files, +X/−Y lines. Surfaces: [list]. High-risk: [yes/no]."

### Phase 2 — Load docs

**Always load** (3 docs — true invariant kernel only):

- `docs/NEOTOMA_MANIFEST.md`
- `docs/foundation/layered_architecture.md`
- `.claude/rules/change_guardrails_rules.md`

**Load conditionally** based on paths in the diff (per `docs/developer/pr_review_reading_list.md`):

| If diff touches | Also load |
|---|---|
| `src/reducers/` | `docs/subsystems/reducer.md` |
| `src/services/ingestion*`, `src/services/store*` | `docs/subsystems/ingestion/ingestion.md`, `docs/architecture/idempotence_pattern.md` |
| `src/services/observation*`, `src/services/sources*` | `docs/subsystems/sources.md`, `docs/subsystems/observation_architecture.md` |
| `src/services/interpretation*` | `docs/subsystems/interpretations.md` |
| `src/services/relationships*` | `docs/subsystems/relationships.md` |
| `src/services/entity*`, `src/services/schema_registry*` | `docs/foundation/entity_resolution.md`, `docs/subsystems/schema_registry.md`, `docs/subsystems/schema.md` |
| `src/services/entity_merge*` | `docs/subsystems/entity_merge.md` |
| `src/services/timeline*`, `src/services/events*` | `docs/foundation/timeline_events.md`, `docs/subsystems/events.md` |
| `src/services/search*`, `src/shared/action_handlers/entity_handlers*` | `docs/subsystems/search/search.md` |
| `src/services/deletion*` | `docs/subsystems/deletion.md` |
| `src/services/peer*` | `docs/subsystems/peer_sync.md` |
| `openapi.yaml`, `src/shared/contract*`, `src/shared/openapi*` | `docs/architecture/openapi_contract_flow.md` |
| `src/tool_definitions.ts`, `src/server.ts`, `docs/developer/mcp/` | `docs/developer/mcp/instructions.md`, `docs/developer/agent_instructions_sync_rules.mdc` |
| `src/cli/` | `docs/developer/cli_reference.md` |
| `src/actions.ts`, `src/services/local_auth*`, `src/middleware/` | `docs/subsystems/auth.md`, `docs/security/advisories/2026-05-11-inspector-auth-bypass.md` |
| `src/actions.ts`, `src/server.ts`, any auth/middleware path | `docs/security/threat_model.md` |
| Guest access, public routes | `docs/subsystems/guest_access_policy.md` |
| `src/services/root_landing/` | `docs/security/threat_model.md` |
| New call to `registry.register()` (i.e. a new entity type being registered, not a schema field addition) | `docs/subsystems/record_types.md`, `docs/foundation/data_models.md` |
| Any `if (entityType`, `switch (entity_type`, or hardcoded entity-type list in diff | `docs/foundation/schema_agnostic_design_rules.md` |
| Any new error code, tightened validation, or changed error response shape | `docs/subsystems/errors.md` |
| `Math.random`, `Date.now` in non-observability paths, new sort/grouping in stored-output path | `docs/architecture/determinism.md` |
| Any change to stored fields, observation shape, or entity snapshot output | `docs/foundation/core_identity.md`, `docs/foundation/philosophy.md` |
| Logging, metrics, tracing | `docs/observability/logging.md`, `docs/observability/metrics_standard.md`, `docs/subsystems/privacy.md` |
| `tests/` | `docs/testing/testing_standard.md` |
| `docs/releases/` | `docs/developer/github_release_process.md` |
| `package.json` scripts | `docs/developer/package_scripts.md` |
| `.claude/settings.json`, `*.sh`, `.github/workflows/` | *(no doc to load)* — apply Phase 5 portability check |

### Phase 3 — Read the diff

Read the full diff for every changed file (not just stat). For large diffs (>600 lines), read file by file, prioritizing high-risk surfaces first.

For each changed file, note:
- What invariant classes are in play
- Whether any of the MUST / MUST NOT rules from the loaded docs are implicated

### Phase 4 — Walk the pre-PR checklist

From `docs/architecture/change_guardrails_rules.mdc` § Pre-PR checklist, evaluate each item that is relevant to this diff. Mark each as:
- `✓` — satisfied
- `✗ BLOCKING` — not satisfied, must be fixed before merge
- `~ advisory` — not satisfied but not merge-blocking (should be addressed in a follow-up)
- `— N/A` — not applicable to this diff

Items to check (evaluate all; mark N/A when not triggered):

1. `openapi.yaml` edited first; `npm run openapi:generate` output committed alongside
2. `src/shared/contract_mappings.ts` updated for any new `operationId`, MCP tool, or CLI command
3. `npm test -- tests/contract/` passes
4. New top-level CLI commands listed in `tests/cli/cli_command_coverage_guard.test.ts`
5. MCP and CLI agent-instruction parity confirmed
6. Runtime overrides follow `flag > env > default` and appear in cli_reference Runtime overrides table
7. New env vars are `NEOTOMA_`-prefixed and read in `preAction`
8. Error hints emitted as structured `hint`/`details` fields, not concatenated into `message`
9. If PR causes previously-accepted input to be rejected: structured `hint` populated + legacy-payload fixture updated
10. For release PRs: `npm run openapi:bc-diff` output reviewed; breaking entries named in supplement
11. `tests/contract/legacy_payloads/replay.test.ts` passes; outcome flips paired with `CHANGES.md` entry
12. New top-level request bodies declare `additionalProperties: false` unless intentional
13. New response fields declared in `openapi.yaml`; populated consistently across all code paths
14. Release-visible changes documented in supplement under `docs/releases/in_progress/<TAG>/`; historical supplements under `docs/releases/completed/` are NOT modified — post-release fixes go in a new patch version
15. `docs/foundation/schema_agnostic_design_rules.md` re-read when adding per-type behavior
16. Data-layer changes preserve determinism (reproducible IDs, stable ordering, canonicalized LLM output)
17. Mutating ops honor `idempotency_key`; ingestion writes are transactional; `idempotency_key` reuse with a different payload is a validation error (`ERR_IDEMPOTENCY_MISMATCH` or `ERR_IDEMPOTENCY_COLLISION`), not a silent overwrite
18. No new PII in logs, metric labels, event payloads, or error messages; metric labels use error codes / entity types / IDs, never names or personal identifiers; log fields use IDs only
19. Renamed files are `snake_case` and `foundation_config.yaml` + `.claude/rules/` symlinks updated
20. Security gate results: `classify-diff` recorded; if sensitive, `security:lint` clean, `manifest:check` passes, `auth-matrix` passes, `security_review.md` exists with sign-off
21. New Express routes in `protected_routes_manifest.json` (or runtime unauth allow-list with `reason`); manifest regenerated
22. No bare `req.socket.remoteAddress` / `X-Forwarded-For` / `Host` reads outside canonical helpers
23. **User-facing-surface coverage** (the hard one): for each new surface class —
    - New CLI command or flag: test that exercises user-observable behavior end-to-end
    - Destructive/data-mutating op: real round-trip test (encrypt→decrypt identity, dry-run, idempotency, NULL preservation)
    - External-file-shape parser: fixture per format exercising actual parser path
    - Discovery/detection/parser pair: roundtrip test asserting discovery paths are parseable
    - HTTP runtime config: test asserting runtime behavior (response header, socket lifetime), not just source string
24. New or renamed npm scripts follow the three-category prefix convention: `watch:*` for dev file-watchers, `serve:*` / `start:*` for compiled-dist runners, `dev:*` for other dev tooling; aliases stay within the same category; one-minor back-compat alias when renaming an existing script (`docs/developer/package_scripts.md`)
25. No iteration over `Object.keys()`, `Map`, or `Set` without an explicit `sort()` call in any code path that produces output stored to the database, emitted in a response, or used as an ID input — unstable iteration order is a determinism violation

### Phase 5 — Architectural review

Beyond the checklist, evaluate the diff against the loaded architectural docs for:

**State Layer boundaries (Principle 10.8 Signal Without Strategy):**
- Does any new code implement strategy, filtering suggestions, agent orchestration, or scheduled execution? (MUST NOT — belongs in the Operational Layer)
- Does any new code read Neotoma state and decide what to do with it beyond serving a response?
- Does any new code emit "importance" signals, prioritize changes, or choose which consumer receives what? (The state layer signals; consumers interpret. If the code decides what a signal *means*, it is in the wrong layer.)

**Schema-agnostic design:**
- Any new `switch (entity_type)` or `if (entityType === "X")` branches?
- Hardcoded lists of entity types in utility modules?
- Any per-type special cases in `entity_resolution.ts`, `timeline_events.ts`, `observation_reducer.ts`, or `storeStructuredInternal` without a schema declaration backing them?

**Determinism:**
- Any `Math.random()`, `Date.now()` in ID derivation or business logic? (`Date.now()` is allowed in observability / timestamps, not in entity/event IDs or reducer keys.)
- Any unstable iteration or sort keys in reducer output? (Reducer ordering MUST be `observed_at DESC, id ASC`.)
- Any LLM output stored without post-hoc canonicalization? (Raw LLM text MUST be normalized/hashed before it influences entity IDs or observation deduplication — stochastic input, deterministic storage.)
- Any new sort or grouping in a code path that emits stored or returned data, where the sort comparator relies on object property insertion order, `Map` insertion order, or `Set` membership order?

**Immutability:**
- Any in-place mutation of observations or sources?
- Any `UPDATE` on `observations` or `sources` rows?

**Auth surface (for diffs touching `src/actions.ts` or middleware):**
- Any new code reading `req.socket.remoteAddress` directly?
- Any new code reading `user_id` from body/query for access control instead of `getAuthenticatedUserId`?
- Any new local-dev shortcut (`LOCAL_DEV_USER_ID` reference) outside `src/cli/**`, `src/services/local_auth.ts`, `tests/**`?
- Any new route registered without auth middleware or explicit unauth allow-list entry?

**Error handling:**
- Any new error path that throws an opaque internal error instead of a structured envelope?
- Any tightened validation (closed `additionalProperties`, added required field, narrowed type, removed enum value) without: (a) a structured `hint` in the same change, (b) a legacy-payload fixture in `tests/contract/legacy_payloads/` flipped to `rejected` with a `hint_match` assertion, and (c) a line in `CHANGES.md`? All three are required together — this is the Tightening-change hint obligation (`docs/subsystems/errors.md` § Tightening-change hint obligation).
- Any structured `hint` text that interpolates user-supplied input (e.g. entity types, field names from the request)? Hints MUST be stable text agents can pattern-match on; avoid `"Unknown entity type: ${type}"` — the type value makes the hint fragile.

**Portability (for diffs touching `.claude/settings.json`, `*.sh` scripts, `.github/workflows/`, or any file containing hook commands):**
- Any hardcoded user home path (`/Users/<name>/`, `/home/<specific-name>/` where the segment is a real username rather than a generic placeholder)? Flag ADVISORY.
- Any hook command that `cd`s to a hardcoded absolute path instead of `$(git rev-parse --show-toplevel)` or a `$REPO_ROOT`-style variable? Flag ADVISORY.
- Any shell script that embeds a machine-specific path (e.g. a developer's home directory, a specific macOS or Linux path that would break on the other OS)? Flag ADVISORY.
- Any CI workflow that hardcodes a runner path that diverges from the repo checkout path? Flag NIT.

**Search/ranking changes (for diffs touching `entity_handlers.ts`):**
- Does type-filter logic correctly fall back for unseeded/unregistered types?
- Does the schema_registry query failure path log a warning rather than silently diverging?
- Is `excludeBookkeeping` default correct for each caller (Inspector header + `/search` default true; direct API call default false)?

### Phase 5b — Product/UX and principles alignment

Load these once per review and evaluate the diff against them:

- `docs/foundation/product_principles.md`
- `docs/foundation/philosophy.md`
- `docs/vocabulary/canonical_terms.md` (if it exists)
- `docs/subsystems/entity_field_semantics.md` (if any new field names appear)
- `docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md` (when either is in the diff)

Walk the change against each axis below. Emit findings using the same severity/category structure as Phase 6.

**Product principles alignment:**
- Does any new behavior silently change what callers receive without an opt-in parameter or an explicit signal in the response? (10.2 Explicit Over Implicit — flag as `product-principles`.)
- Does any new flow do work the user did not authorize? (e.g. background scanning, cross-session implicit storage — 10.2 and 10.7 Privacy Over Automation.)
- Does any new output drop provenance information (source IDs, timestamps, observation chain) that was previously present? (10.1 Truth Before Experience.)
- Are defaults safe (privacy-preserving, fail-closed for security, surfaces-bounded for performance)? (10.7.)
- Does any new code store meaning or interpretation rather than structured facts? (10.5 Structure Over Interpretation — extracted fields are fine; inferred intent is not.)
- Does any new schema field or entity property rely on LLM inference to determine truth rather than a schema rule? (10.4 Schema Over Semantics — type-driven, not inference-driven.)
- Does the state layer make any decision about what a state change *means* for consumers, or decide which consumers should act on it? (10.8 Signal Without Strategy — signals are infrastructure; consumers interpret.)

**Silent behavior changes:**
For each behavior change, ask: can the caller tell from the response that something was filtered, redirected, paginated, or truncated? If not — flag it. Common patterns:
- Server-side filtering with no `filtered_count` / `excluded_count` field
- Implicit type-narrowing of search results without a returned `applied_filter`
- Truncation without `has_more` / `total_count`
- Behavior that diverges from documentation (supplement, OpenAPI, MCP instructions) by default

**Agent instruction coherence** (when `docs/developer/mcp/instructions.md` or `docs/developer/cli_agent_instructions.md` is in the diff):
- Read the changed sections in full. Verify the new rules:
  - Do not contradict existing rules elsewhere in the same file
  - Cover edge cases (what does the agent do when the preference entity exists with an invalid value? when `check_blocked_plans` returns an error?)
  - Include the exact tool calls and parameters the agent needs (no hand-waving)
  - Use canonical terms from `docs/vocabulary/canonical_terms.md`
  - Maintain MCP ↔ CLI parity per `docs/developer/agent_instructions_sync_rules.mdc`
- Are examples present for any non-obvious behavior?

**Error and hint quality:**
For each new error code, `hint` string, or structured error response:
- Is the hint concrete enough to act on without reading source? (Names the exact tool, field, or command to invoke next.)
- Does it tell the operator *why* the error happened, not just *what* the code is?
- Is the hint stable text safe for agents to pattern-match on? (No interpolated user input that would make hint-matching fragile.)
- Does the error envelope follow `docs/subsystems/errors.md` taxonomy (structured `hint` / `details` / `issues` field, not concatenated into `message`)?

**API naming and semantic consistency:**
- Do new field names match the canonical vocabulary in `docs/vocabulary/canonical_terms.md`? (E.g. `entity_id` not `id`, `source_ref` not `external_id`, etc.)
- Do new fields follow `docs/subsystems/entity_field_semantics.md` rules? (E.g. `source` is a slug, never a URL; `source_url` for URLs.)
- Are response fields consistent with existing patterns? (E.g. snake_case, no abbreviations, units in name where ambiguous.)
- Are new pagination fields named consistently (`limit` / `offset` / `total_count` / `has_more`, not `page` / `per_page` / `count`)?

**Discoverability:**
- For any new capability (new tool, new flag, new error code): is there a discovery path for a fresh user/agent to find it? (Listed in `tool_definitions.ts`, mentioned in instructions, documented in `cli_reference.md`, error code in `docs/reference/error_codes.md` if that doc exists.)
- For new behavior that changes existing defaults: is the change called out in the release supplement's "Behavior changes" section?

**Supplement accuracy** (when this review runs from `/release` Step 3.6):
- Does every claim in the supplement match the actual code behavior?
- For each named parameter, field, error code, or tool in the supplement: verify it exists in the code with the described semantics.
- For each "default" stated in the supplement: trace it back to the code and confirm.
- Does the supplement contain an explicit **"Breaking changes"** section? This section is mandatory even for patch releases. If nothing broke, the section MUST read `No breaking changes.` — omitting the section entirely is a BLOCKING finding.
- Is the `npm run openapi:bc-diff` output reconciled? Any entry the tool flags as "Breaking" must appear by name in the supplement's "Breaking changes" section. Run the diff: `npm run openapi:bc-diff -- --base <last_tag> --head HEAD` (or use `--compare-base` if the last npm publish tag differs).
- This check exists because supplement drift is a common silent-failure mode — code merges without the supplement catching up. Flag any divergence as BLOCKING/contract.

### Phase 5c — Documentation completeness

Every functional change must leave the written documentation in sync with the code. A change is "functional" if it alters what callers receive, what agents can do, what operators must configure, or what error codes can appear.

For each functional surface changed, verify the following. Emit findings using `docs` or `discoverability` category.

**Subsystem docs (`docs/subsystems/`):**
- If `src/services/<subsystem>*` was changed in a user-observable way (new parameter, changed default, new behavior, new error), does `docs/subsystems/<subsystem>.md` (or the appropriate subsystem doc) describe the updated behavior?
- If a new subsystem file was added under `src/services/`, does a corresponding doc page exist or is one referenced from the Phase 2 conditional-load table?
- Flag as ADVISORY when the subsystem doc is silent on the changed behavior. Flag as BLOCKING when the subsystem doc actively contradicts the new code.

**MCP tool narrative docs (`docs/developer/mcp/`):**
- If a new MCP tool was added or an existing tool's parameters/semantics changed, is the change reflected in `docs/developer/mcp/instructions.md` (the fenced block, not just parity checks)?
- Is there a tool description entry in `docs/developer/mcp/tool_descriptions.yaml` (or equivalent) for new tools?
- Flag ADVISORY when docs are missing; BLOCKING when instructions describe removed/renamed parameters.

**CLI reference (`docs/developer/cli_reference.md`):**
- If a new CLI command or subcommand was added, is it present in `docs/developer/cli_reference.md`?
- If a new CLI flag was added, does `cli_reference.md` list it under the correct command section with type, default, and description?
- Flag ADVISORY.

**Error code registry (`docs/reference/error_codes.md`):**
- If a new error code constant was added to the codebase (e.g. `ERR_*`, `INGESTION_*`), is it listed in `docs/reference/error_codes.md` with HTTP status, retry eligibility, description, and common causes?
- Flag ADVISORY.

**`doc_dependencies.yaml` (`docs/doc_dependencies.yaml` if it exists):**
- If a new doc was added (subsystem doc, reference doc, architecture doc), is a dependency entry registered so future reviews load it when the relevant source paths change?
- Flag NIT.

**`docs/developer/pr_review_reading_list.md`:**
- If a new source path pattern (`src/services/<new>*`) was added, is a row present in the conditional-load table mapping it to the right doc(s)?
- Flag ADVISORY — missing entries cause future reviews to skip loading the doc for that surface.

**`docs/developer/agent_instructions.md` (operator index):**
- If a new tool, workflow, or behavior was added that an agent operator needs to know about (configure, enable, or be aware of), is it referenced from `docs/developer/agent_instructions.md`?
- Flag NIT.

**Docs site / public pages:**
- If the change adds a net-new user-facing capability (new tool available to agents, new CLI command, new error taxonomy), is there a planned or existing page under `docs/` that a first-time user could find via the table of contents or the docs site search?
- This is not about updating every existing page; it is about ensuring new capabilities are not entirely invisible to new users.
- Flag ADVISORY when a new capability has no discoverable docs path at all.

### Phase 6 — Emit findings

For each issue found, emit a finding in this format:

```
[BLOCKING|ADVISORY|NIT] <category>
File: <path>:<line> (or "multiple files" or "diff-wide")
Rule: <short rule name or doc reference>
Finding: <one or two sentences describing what's wrong>
Fix: <concrete action — what to change, what to add>
```

Categories: `arch-boundary` | `schema-agnostic` | `determinism` | `immutability` | `auth` | `contract` | `error-handling` | `test-coverage` | `pii` | `security` | `docs` | `doc-completeness` | `style` | `product-principles` | `silent-behavior` | `agent-instructions` | `hint-quality` | `naming` | `discoverability` | `supplement-accuracy` | `portability`

After all findings, emit a summary block:

```
--- Review Summary ---
Base..Head: <ref range>
Files reviewed: N
Blocking: N
Advisory: N
Nit: N

Verdict: APPROVED | APPROVED-WITH-NOTES | NEEDS-CHANGES

[If APPROVED-WITH-NOTES or NEEDS-CHANGES:]
Must fix before merge:
- [list blocking findings]

Should address in follow-up:
- [list advisory findings]
```

**Verdict rules:**
- `APPROVED` — zero blocking findings
- `APPROVED-WITH-NOTES` — zero blocking, one or more advisory/nit findings
- `NEEDS-CHANGES` — one or more blocking findings

### Phase 7 — Reference from release workflow

When invoked from `/release` Step 3.6, append the verdict to `docs/releases/in_progress/<TAG>/test_coverage_review.md` under a new `## Code review` section. A `NEEDS-CHANGES` verdict is a hard gate on Step 4 (execute).

## Constraints

- MUST read the full diff for changed files, not just stat output — stat alone misses logic errors
- MUST load conditional docs before evaluating that surface class
- MUST evaluate all checklist items and mark N/A when not applicable — skipping an item is not the same as N/A
- MUST emit findings in the structured format above; prose-only output is not acceptable
- MUST distinguish BLOCKING from ADVISORY — not every issue is merge-blocking
- MUST NOT produce a passing verdict when any BLOCKING finding exists
- MUST surface schema-agnostic design violations even when the code "works" — per-type branches accumulate silently
- MUST check `excludeBookkeeping` defaults whenever `entity_handlers.ts` is in the diff
- MUST run Phase 5c (documentation completeness) for every functional surface change — code that works but has no discoverable docs is an incomplete change
- MUST apply the portability check whenever `.claude/settings.json`, shell scripts, or CI workflow files are in the diff

## Integration points

The following skills and workflow steps should reference `/review`:

- `/release` Step 3.6 (test coverage review): run `/review <last_tag>..HEAD` before writing `test_coverage_review.md`
- `run_feature_workflow` final phase: suggest `/review <base>..<branch>` before merge
- `create_release` RC step: note that `/review` is available for pre-merge verification

## Never review (out of scope)

- `docs/private/` — confidential
- `docs/icp/`, `docs/use_cases/` — product/market positioning
- `docs/legal/` — legal
- `docs/ui/design_system/` — visual design
- `docs/reports/`, `docs/proposals/`, `docs/plans/` — planning artefacts
- `docs/assets/` — images
