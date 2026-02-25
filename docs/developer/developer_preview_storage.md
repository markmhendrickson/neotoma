# Developer preview storage

## Scope

This document states the storage stance for the Neotoma **developer preview**: what is supported and what is not. It does not define migration or deployment procedures.

## Developer preview: local storage only

For the developer preview, **only local storage is supported.**

- **Database:** SQLite at `./data/neotoma.db` (development) or `./data/neotoma.prod.db` (production). Set `NEOTOMA_DATA_DIR` to change the data root.
- **Raw file storage:** Local directory at `./data/sources/` (dev) or `./data/sources_prod/` (prod). Set `NEOTOMA_RAW_STORAGE_DIR` if needed.
- **Backend:** Local backend only in developer preview.

**Why local-only for the preview:** Local storage keeps the preview easy to run, avoids external dependencies, and makes truth validation and determinism easier to reason about. All operations stay on your machine with full control over data and audit trails.

## What is not in the developer preview

- **Remote backends** (e.g. PostgreSQL, S3, cloud storage) are out of scope for the preview.

When remote storage is reintroduced (in a future release), it will be documented in [Getting started](getting_started.md) and the main [README](../../README.md).

## Quick reference

| Need                         | Developer preview | Later (when supported) |
|-----------------------------|-------------------|-------------------------|
| Run Neotoma locally         | Local (SQLite + local files) | Same or remote backend |
| Truth validation / determinism | Local preferred   | Local or remote         |
| Multi-user / hosted         | Not in preview    | Remote backend          |
| No external service         | Local only        | Local only              |

## Related

- [Getting started](getting_started.md) – Full setup and env vars
- [README – Developer preview](../../README.md#developer-preview) – Guarantees and who the preview is for
