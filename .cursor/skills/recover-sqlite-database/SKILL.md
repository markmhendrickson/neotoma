---
name: recover-sqlite-database
description: Check Neotoma SQLite integrity and run .recover when the DB is corrupt (malformed disk image, btree errors). Use when MCP/API fails with SQLite corruption.
triggers:
  - sqlite corrupt
  - database disk image is malformed
  - integrity_check
  - neotoma db recovery
  - recover sqlite
---

# Recover Neotoma SQLite Database

## When to use

Neotoma errors such as **`database disk image is malformed`**, failed **`PRAGMA integrity_check`**, or **`btreeInitPage` / SQLITE_CORRUPT** on the local SQLite file (`neotoma.db` or `neotoma.prod.db` under `NEOTOMA_DATA_DIR`).

## Preconditions

- **`sqlite3`** CLI on `PATH` (macOS usually has it).
- **Stop Neotoma** (MCP stdio processes, `neotoma api`, anything using the DB) before **`--recover`** or before swapping files.

## Script (primary)

From the Neotoma repo root:

```bash
# Check only (exit 0 = ok, 2 = corrupt)
node scripts/recover_sqlite_database.js
node scripts/recover_sqlite_database.js --env production

# Write recovered copy (does not replace live DB)
node scripts/recover_sqlite_database.js --env production --recover
```

Or: `npm run recover:db` and `npm run recover:db:prod -- --recover` (see `package.json`).

Output is a sibling file like `neotoma.prod.recovered-<timestamp>.db`. Verify it reports **`PRAGMA integrity_check: ok`**, then **manually** archive the live `.db`/`-wal`/`-shm` and **`cp`** the recovered file to the live name.

## After swap

- Inspect **`lost_and_found`** in the recovered file if present; re-ingest important rows via **`POST /store`** / MCP **`store_structured`** using normal schemas (see prior recovery notes: `note`, `product_feedback`, etc.).
- Prefer **`NEOTOMA_DATA_DIR` outside iCloud-synced folders** (e.g. not only under `~/Documents` if Documents syncs) to reduce recurrence.

## Do not

- Run **`--recover`** while Neotoma still holds the database open.
- Auto-delete the corrupt file until a good recovered copy is verified and backed up.
