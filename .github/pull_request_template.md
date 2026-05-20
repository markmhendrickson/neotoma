<!--
This template mirrors the Pre-PR checklist from .claude/rules/change_guardrails_rules.md,
trimmed to items a reviewer can verify from a diff. The full Touchpoint Matrix and
canonical doc index live in that rule; consult it when unsure.

Delete sections that don't apply to this change.
-->

## Summary

<!-- 1-3 sentences: what changes and why. Link to issue/discussion if applicable. -->

## Touchpoints

<!-- Tick every surface this PR touches. Each surface has a canonical doc in
.claude/rules/change_guardrails_rules.md § "Canonical doc index". -->

- [ ] HTTP endpoint / request / response field
- [ ] MCP tool definition or behavior
- [ ] CLI command, flag, or runtime override
- [ ] Error envelope / hint / validation tightening
- [ ] Auth / user-id resolution / proxy trust / local-dev shortcut
- [ ] Schema registry, entity type, or per-type behavior
- [ ] Ingestion / store / correction path
- [ ] Source / observation lifecycle (immutability)
- [ ] Reducer / merge / snapshot
- [ ] Relationships
- [ ] Timeline / events
- [ ] Release supplement or release tooling
- [ ] Logging, metrics, events, traces
- [ ] File / folder rename, npm script rename
- [ ] None — pure docs / tests / internal refactor

## Pre-PR checklist

### API & contract

- [ ] `openapi.yaml` edited first; `npm run openapi:generate` output committed alongside
- [ ] `src/shared/contract_mappings.ts` updated for any new `operationId`, MCP tool, or CLI command
- [ ] `npm test -- tests/contract/` passes
- [ ] New top-level CLI commands listed in `tests/cli/cli_command_coverage_guard.test.ts`
- [ ] MCP and CLI agent-instruction parity confirmed
- [ ] Runtime overrides follow `flag > env > default` and appear in the cli_reference Runtime overrides table
- [ ] New env vars are `NEOTOMA_`-prefixed and read in `preAction`
- [ ] Error hints emitted as structured `hint` / `details` fields, not concatenated into `message`
- [ ] If this PR causes previously-accepted input to be rejected, a structured `hint` is populated and a `tests/contract/legacy_payloads/` fixture is updated
- [ ] New top-level request bodies in `openapi.yaml` declare `additionalProperties: false` (unless implicit tolerance is intentional and documented in the schema `description`)

### Data layer

- [ ] Data-layer changes preserve determinism (reproducible IDs, stable ordering, canonicalized LLM output)
- [ ] Mutating ops honor `idempotency_key`; ingestion writes are transactional
- [ ] No mutation of sources or observations after creation (reinterpretation = new observation)
- [ ] No new PII in logs, metric labels, event payloads, or error messages
- [ ] Per-type behavior expressed as a `SchemaDefinition` declaration rather than a code branch (per `.claude/rules/schema_agnostic_design_rules.md`)

### Security

- [ ] `npm run security:classify-diff` recorded; if `sensitive=true`, all of:
  - [ ] `npm run security:lint` clean
  - [ ] `npm run security:manifest:check` passes
  - [ ] `npm run test:security:auth-matrix` passes
  - [ ] `docs/releases/in_progress/<TAG>/security_review.md` exists with a sign-off verdict
- [ ] New Express routes registered in `protected_routes_manifest.json` (or runtime unauth allow-list with a `reason`); manifest regenerated via `npm run security:manifest:write` when needed
- [ ] No bare `req.socket.remoteAddress`, `X-Forwarded-For`, or `Host` reads outside `src/actions.ts` / `src/services/root_landing/**`; auth-local fallbacks gated through `assertExplicitlyTrusted`

### Release & process

- [ ] For release PRs: `npm run openapi:bc-diff` output reviewed; any "Breaking" entries named in the supplement's "Breaking changes" section (or supplement contains `No breaking changes.`)
- [ ] `tests/contract/legacy_payloads/replay.test.ts` passes; outcome flips paired with a new entry in `CHANGES.md`
- [ ] Release-visible changes documented in a supplement under `docs/releases/in_progress/<TAG>/`; historical supplements untouched
- [ ] Renamed files are `snake_case` and `foundation_config.yaml` + `.claude/rules/` symlinks updated

## Test plan

<!-- What you ran. What a reviewer should re-run. Include relevant npm scripts. -->

## Notes for reviewer

<!-- Anything non-obvious: design tradeoffs, follow-ups, risks. -->
