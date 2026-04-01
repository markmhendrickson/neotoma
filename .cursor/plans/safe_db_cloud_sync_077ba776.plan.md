---
name: Safe DB Cloud Sync
overview: Design and implement a cloud-safe synchronization approach by syncing validated snapshots or logical records instead of the live SQLite database file.
todos:
  - id: architecture-choice
    content: Finalize snapshot-vs-record replication strategy and storage paths
    status: pending
  - id: safe-export
    content: Implement checkpointed atomic snapshot export with metadata and checksum
    status: pending
  - id: safe-import
    content: Implement validated import/promotion with rollback
    status: pending
  - id: startup-recovery
    content: Implement startup integrity detection and auto-recovery
    status: pending
  - id: retention-conflicts
    content: Add rolling retention and stale-snapshot conflict rules
    status: pending
  - id: testing-docs
    content: Add unit/integration/manual test plan and usage docs
    status: pending
isProject: false
---

# Implement Safe Cloud Sync for Database Files

## Goal

Adopt a sync architecture that avoids live SQLite file syncing and reduces corruption/conflict risk when using iCloud (or similar providers).

## Chosen Architecture

- Keep the active database local-only (not inside cloud-synced folders).
- Sync immutable snapshot artifacts (or logical record deltas) through cloud storage.
- Validate every export/import with integrity checks and generation metadata.

## Implementation Steps

- Define a storage layout and lifecycle:
  - Local active DB path.
  - Local snapshot staging path.
  - Cloud snapshot path.
- Add a safe export pipeline:
  - Pause writes (or run in controlled maintenance window).
  - Run checkpoint/truncation for WAL mode.
  - Create atomic snapshot copy.
  - Run integrity checks on snapshot.
  - Write sidecar metadata (generation ID, timestamp, checksum, app/schema version).
- Add a safe import/restore pipeline:
  - Discover latest valid snapshot in cloud path.
  - Verify checksum + metadata compatibility.
  - Run integrity check before promotion.
  - Promote snapshot atomically with rollback support.
- Add startup recovery logic:
  - Detect active DB corruption or mismatch.
  - Auto-recover from latest known-good snapshot.
  - Preserve failed artifacts for diagnostics.
- Add retention and conflict controls:
  - Keep N rolling snapshots.
  - Use monotonic generation IDs and device ID in metadata.
  - Reject stale snapshot imports.
- Add observability:
  - Structured logs around export/import/check/restore.
  - Metrics or counters for successful sync, failed validation, and recovery events.

## Validation Strategy

- Unit tests:
  - Metadata parse/validate.
  - Checksum/generation logic.
  - Snapshot selection rules.
- Integration tests:
  - Export -> upload/sync -> import roundtrip.
  - Corrupted snapshot rejection.
  - Crash/interruption during export/import.
- Manual tests:
  - Two-device handoff using iCloud-synced snapshot directory.
  - Offline edits then reconnect scenarios.

## Deliverables

- Sync service/module for export/import/recovery.
- Metadata schema and checksum helper.
- Test coverage for corruption and conflict scenarios.
- Short operator/developer doc describing safe usage and limits.

