---
name: Filesystem Markdown Records
overview: Add a local, filesystem-only markdown export flow for records, using SQLite as the canonical source of truth. The plan introduces a focused exporter service, a CLI command to generate/update files, and tests/docs for deterministic output and discoverability.
todos:
  - id: add_markdown_export_service
    content: Implement SQLite-backed markdown exporter service with deterministic rendering and write logic.
    status: pending
  - id: add_cli_export_command
    content: Add CLI command for filesystem markdown export with filters/output options.
    status: pending
  - id: add_tests_for_determinism
    content: Add unit + CLI integration tests validating path naming and stable markdown content.
    status: pending
  - id: update_docs_for_usage
    content: Document command usage and where generated markdown files are stored.
    status: pending
  - id: validate_no_interface_exposure
    content: Run validation to confirm no new API/UI/MCP exposure and SQLite remains canonical source.
    status: pending
isProject: false
---

# Filesystem Markdown Record Export Plan

## Goal

Expose records as markdown files on disk (no API/UI/MCP endpoint changes), with SQLite snapshots/observations as canonical source.

## Scope Decisions Captured

- No new interface exposure via API or CLI response payloads beyond a generation command.
- Markdown files are read directly from the filesystem.
- Canonical data source is local SQLite (`entity_snapshots`, `observations`, `relationship_snapshots`, and supporting `entities` metadata).

## Implementation Outline

### 1) Add a dedicated markdown exporter service

- Create a new service module to:
  - Read canonical record data from SQLite using existing local DB access patterns in [src/cli/index.ts](/Users/markmhendrickson/repos/neotoma/src/cli/index.ts) and [src/repositories/sqlite/sqlite_driver.ts](/Users/markmhendrickson/repos/neotoma/src/repositories/sqlite/sqlite_driver.ts).
  - Build deterministic markdown documents for:
    - entity record pages
    - optional relationship record pages
    - optional index pages (by type/date)
  - Write files under a predictable directory in data storage (for example `data/records_markdown/`).
- Reuse display naming/summarization helpers where possible from [src/shared/entity_display_name.ts](/Users/markmhendrickson/repos/neotoma/src/shared/entity_display_name.ts) and [src/shared/record_display_summary.ts](/Users/markmhendrickson/repos/neotoma/src/shared/record_display_summary.ts).

### 2) Define deterministic file layout and naming

- Use stable paths keyed by canonical IDs to avoid churn:
  - `records_markdown/entities/<entity_type>/<entity_id>.md`
  - `records_markdown/relationships/<relationship_type>/<encoded_relationship_key>.md` (if included)
  - `records_markdown/index.md` and optional `records_markdown/entities/<entity_type>/index.md`
- Normalize/encode unsafe characters in path segments and keep sorting deterministic.
- Include frontmatter-like metadata block (or fixed top section) with canonical identifiers, timestamps, and counts for inspectability.

### 3) Add CLI command to generate/export markdown records

- Extend [src/cli/index.ts](/Users/markmhendrickson/repos/neotoma/src/cli/index.ts) with a command such as:
  - `neotoma records markdown export`
- Add options for:
  - `--output <dir>` (default within data dir)
  - `--entity-type <type>` / `--entity-id <id>` filters
  - `--include-relationships` (default on/off per preference)
  - `--clean` (optional remove stale files before write)
- Command should print filesystem path summary and counts, not return record content inline.

### 4) Ensure canonical SQLite read path and consistency

- Query from snapshot tables first (`entity_snapshots`, `relationship_snapshots`) and supplement with latest observation context when needed.
- Avoid deriving canonical content from non-SQLite paths.
- Add clear behavior for missing snapshots (skip vs fallback), documented in command output.

### 5) Tests for deterministic markdown output

- Add unit tests for rendering and filename/path normalization.
- Add integration-style CLI test(s) that:
  - seed local SQLite fixtures
  - run markdown export
  - assert file tree + representative file contents are stable
- Place tests near existing SQLite/CLI suites:
  - [src/repositories/sqlite/**tests**/local_db_adapter.test.ts](/Users/markmhendrickson/repos/neotoma/src/repositories/sqlite/__tests__/local_db_adapter.test.ts)
  - [tests/cli](/Users/markmhendrickson/repos/neotoma/tests/cli)

### 6) Documentation updates

- Document feature in [docs/developer/cli_reference.md](/Users/markmhendrickson/repos/neotoma/docs/developer/cli_reference.md) (or nearest CLI doc).
- Add a short "inspect markdown records on disk" section in [install.md](/Users/markmhendrickson/repos/neotoma/install.md) and/or [README.md](/Users/markmhendrickson/repos/neotoma/README.md) with exact command and output directory.

## Validation

- Run targeted tests for new exporter + CLI command.
- Manually verify generated markdown directory is human-readable, deterministic between runs, and reflects SQLite canonical state.
- Confirm no API/MCP surface area changed.

