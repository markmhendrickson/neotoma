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
| `NEOTOMA_DB_BACKEND` | DB driver: `sqlite` (synchronous, zero-config) or `libsql` (concurrent — statements run off the event loop via worker-hosted driver for local files, or @libsql/client for remote sqld/Turso, so slow queries can't freeze the server; recommended for hosted/agent-heavy/shared instances) | `sqlite` |
| `NEOTOMA_DB_URL` | libsql connection URL (`file:` for embedded local, `http(s)://`/`libsql://` for remote sqld/Turso) | `file:{NEOTOMA_SQLITE_PATH}` |
| `NEOTOMA_DB_AUTH_TOKEN` | Auth token for remote libsql connections | unset |
| `NEOTOMA_DB_READER_WORKERS` | Read-only worker connections for the local `libsql` backend (WAL lets them run concurrently with the writer) | `2` |
| `NEOTOMA_RAW_STORAGE_DIR` | Content-addressed source files | `{dataDir}/sources` |
| `NEOTOMA_LOGS_DIR` / `NEOTOMA_EVENT_LOG_PATH` | Log directory and event log file | under `{dataDir}/logs` |
| `NEOTOMA_HOST_URL` / `NEOTOMA_PUBLIC_BASE_URL` | Public URL of this instance | auto-discovered or unset |

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
