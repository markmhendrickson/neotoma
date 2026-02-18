# Developer preview launch checklist

## Scope

This checklist consolidates criteria for releasing Neotoma as a developer preview. It is derived from the ateles developer-preview criteria assessment and announcement framing. Use it to verify readiness before announcing or promoting the preview.

This document does not cover marketing, positioning, or post-preview roadmap; see [Developer preview storage](developer_preview_storage.md), [README – Developer preview](../../README.md#developer-preview), and release docs as needed.

---

## 1. Contract surface (MVP scope)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| OpenAPI as single source of truth | Done | `openapi.yaml` at repo root; `src/shared/contract_mappings.ts` defines `OPENAPI_OPERATION_MAPPINGS` with operationId, path, mcpTool, cliCommand per operation. |
| CLI + MCP as adapters to same contract | Done | Mappings in `contract_mappings.ts`; CLI in `src/cli/index.ts`; MCP tool handling in `src/server.ts` (CallToolRequestSchema). |
| No web app in scope for announced preview | Done | README and this checklist frame preview as CLI + MCP + OpenAPI only; frontend exists for development/future use. |

**Verdict:** Contract surface is in place.

---

## 2. Guarantees and disclaimers (in repo)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Four guarantees documented in repo | Done | [README – Developer preview](../../README.md#developer-preview): no silent data loss; explicit, inspectable state mutations; auditable operations; CLI and MCP map to same underlying contract. |
| "What is not guaranteed yet" documented | Done | README: stable schemas, deterministic extraction across versions, long-term replay compatibility, backward compatibility; breaking changes expected. |
| Who this is for / not for | Done | README: "Who this is for" and "Who this is not for (yet)" under Developer preview. |

**Verdict:** Guarantees and disclaimers are in the Neotoma repo.

---

## 3. MCP ↔ CLI audit trail

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every MCP tool call logs equivalent CLI invocation | Done | `src/server.ts` (CallToolRequestSchema handler): `buildCliEquivalentInvocation(name, args)` then `logger.info(\`[MCP Server] CLI equivalent: ${cliEquivalent}\`)`. |
| Redaction-aware logging | Done | `contract_mappings.ts`: `sanitizeCliArgs()`, `SAFE_ARG_FIELDS`; only safe fields (e.g. type, limit) logged; others `<redacted>`. |

**Verdict:** MCP ↔ CLI audit trail is implemented.

---

## 4. CLI output contract

| Criterion | Status | Evidence |
|-----------|--------|----------|
| CLI has stable `--json` | Done | `src/cli/index.ts`: `.option("--json", "Output machine-readable JSON")`; documented in `cli_reference.md`, `cli_overview.md`. |
| CLI has `--pretty` for humans | Done | `src/cli/index.ts`: `.option("--pretty", "Output formatted JSON for humans")`; mutual exclusivity with `--json` enforced. |
| MCP never parses human output | Done | MCP uses `executeTool()` and returns structured responses; does not invoke CLI and parse stdout. See `docs/proposals/mcp-cli-action-items.md` and related reports. |

**Verdict:** CLI output contract is satisfied.

---

## 5. Fixtures and failure gallery

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Fixtures and expected outputs | Done | `tests/fixtures/` with README; `expected/` (e.g. contact_snapshot.json, transaction_snapshot.json); replay_graph and other fixture tests. |
| Failure gallery | Done | `docs/reports/failure_gallery.md`: failure cases (auth, idempotency conflict, invalid schema, not found, etc.), error envelopes, testing requirements. |

**Verdict:** Fixtures and failure gallery are in place.

---

## 6. Developer preview storage stance

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Local-only stance documented | Done | [Developer preview storage](developer_preview_storage.md): preview supports local storage only (SQLite + local file storage); Supabase not supported in preview. |
| When to use local vs remote (future) | Done | Same doc: quick reference table; "when remote storage is reintroduced" and use cases (multi-user, hosted, etc.). |
| README and getting started aligned | Done | README Developer preview section and [Getting started](getting_started.md) reference local-only for preview. |

**Verdict:** Developer preview storage stance is documented.

---

## 7. Summary: checklist status

| Area | Fulfilled | Outstanding |
|------|-----------|-------------|
| Contract surface (OpenAPI, CLI, MCP) | Yes | — |
| Four guarantees + "not guaranteed yet" in repo | Yes | — |
| MCP logs CLI equivalent (redaction-aware) | Yes | — |
| CLI `--json` / `--pretty`; MCP does not parse human output | Yes | — |
| Fixtures + expected outputs + failure gallery | Yes | — |
| Local-only default; storage stance documented | Yes | — |

All criteria from the ateles developer-preview assessment are currently satisfied in this repo.

---

## 8. Before public launch (release hygiene)

These are not criteria for "preview readiness" but should be done before promoting the preview publicly. They reflect current README "Next steps" and pre-release validation.

| Item | Status | Notes |
|------|--------|-------|
| Uncommitted changes reviewed | Outstanding | README: "Review uncommitted changes (262 files)". Resolve or document before announcement. |
| Pending migrations applied | Outstanding | Apply any pending migrations; run `npm run migrate` and verify. |
| Test suite audited | Outstanding | Run full test suite; address flakiness or failures. See [Pre-release validation](pre_release_validation_rules.mdc). |
| Version / release wording | Outstanding | Decide whether to tag a release (e.g. v0.4.0) or announce "current main" as preview; update README "Current Status" and "Developer preview" line accordingly. |

---

## References

- **Ateles:** `reports/neotoma-developer-preview-criteria-assessment.md`, `reports/drafts/neotoma-developer-preview-announcement-draft.md`, `reports/mcp-vs-cli-chatgpt-recommendations-coverage.md`
- **This repo:** [README – Developer preview](../../README.md#developer-preview), [Developer preview storage](developer_preview_storage.md), [Getting started](getting_started.md), [Failure gallery](../reports/failure_gallery.md), [Pre-release validation](pre_release_validation_rules.mdc)

---

## Agent instructions

### When to load this document

- Verifying developer preview readiness before announcement or promotion
- Planning or executing a developer preview release
- Auditing repo against external criteria (e.g. ateles assessment)

### Constraints

- Treat "Summary: checklist status" as the single source for criterion fulfillment in this repo
- Update this checklist when criteria change or when new evidence (files, behavior) is added
- "Before public launch" items are release hygiene, not contract or guarantee requirements
