# Developer preview storage

## Scope

This document states the storage stance for the Neotoma **developer preview**: what is supported and what is not. It does not define migration or deployment procedures.

## Developer preview: local storage only

For the developer preview, **only local storage is supported.**

- **Database:** SQLite at `./data/neotoma.db` (development) or `./data/neotoma.prod.db` (production). Set `NEOTOMA_SQLITE_PATH` if you need a custom path.
- **Raw file storage:** Local directory at `./data/sources/` (dev) or `./data/sources_prod/` (prod). Set `NEOTOMA_RAW_STORAGE_DIR` if needed.
- **Backend:** Use `NEOTOMA_STORAGE_BACKEND=local` or leave it unset (local is the default).

**Why local-only for the preview:** Local storage keeps the preview easy to run, avoids external dependencies, and makes truth validation and determinism easier to reason about. All operations stay on your machine with full control over data and audit trails.

## What is not in the developer preview

- **Supabase** (PostgreSQL + Supabase Storage) is **not** currently supported in the developer preview. Code and docs may reference it for future use; do not rely on Supabase for preview workflows.
- **Other remote backends** (e.g. S3-only, other Postgres hosts) are out of scope for the preview.

When remote storage is reintroduced (in a future release), it will be documented in [Getting started](getting_started.md) and the main [README](../../README.md). Use Supabase or other remote backends when you need multi-user hosted deployment, shared access, or when local storage is not sufficient for your use case.

## Quick reference

| Need                         | Developer preview | Later (when supported) |
|-----------------------------|-------------------|-------------------------|
| Run Neotoma locally         | Local (SQLite + local files) | Same or Supabase |
| Truth validation / determinism | Local preferred   | Local or Supabase |
| Multi-user / hosted         | Not in preview    | Supabase                |
| No external service         | Local only        | Local only              |

## Related

- [Getting started](getting_started.md) – Full setup, env vars, and optional Supabase steps (for when supported)
- [README – Developer preview](../../README.md#developer-preview) – Guarantees and who the preview is for
- [README – Supabase and remote storage](../../README.md#supabase-and-remote-storage-not-in-developer-preview) – Reference section for future Supabase support
