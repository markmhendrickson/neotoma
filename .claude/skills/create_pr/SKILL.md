---
name: create_pr
description: Open a high-quality pull request with a standardized description (Problems / Solutions / UX improvements / Documentation / Test plan / Breaking changes), the change_guardrails_rules.md pre-PR checklist enforced, and thorough functional-change documentation under docs/ surfaced via the docs server and docs site. Use this whenever a PR is about to be opened — directly via /create_pr or as a sub-step of /process_issues, /process_prs, /release, /fix_feature_bug.
---

# /create_pr — Standardized PR creation

## When to invoke

- User says `/create_pr` or asks to open a PR.
- Another skill (`/process_issues`, `/process_prs`, `/release`, `/fix_feature_bug`) reaches the point of opening a PR. Call this skill rather than inlining `gh pr create`.
- A worktree has a committed branch ready for review and no PR exists yet.

Do **not** invoke when amending an existing PR description — use `gh pr edit` directly with the same body conventions below.

## Inputs

The caller (or the user) should provide, or this skill should infer:

- **Branch** — current branch (`git branch --show-current`); if it equals the configured main branch, stop and ask.
- **Base branch** — usually `main`; for release work, the RC branch.
- **Linked issue(s)** — GitHub issue number(s) the PR closes or refers to.
- **Source plan / spec** — Neotoma `plan` entity_id or `docs/` path, if any.
- **Change classification** — bug fix / feature / refactor / docs / release. Drives commit-style prefix in the title.
- **Functional surface touched** — CLI command/flag, MCP tool, HTTP endpoint, observable event, schema field, runtime knob, integration. Drives the docs-coverage check below.

## Functional change documentation (mandatory for functional changes)

Every PR that changes user-observable behavior MUST ship thorough markdown documentation under `docs/`, and MUST surface it via the docs server (`src/services/docs/`) and the docs site (`docs/site/pages/` via `docs/site/site_doc_manifest.yaml`). A PR that adds, removes, or changes any of the following counts as functional:

- A CLI command, subcommand, flag, env var, or output format
- An MCP tool name, parameter, or response shape
- An HTTP endpoint, request/response field, or error envelope field
- An entity_type schema field, relationship type, or canonical-name rule
- An observable event payload, metric name, or log structure
- A user-visible runtime config knob (timeout, header policy, allow-list)
- An integration/provider added or removed

### What "thorough" means

The doc MUST cover:

1. **What the surface is and what it's for** — one-paragraph orientation grounded in a use case.
2. **Inputs / parameters / fields** — every parameter or field with type, default, allowed values, and constraints. Don't describe only the happy path.
3. **Outputs / responses / side effects** — what the caller gets back, what state changes, what events fire.
4. **Examples** — at least one complete request/response or invocation/output pair, in a fenced code block, that a reader can copy.
5. **Error modes** — every documented `ERR_*` code and structured `hint` the surface can return, with cause and remediation.
6. **Cross-references** — links to the canonical doc that owns the surface (per `change_guardrails_rules.md` § Canonical doc index) and to any plan/issue.

### Where the doc lives

Pick the canonical location based on what changed; do not create a new top-level docs subdirectory without a reason. Common homes:

- CLI surfaces → extend `docs/developer/cli_reference.md` (or a focused page under `docs/developer/`).
- MCP tools → `docs/developer/mcp/` (and mirror behavioral rules into `docs/developer/mcp/instructions.md` per the canonical-first rule).
- HTTP / API → `docs/api/` plus `openapi.yaml`.
- Subsystems → `docs/subsystems/<subsystem>.md`.
- Architecture decisions → `docs/architecture/` and `docs/architecture/architectural_decisions.md` registry.
- Observability surfaces (events, metrics, logs) → `docs/observability/`.
- Integrations → `docs/integrations/<provider>.md`.
- User-facing release notes → in-progress supplement under `docs/releases/in_progress/<TAG>/`.

When extending an existing doc, place the new content under the most specific existing heading and update the table of contents / cross-references; do not append orphan paragraphs.

### Surfacing via docs server and site

Both surfaces must list the doc, not just the filesystem:

- **Docs server** (`src/services/docs/`) — verify the new or updated path is discoverable. Run the docs-service tests after editing:
  ```bash
  npm test -- src/services/docs
  ```
  If the doc is new and the discovery layer doesn't pick it up automatically, register it in the appropriate index module (the `docs` service owns this; do not hand-edit generated indexes — update the source).
