# FU-2026-05-audit-cli — `neotoma audit` CLI command

## Problem

Neotoma has strong write-path discipline (idempotency, schema-first, immutability, deterministic IDs, transactional ingestion) but no holistic read-path "is my graph healthy?" tool. Users accumulate quality drift over time:

- Duplicate entity types with overlapping aliases (e.g. `vendor`/`merchant`/`payee`).
- Plural type names that violate `schema_agnostic_design_rules.md` and split rows across siblings (validated against live registry 2026-05-16: `places`/`place`, `plans`/`plan`, `meeting_notes`/`meeting_note`).
- Excessive `raw_fragments` signaling missing schema declarations.
- Non-human-readable `canonical_name` values (UUIDs, hashes, empty strings).
- Orphans, cycles in `PART_OF`/`DEPENDS_ON`, dangling relationships, untyped edges.
- Interpretation rows stuck mid-run with stale `heartbeat_at`.

Today, finding these requires hand-rolled SQL or one-off MCP tool calls. The `/audit` skill (`.cursor/skills/audit/`) prototypes the check set in-conversation but is not callable from CI, scheduled runs, or non-Claude harnesses.

## Goals

1. Promote the audit check set from skill (in-conversation, ad-hoc) to a first-class CLI command: `neotoma audit`.
2. Expose the same surface via MCP so any connected agent can invoke it.
3. Keep detection strictly separated from repair; repair routes through existing tools (`merge_entities`, `correct`, `register_schema`, etc.) with per-finding user confirmation.
4. Make the audit cheap by default (deterministic only) and opt-in for LLM-assisted checks.
5. Persist each audit run as an `audit_run` entity so historical comparisons (regression / progress) are queryable.

## Key problems solved

- No holistic graph-health surface today.
- Quality drift accumulates silently; no early-warning mechanism.
- Plural/duplicate type names already exist in production registries with no automated way to find or fix them.
- LLM-assisted quality checks (canonical name readability, type misclassification) are not feasible per-entity at scale without batching infrastructure.

## Key solutions implemented

- New CLI command `neotoma audit` with flags `--deep`, `--scope`, `--since`, `--user`, `--format`, `--exclude-test-fixtures`, `--yes`.
- Same surface via new MCP tool `audit_database`.
- 16 deterministic checks (listed in `.cursor/skills/audit/SKILL.md` Phase 2).
- 6 LLM-assisted checks behind `--deep` flag, gated by API key + cost cap (`NEOTOMA_AUDIT_COST_CAP`, default $1).
- `Finding` record type with structured `remediation` pointing at existing tools.
- New `audit_run` entity_type registered in schema registry.
- New `findings` table or JSONB column on `audit_run` for per-finding persistence (TBD in design phase).
- Repair phase delegates to existing tools — no new mutation surface.

## Scope

**In scope:**
- New CLI command and MCP tool.
- New `audit_run` entity_type + storage.
- All 16 deterministic checks listed in the skill.
- LLM check infrastructure (batching, cost cap, key handling) but only 2 of the 6 LLM checks implemented in this FU (the rest deferred to a follow-up FU): `LLM_CANONICAL_READABILITY`, `LLM_DUPLICATE_BY_CONTENT`.
- OpenAPI contract update per `docs/architecture/openapi_contract_flow.md`.
- Contract mappings row for the new tool.
- CLI command coverage guard test entry.
- MCP ↔ CLI agent-instruction parity update.

**Out of scope:**
- 4 of the 6 LLM checks (deferred): `LLM_ENTITY_TYPE_MISCLASS`, `LLM_SEMANTICALLY_EQUIVALENT_TYPES`, `LLM_FRAGMENT_PROMOTION`, `LLM_RELATIONSHIP_SUGGESTION`.
- Auto-repair (no `--auto-fix` flag; repair always confirms).
- Bulk import migration (use `correct` per-entity instead).
- Web UI for audit results.
- Scheduled / cron-based audit (use the existing `/loop` or `/schedule` skills with `neotoma audit`).

## Subsystems affected

- `src/cli/index.ts` — new `audit` command.
- `src/server.ts` + `src/tool_definitions.ts` — new `audit_database` MCP tool.
- `src/shared/contract_mappings.ts` — new operationId row.
- `src/services/audit/` — new module, one file per check.
- `src/services/schema_bootstrap.ts` — seed `audit_run` schema.
- `openapi.yaml` — new endpoint declaration.
- `tests/cli/cli_command_coverage_guard.test.ts` — add `audit` entry.
- `docs/developer/cli_reference.md` — runtime overrides table.
- `docs/developer/mcp/instructions.md` + `docs/developer/cli_agent_instructions.md` — agent instructions for invoking audit.

## QA needs

**Unit tests** (per check, mocking the data layer):
- Each of the 16 deterministic checks with at least one happy-path fixture and one no-findings fixture.
- LLM check infrastructure: cost-cap enforcement, batching, key absence error, malformed response handling.

**Integration tests:**
- End-to-end run against a seeded test DB containing known issues; assert exact finding set.
- Legacy-payload corpus entry for the new endpoint per `docs/architecture/openapi_contract_flow.md`.
- Contract test for the new MCP tool.
- CLI command coverage guard entry.

**Manual tests:**
- Run `neotoma audit` against a real user DB; verify report shape and remediation hints.
- Run `neotoma audit --deep` with a real API key; verify cost cap aborts above threshold.
- Run repair phase against a synthetic duplicate-types DB; verify `merge_entities` is called with confirmed args only.

**Determinism check:** running the same audit twice on an unchanged DB MUST produce byte-identical findings (sorted by finding ID, then entity ID).

## Documentation update needs

- New section in `docs/developer/cli_reference.md` for `neotoma audit` command + runtime overrides.
- Update `docs/developer/mcp/instructions.md` to describe the `audit_database` tool.
- Mirror to `docs/developer/cli_agent_instructions.md` per the anchor rule.
- Update `docs/subsystems/` with a new `audit.md` describing the check catalog (or extend `entities.md`).
- Add release supplement section noting the new tool and `audit_run` entity_type.
- README.md update: add `neotoma audit` to the quick-reference.

## Risk

**Medium.** New tool surface (CLI + MCP + OpenAPI) requires the full change-guardrails sequence (spec-first, contract mappings, parity tests, coverage guard). No schema mutations beyond the new `audit_run` entity_type. No auth changes. No data migrations.

Mitigations:
- Skill prototype already validated the check set against the live dev registry (435 entity types, real findings).
- Detection-only by default; repair surface delegates to existing tools that already have their own validation.
- LLM checks gated behind explicit flag + cost cap.

## Dependencies

- Existing tools: `list_entity_types`, `get_entity_type_counts`, `list_relationships`, `list_potential_duplicates`, `retrieve_entity_snapshot`, `list_observations`, `merge_entities`, `correct`, `register_schema`, `update_schema_incremental`, `delete_entity`, `delete_relationship`, `create_relationship`, `split_entity`.
- `create_relationship` MCP tool fix ([neotoma#159](https://github.com/markmhendrickson/neotoma/issues/159)) — currently exposes empty schema; repair phase needs this fixed to wire suggested-relationship findings.

## Open questions

1. Should `audit_run` persist full `Finding[]` inline (JSONB) or in a separate `audit_findings` table? Tradeoff: queryability vs simplicity. Recommend JSONB for v1.
2. LLM check cost-cap default — $1 is conservative; should it scale with `--scope`?
3. Should the CLI default `--exclude-test-fixtures=true`? Recommend yes; test fixtures dominate the registry in dev environments.
