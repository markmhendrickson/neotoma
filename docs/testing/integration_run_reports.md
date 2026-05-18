---
title: Integration test Markdown run reports
summary: "When `WRITE_TEST_RUN_REPORT=1`, Vitest registers [`vitest.markdown_reporter.ts`](../../vitest.markdown_reporter.ts) and writes a human-readable Markdown summary after the run completes."
---

# Integration test Markdown run reports

When `WRITE_TEST_RUN_REPORT=1`, Vitest registers [`vitest.markdown_reporter.ts`](../../vitest.markdown_reporter.ts) and writes a human-readable Markdown summary after the run completes.

## Output location

Reports are written under **`.vitest/reports/`** (gitignored):

- `run-<ISO-timestamp>.md` — one file per run (filename derived from finish time).
- `latest-integration.md` — overwritten each run for quick local inspection.

## How to generate

```bash
# Integration suite (default local Vitest excludes remote-only files unless RUN_REMOTE_TESTS=1)
npm run test:integration:report

# Remote critical bundle (same as nightly workflow when secrets are set)
npm run test:remote:critical:report

# Cross-instance issues only (requires operator-style env; see test fixture)
RUN_REMOTE_TESTS=1 npm run test:integration:report -- tests/integration/cross_instance_issues.test.ts
```

## What is in the report

- Finish time, Vitest end reason (`passed` / `failed` / `interrupted`), Node version.
- Redacted environment summary (see [`tests/helpers/redact_for_test_report.ts`](../../tests/helpers/redact_for_test_report.ts)).
- Per test module: state, timing diagnostics, collection errors, and a table of every test case with result and duration.
- Unhandled errors (if any).
- Aggregate pass / fail / skip counts.
- **Scenario notes** — optional appendix populated via `reportCase()` from [`tests/helpers/test_report_buffer.ts`](../../tests/helpers/test_report_buffer.ts) (used by high-signal suites such as `cross_instance_issues`).

## Redaction

Do not put secrets or raw tokens into `reportCase` payloads. The buffer runs shallow string redaction (Bearer tokens, `access_token=`, GitHub token env hints, home-directory segments). Prefer stable labels (`visibility`, `test_repo` slug) over live URLs when logging scenario metadata.

## CI

The remote integration nightly workflow uploads `.vitest/reports/` as a workflow artifact when `WRITE_TEST_RUN_REPORT=1` is set for that job.

## Release evidence (optional)

Default releases do **not** commit these files (they live under `.vitest/`). If you want a **committed** validation artifact for a specific version (e.g. compliance-heavy release):

1. Run the same suite you intend to ship with `WRITE_TEST_RUN_REPORT=1`.
2. Copy the generated Markdown into `docs/releases/in_progress/vX.Y.Z/` (e.g. `test_run_report.md`), redact again if anything sensitive slipped through.
3. Commit it with your release prep commits and mention it in the GitHub Release supplement under **Tests and validation**.

This path is manual unless you later automate it in the release workflow.