- **Docs site** (`docs/site/pages/` rendered from `docs/site/site_doc_manifest.yaml`) — add the doc to `docs/site/site_doc_manifest.yaml` under the right section, and add a `pages/` entry if the manifest convention requires one. Run the manifest tests:
  ```bash
  npm test -- src/services/docs/manifest_loader
  ```

### Abort criteria

If the PR makes a functional change and any of the following is true, **stop and surface the gap before opening the PR**:

- No new or modified file under `docs/` covers the change.
- The doc exists but is missing one of: parameters/fields, outputs, an example, or error modes.
- The doc is not reachable via the docs server (not in the discovery surface).
- The doc is not listed in `docs/site/site_doc_manifest.yaml`.

## Pre-PR checklist (run before opening)

From `.claude/rules/change_guardrails_rules.md` — surface these as a checklist in the PR body, and abort if a hard-required item fails:

1. **OpenAPI-first**: if any handler, request field, or response field changed, `openapi.yaml` was edited first and `npm run openapi:generate` output is committed.
2. **Contract mappings**: `src/shared/contract_mappings.ts` updated for any new `operationId`, MCP tool, or CLI command.
3. **Tests**: `npm test -- tests/contract/` passes; new top-level CLI commands appear in `tests/cli/cli_command_coverage_guard.test.ts`.
4. **Agent-instruction parity**: MCP and CLI agent instructions mirrored (run `neotoma cli config --yes` if instructions changed).
5. **Runtime overrides**: any new override follows `flag > env > default`, with a `NEOTOMA_`-prefixed env var, listed in `cli_reference.md`.
6. **Errors**: structured `hint` / `details` / `issues` populated; no upgrade text concatenated into `message` strings.
7. **Tightening change**: if previously-accepted input now rejects, a legacy-payload fixture under `tests/contract/legacy_payloads/` is updated and `CHANGES.md` has the entry.
8. **Breaking changes**: release-visible breaking changes named in `docs/releases/in_progress/<TAG>/` supplement under an explicit `Breaking changes` section. Use the literal line `No breaking changes.` when none.
9. **Determinism / immutability / privacy**: no `Math.random()`, no `Date.now()` in ID derivation, no PII in logs, metric labels, event payloads, or error messages.
10. **Security gates**: `npm run security:classify-diff` recorded; if `sensitive=true`, `security:lint`, `security:manifest:check`, `test:security:auth-matrix` all clean and `security_review.md` filled.
11. **User-facing surface coverage**: any new CLI command / flag, destructive op, external-file parser, or HTTP runtime knob has an end-to-end test (not just a helper unit test).
12. **File naming**: snake_case for new files; `foundation_config.yaml` / `.claude/rules/` symlinks updated on rename.
13. **Functional-change documentation**: docs/ entry exists per the section above, covers parameters/outputs/examples/error modes, is discoverable via `src/services/docs/`, and is listed in `docs/site/site_doc_manifest.yaml`. Required whenever any functional surface is touched.
14. **Downstream docs**: per `.claude/rules/downstream_doc_updates.md` and `docs/doc_dependencies.yaml`, any upstream doc edit propagated to its downstream consumers in this PR.

If any item in 1–4, 7, 8, 10, 11, or 13 fails, **stop and surface the gap to the user** before opening the PR.

## PR title conventions

- ≤70 characters.
- Conventional-commit prefix matching the repository's recent `git log` style: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `docs(scope):`, `chore(scope):`, `test(scope):`.
- Title states the outcome, not the activity. "Add Problems/Solutions sections to /create_pr template" beats "Update create_pr skill."

## PR body template

Use this exact structure. Omit a section only when it would genuinely be empty.

