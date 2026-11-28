# Test coverage review: v0.32.0

Range: `v0.31.0..bb01a10ed` (2 commits: #2944, #2946). Reviewed by Phoenicurus (automated preparation pass; operator approval pending), 2026-11-28.

## Code review

Verdict: **APPROVE-WITH-ADVISORIES**. No BLOCKING findings.

Guardrail walk:

- Schema-agnostic design: the index reads existing `standing_rule` and skill data. No `entity_type` branch added.
- Determinism: the index renders in the priority order the rules block already uses. No clock, random or unstable sort.
- Contract seams: no `openapi.yaml`, `contract_mappings.ts`, MCP tool or CLI command change. `neotoma instructions print` changes output text only. `openapi:bc-diff` reports no breaking changes.
- Auth: `src/actions.ts` edits only compose instruction text and the `Content-Disposition` header. No auth, proxy-trust or guest-gate change. See `security_review.md`.
- Agent-instruction parity: `docs/developer/mcp/instructions.md` is the single behavioral source. `cli_agent_instructions.md` was not duplicated into, as the sync rules require.
- Advisory: the supplement says the instance policy still follows the base block, so a client that cuts very early can lose it. This is stated in the supplement and unchanged from before.
- Advisory: `tests/integration/source_content_download_filename.test.ts` asserts that the DB read-back equals the stored lone-surrogate name before it exercises the header path. In the preparation environment that precondition failed (the read-back held three U+FFFD characters, not one) and the case did not reach the download. CI is green on the same SHA (`CI test lanes`, run for `bb01a10ed`). The lone-surrogate header behavior itself is covered by `tests/unit/content_disposition.test.ts`, which passes. Treat the integration case as backend-dependent.

## Surfaces

### MCP instructions session index (all entrances)

Classification: **covers user-observable behavior end-to-end.**

- `tests/integration/instructions_session_index.test.ts` asserts the index on the instruction entrances, including the 2,048-byte cap and the empty instance (byte-identical text).
- `tests/unit/instructions_index.test.ts` covers the renderer: truncation notices, failed lookups, UTF-8 clipping.
- Existing standing-rules entrance tests were updated to skip the leading index and pass.

### `neotoma instructions print` (changed command output)

Classification: **covers user-observable behavior end-to-end.** `tests/integration/standing_rules_cli_instructions_print.test.ts` invokes the command and asserts output. Passes.

### `GET /sources/:id/content` Content-Disposition

Classification: **covers user-observable behavior end-to-end.** `tests/integration/source_content_download_filename.test.ts` stores a file, downloads it over HTTP and asserts the header and body bytes (6 of 7 cases pass locally; see advisory above). `tests/unit/content_disposition.test.ts` covers the encoder.

## Test run (preparation environment)

Targeted run of the 8 affected files: 68 passed, 1 failed (the environment-dependent case above). `test:security:auth-matrix`: 18 passed, 1 skipped.
