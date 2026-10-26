Backup restore now validates and stages a complete snapshot before changing the target, and it protects the previous target when a caught publication error occurs.

This is an unreleased candidate supplement. It does not describe behavior shipped in v0.25.0, and publishing v0.26.0 is not authorized by this document.

## Highlights

- **Restore the backup you selected, not stale target state.** `neotoma backup restore` publishes a verified self-contained database and removes the target's old WAL and SHM sidecars.
- **Keep the previous target recoverable when publication fails.** Caught filesystem failures trigger an attempted rollback of the prior database, sidecars, and referenced directories; a rollback failure reports the retained recovery location.
- **Preserve unrelated target content.** Source and log directories are overlaid without replacing unrelated files or accepting symlink aliases that overlap the backup and target.

## What changed for npm package users

**CLI (`neotoma backup restore`)**

- Restore applies manifest, containment, checksum, snapshot-method, WAL-identity, database-size, and SQLite-integrity checks before target writes.
- All referenced inputs are copied and verified in a sibling staging directory. Legacy file-copy database/WAL pairs are materialized as a self-contained database before publication.
- Operators must stop Neotoma and every other SQLite client before restore. The CLI refuses open target database handles when the platform can identify them, but the offline-use requirement remains authoritative.
- The target's prior database, `-wal`, `-shm`, and referenced directories are moved to a sibling recovery area during publication. An existing target database's permission bits are applied to the verified staged database before publication. A caught failure attempts rollback; if rollback also fails, the error names the retained `previous-target` directory for manual recovery.

**Runtime / data layer**

- No database schema or storage-format change. Existing valid `vacuum_into` backups and older valid `file_copy` database/WAL backups remain supported.

**Shipped artifacts**

- CLI implementation and documentation change. OpenAPI and MCP tool surfaces are unchanged.

## API surface & contracts

No HTTP, OpenAPI, MCP tool, or schema contract changed.

## Behavior changes

- A valid restore no longer leaves an old target WAL or SHM next to the restored database.
- An existing target database keeps its prior permission bits rather than inheriting the staged file's default mode.
- Referenced directory content is overlaid while unrelated target content is retained.
- Backup/target overlap through symlinked ancestors, target symlinks, and symlinks inside referenced directory trees are refused before publication.
- A caught publication failure exits non-zero after attempting rollback. This is not a crash-wide atomicity guarantee; operators should keep the backup and inspect the reported target/recovery state before restarting clients.

## Plugin / hooks / SDK changes

No plugin, hook, or SDK surface changed.

## Security hardening

No security-sensitive surfaces touched.

## Docs site & CI / tooling

- The CLI reference documents offline use, staging, stale-sidecar removal, content preservation, attempted rollback, recovery-location reporting, and the crash-atomicity limit.

## Internal changes

- Publication is represented as ordered target members with tracked old/new moves so caught failures can be reversed without replacing the whole target directory.

## Fixes

- Fixed restore success reopening with rows from a stale target WAL instead of the selected backup.
- Fixed later member-copy failures leaving the previous database replaced without an attempted rollback.

## Tests and validation

- Focused backup/restore and recovery-hint suites cover current snapshots, legacy database/WAL materialization, stale target sidecars, invalid preflight inputs, containment and symlink aliases, unrelated nested content, caught publication rollback, and rollback-failure recovery material on both supported SQLite drivers.

## Breaking changes

No breaking changes.