```markdown
## Problems

- <Concrete pain point, failure mode, or gap this PR addresses.>
- <If there's a tracked issue, link it: "Fixes #123" — GitHub will auto-close on merge.>

## Solutions

- <Concrete change made, file-scoped where helpful: `src/foo.ts` now does X.>
- <Design choice with the alternative considered, when non-obvious.>

## UX improvements

- <User-visible behavior changes: CLI output, error messages, response shape, latency.>
- <If purely internal, write "No user-visible change." — don't omit the section silently.>

## Documentation

- <Path(s) under `docs/` added or updated, e.g. `docs/developer/cli_reference.md`, `docs/subsystems/foo.md`.>
- <Confirmation the doc covers parameters, outputs, an example, and error modes.>
- <`docs/site/site_doc_manifest.yaml` entry added/updated; docs service tests pass.>
- <If purely non-functional (refactor, internal rename, test-only) write "No functional change; no user-facing docs required.">

## Test plan

- [ ] `npm run type-check`
- [ ] `npm test`
- [ ] `npm test -- src/services/docs` (if docs changed)
- [ ] `npm run test:integration` (if backend/DB)
- [ ] `npm run test:e2e` (if UI)
- [ ] Manual verification: <steps>

## Breaking changes

<Literal line `No breaking changes.` OR a bulleted list of breaking changes, each linked to the release supplement entry under `docs/releases/in_progress/<TAG>/`.>

## Related

- Plan: <Neotoma plan entity_id or docs/ path>
- Issue(s): <#123, #456>
- Foundation rules touched: <list>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Mechanics

1. **Verify branch state**
   - `git status` clean; uncommitted changes → stop and ask.
   - `git rev-parse --abbrev-ref HEAD` ≠ main branch.
   - `git log <base>..HEAD --oneline` to enumerate commits for the description.

2. **Detect functional change and check docs**
   - Diff `git diff --name-only <base>..HEAD` against the functional-surface list above.
   - If functional, verify there is at least one `docs/**/*.md` change in the diff, that it covers the required content elements, that the docs service surfaces it, and that `docs/site/site_doc_manifest.yaml` lists it.
   - If any check fails → stop and surface the gap.

3. **Push if needed**
   - `git push -u origin HEAD` if no upstream is set.
   - On rejection, follow `git_remote_sync.md` (pull --no-rebase, resolve, push).

4. **Draft body** via HEREDOC into a temp variable. Never inline multi-line strings into `gh pr create -b`.

5. **Open the PR**
   ```bash
   gh pr create --base <base> --title "<title>" --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```

6. **Return** the PR URL to the caller.

7. **Link to plan/issue in Neotoma** — if a `plan` entity exists for this work, call `store` to set `pr_url` on the plan, then `create_relationship(REFERS_TO, plan, pr)` if a `pull_request` entity is created downstream.

## Invocation contract (for other skills)

Other skills should call `/create_pr` with a structured handoff:

```
/create_pr
  base: main
  branch: <current>
  closes_issues: [123, 456]
  plan_entity_id: ent_xxx (optional)
  classification: fix|feat|refactor|docs|chore
  functional_surface: cli|mcp|http|schema|event|integration|none
  problems: <bullet list>
  solutions: <bullet list>
  ux_improvements: <bullet list or "No user-visible change.">
  documentation:
    paths: [docs/.../foo.md, ...]
    site_manifest_updated: true|false
    docs_service_verified: true|false
  breaking_changes: <bullet list or "No breaking changes.">
  test_plan: <bullet list>
```

`/create_pr` is responsible for: rendering the body, running the pre-PR checklist, running the functional-change documentation check, executing `gh pr create`, and returning `{ pr_url, pr_number }`.

Callers are responsible for: ensuring the branch is committed, supplying accurate Problems/Solutions/UX/Documentation content, and following up on any checklist gaps surfaced by this skill.

## Constraints

- MUST use the exact section order above.
- MUST NOT silently omit `Breaking changes` — write `No breaking changes.` instead.
- MUST NOT omit the `Documentation` section for functional changes.
- MUST NOT open a PR for a functional change without a docs/ entry surfaced by both the docs server and `docs/site/site_doc_manifest.yaml`.
- MUST NOT use `--no-verify` or skip hooks.
- MUST NOT force-push to the base branch.
- MUST run the pre-PR checklist (including the functional-change documentation gate) before opening.
- MUST pass the body via HEREDOC, not as a multi-line `-b` argument.

## Related rules / docs

- `.claude/rules/change_guardrails_rules.md` — Pre-PR checklist source of truth.
- `.claude/rules/plan_sections_rules.md` and `plan_format.md` — Origin of Problems / Solutions structure.
- `.claude/rules/downstream_doc_updates.md` and `docs/doc_dependencies.yaml` — Upstream→downstream doc propagation.
- `.claude/rules/readme_maintenance.md` — README regeneration when materially affected.
- `.claude/rules/git_remote_sync.md` — Push/pull recovery.
- `docs/site/site_doc_manifest.yaml` — Docs-site surface registration.
- `src/services/docs/` — Docs server discovery and rendering.
- `docs/developer/github_release_process.md` — Breaking changes section requirements.
