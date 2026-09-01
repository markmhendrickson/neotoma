---
title: Configuration Reference
summary: The data directory model, environments, and the NEOTOMA_* environment variables an operator sets.
category: operations
audience: operator
visibility: public
order: 10
tags: [configuration, environment, env, operations]
---

# Configuration Reference

Neotoma is configured by environment variables and a data directory. No `.env` is required for a default local install; set variables only to override defaults. This page lists the operator-relevant variables. The repository `.env.example` documents the full set.

## Data directory

All state lives under one directory you control, set by `NEOTOMA_DATA_DIR` (default: a local `data/` directory). It contains the SQLite database, content-addressed file storage for sources, logs, and (when enabled) the canonical mirror. Back this directory up to back up Neotoma.

Resolution order for the data directory and variables: a project-local `.env`, then `~/.config/neotoma/.env`, then built-in defaults.

## Environments

`NEOTOMA_ENV` selects the profile: `development` (default) or `production`. The profiles use separate database files, source directories, and logs so a dev stack never touches prod data. Production also changes default ports and tightens auth expectations.

## Core variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEOTOMA_ENV` | `development` or `production` | `development` |
| `NEOTOMA_DATA_DIR` | Root data directory | local `data/` |
| `NEOTOMA_SQLITE_PATH` | Explicit database file path | `{dataDir}/neotoma.db` (dev) |
| `NEOTOMA_DB_BACKEND` | DB driver: `sqlite` (synchronous, zero-config) or `libsql` (concurrent — statements run off the event loop via worker-hosted driver for local files, or @libsql/client for remote sqld/Turso, so slow queries can't freeze the server) | `libsql` for servers, `sqlite` for CLI |
| `NEOTOMA_DB_URL` | libsql connection URL (`file:` for embedded local, `http(s)://`/`libsql://` for remote sqld/Turso) | `file:{NEOTOMA_SQLITE_PATH}` |
| `NEOTOMA_DB_AUTH_TOKEN` | Auth token for remote libsql connections | unset |
| `NEOTOMA_DB_READER_WORKERS` | Read-only worker connections for the local `libsql` backend (WAL lets them run concurrently with the writer) | `2` |
| `NEOTOMA_DB_MAX_QUEUED_STATEMENTS` | Max statements queued per worker connection before new ones are rejected with `WorkerDbOverloadError`; bounds memory under saturation. `0` disables the bound (not recommended for servers) | `512` |
| `NEOTOMA_RAW_STORAGE_DIR` | Content-addressed source files | `{dataDir}/sources` |
| `NEOTOMA_LOGS_DIR` / `NEOTOMA_EVENT_LOG_PATH` | Log directory and event log file | under `{dataDir}/logs` |
| `NEOTOMA_HOST_URL` / `NEOTOMA_PUBLIC_BASE_URL` | Public URL of this instance | auto-discovered or unset |

### How the backend is chosen

`NEOTOMA_DB_BACKEND` wins whenever it is set. When it is unset, the default depends on what kind of process is running:

| Process | Default | Why |
| --- | --- | --- |
| **Server** (`dist/actions.js`, MCP stdio server) | `libsql` | Many callers share one event loop. Under the synchronous driver a single slow query blocks *every* concurrent request for its full duration — including `GET /health`, which touches no database. |
| **CLI** (`neotoma …`, scripts) | `sqlite` | One-shot process, nothing else waiting on the loop. Spawning worker threads would be pure overhead. |

A process declares itself a server by importing `src/process_role.js`; see the note in that file. The role is deliberately **not** read from the environment — an inherited or `.env`-sourced value would flip the backend for every CLI invocation and every test worker.

This default changed in response to neotoma#2280. The worker-hosted backend had existed since #1944, but it was opt-in via an env var that no Dockerfile, fly config, or start script set — so every server deployment silently kept the blocking driver. A hosted instance served the DB-free `/health` endpoint in 9.4s measured from inside its own VM, with 6GB free and ~42% idle CPU. An opt-in fix that nothing opts into is not a fix.

Measured on the same slow query (a self-join over 6k rows), sync backend vs worker pool:

| Backend | Slow query | Max event-loop lag | Concurrent health check |
| --- | --- | --- | --- |
| `sqlite` (synchronous) | 1100ms | **1091ms** | blocked until the slow query finished |
| `libsql` (worker pool) | 1112ms | **2ms** | answered in 15ms, before the slow query |

The slow query itself is no faster — SQLite does the same work. What changes is that it no longer holds the event loop while doing it.

### Overriding the default

Set `NEOTOMA_DB_BACKEND=sqlite` on a server to force the synchronous driver (e.g. to isolate a suspected backend-specific bug). Set `NEOTOMA_DB_BACKEND=libsql` on a CLI process when pointing it at a **remote sqld/Turso URL** (`NEOTOMA_DB_URL=libsql://...` or `http(s)://...`), which requires the `libsql` backend regardless of load.

Before adopting an existing database file under libsql, run `npx tsx scripts/validate_libsql_migration.ts <path-to-db>` — it proves the file adopts safely (integrity check, per-table row-count parity, snapshot hydration spot check) without mutating the original file.

### Backpressure

Moving statements off the event loop does not make the database faster. If arrivals outpace what SQLite can retire, the backlog has to go somewhere — and unbounded, it grows the heap until the process OOMs, which is worse than being slow because it loses every queued request instead of delaying them. Each worker connection therefore bounds its in-flight queue at `NEOTOMA_DB_MAX_QUEUED_STATEMENTS` (default 512) and rejects overflow with a retryable `WorkerDbOverloadError` naming the limit.

## Server and ports

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEOTOMA_HTTP_PORT` (or `HTTP_PORT`) | HTTP API and HTTP MCP port | `3080` dev, `3180` prod |
| `WS_PORT` | WebSocket MCP bridge port | `8280` |

See [Running the Server](running_the_server.md) for transports and processes.

## Auth and access

| Variable | Purpose |
| --- | --- |
| `NEOTOMA_REQUIRE_KEY_FOR_OAUTH` | Require a key for OAuth connections |
| `NEOTOMA_OAUTH_CLIENT_ID` | MCP OAuth client id (hosted mode) |
| `NEOTOMA_SANDBOX_MODE` | Opt into the public hosted-sandbox profile |
| `NEOTOMA_REFUSE_MODE` | `warn` or `enforce` when a no-auth, non-loopback topology is detected |

See [Deployment Modes](deployment.md) and [Agent Access Control](agent_access_control.md).

## Encryption

| Variable | Purpose |
| --- | --- |
| `NEOTOMA_ENCRYPTION_ENABLED` | Turn on AES-256-GCM at-rest column encryption |
| `NEOTOMA_KEY_FILE_PATH` | Path to a 32-byte key file |
| `NEOTOMA_MNEMONIC` / `NEOTOMA_MNEMONIC_PASSPHRASE` | BIP-39 mnemonic key source |
| `NEOTOMA_LOG_ENCRYPTION_ENABLED` | Encrypt the event log |
| `NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY` | Encrypt stored MCP OAuth tokens |

See [Encryption and Key Management](encryption.md).

## Search, inspector, and docs

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables semantic vector search (embeddings); keyword search works without it |
| `NEOTOMA_INSPECTOR_DISABLE` / `NEOTOMA_PUBLIC_INSPECTOR_URL` / `NEOTOMA_INSPECTOR_BASE_PATH` | Control the bundled Inspector |
| `NEOTOMA_DOCS_SHOW_INTERNAL` | Show `visibility: internal` docs in the in-app `/docs` browser |

## Limits and mirror

`NEOTOMA_MIRROR_ENABLED`, `NEOTOMA_MIRROR_PATH`, `NEOTOMA_MIRROR_KINDS`, and `NEOTOMA_MIRROR_GIT_ENABLED` control the canonical Markdown mirror (see [the mirror](../subsystems/markdown_mirror.md)). Per-user limits such as max peers and max subscriptions are configurable; see the federation docs.

## Verify

Run `neotoma doctor` to validate the resolved configuration, database, and security posture. For the exhaustive variable list with inline notes, read `.env.example` in the repository root.
