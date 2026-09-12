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

### Under test, the user-level step is refused

A test-shaped process — one with `VITEST` set, `NODE_ENV=test`, or `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1` — does **not** fall back to `~/.config/neotoma/.env` for its data directory. If it reaches that step it stops and exits non-zero, naming the variable to set.

The reason is that the user-level config names the data directory holding real data. A test process, or a CLI child a test spawns without passing `NEOTOMA_DATA_DIR` through, would otherwise read and write that directory silently and succeed — so the mistake is invisible, and a test can pass on residue left in real data rather than on the code under test.

So set `NEOTOMA_DATA_DIR` to a test-scoped directory, and pass it explicitly to every CLI child process a test spawns rather than relying on inheritance. To exercise the user-level fallback deliberately, set `NEOTOMA_ALLOW_USER_ENV_IN_TEST=1`.

Nothing changes for normal operation: the interactive CLI, the server, and every non-test entry point resolve the data directory exactly as the order above describes.

## Environments

`NEOTOMA_ENV` selects the profile: `development` (default) or `production`. The profiles use separate database files, source directories, and logs so a dev stack never touches prod data. Production also changes default ports and tightens auth expectations.

## Core variables

| Variable                                       | Purpose                                                                                                                                                                                                                                                                                                                    | Default                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `NEOTOMA_ENV`                                  | `development` or `production`                                                                                                                                                                                                                                                                                              | `development`                |
| `NEOTOMA_DATA_DIR`                             | Root data directory                                                                                                                                                                                                                                                                                                        | local `data/`                |
| `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR`            | `1` demands an explicit `NEOTOMA_DATA_DIR`: refuse the `~/.config/neotoma/.env` fallback and exit non-zero. Implied by `VITEST` / `NODE_ENV=test`                                                                                                                                                                          | unset                        |
| `NEOTOMA_ALLOW_USER_ENV_IN_TEST`               | `1` re-permits that fallback in a test-shaped process, for a test that means to exercise it                                                                                                                                                                                                                                | unset                        |
| `NEOTOMA_SQLITE_PATH`                          | Explicit database file path                                                                                                                                                                                                                                                                                                | `{dataDir}/neotoma.db` (dev) |
| `NEOTOMA_DB_BACKEND`                           | DB driver: `sqlite` (synchronous, zero-config) or `libsql` (concurrent — statements run off the event loop via worker-hosted driver for local files, or @libsql/client for remote sqld/Turso, so slow queries can't freeze the server; recommended for hosted/agent-heavy/shared instances)                                | `sqlite`                     |
| `NEOTOMA_DB_URL`                               | libsql connection URL (`file:` for embedded local, `http(s)://`/`libsql://` for remote sqld/Turso)                                                                                                                                                                                                                         | `file:{NEOTOMA_SQLITE_PATH}` |
| `NEOTOMA_DB_AUTH_TOKEN`                        | Auth token for remote libsql connections                                                                                                                                                                                                                                                                                   | unset                        |
| `NEOTOMA_DB_READER_WORKERS`                    | Read-only worker connections for the local `libsql` backend (WAL lets them run concurrently with the writer). Reads go to the least-loaded reader, so raising this adds capacity rather than just slots                                                                                                                    | `2`                          |
| `NEOTOMA_DB_STATEMENT_TIMEOUT_MS`              | Per-statement budget for reads on that reader pool. On expiry the reader is terminated (the synchronous driver cannot be interrupted mid-statement) and respawns on the next read, so one runaway query cannot hold a pool slot indefinitely. Writes and statements inside a transaction are never timed out. `0` disables | `30000`                      |
| `NEOTOMA_RAW_STORAGE_DIR`                      | Content-addressed source files                                                                                                                                                                                                                                                                                             | `{dataDir}/sources`          |
| `NEOTOMA_LOGS_DIR` / `NEOTOMA_EVENT_LOG_PATH`  | Log directory and event log file                                                                                                                                                                                                                                                                                           | under `{dataDir}/logs`       |
| `NEOTOMA_HOST_URL` / `NEOTOMA_PUBLIC_BASE_URL` | Public URL of this instance                                                                                                                                                                                                                                                                                                | auto-discovered or unset     |

### When to opt into `NEOTOMA_DB_BACKEND=libsql`

Stay on the default `sqlite` backend until you have a concrete reason to switch. Switch to `libsql` when **either** of these is true:

- You operate a **hosted, multi-user, or agent-heavy instance** where a single slow query (e.g. a deep-offset paginated query) has been observed to block health checks or other callers — this was the production symptom that motivated the concurrent backend (see `docs/infrastructure/deployment.md` § SQLite concurrency and the multi-writer model).
- You are moving a database file to a **remote sqld/Turso URL** (`NEOTOMA_DB_URL=libsql://...` or `http(s)://...`), which requires the `libsql` backend regardless of load.

Before flipping the variable on an existing database, run `npx tsx scripts/validate_libsql_migration.ts <path-to-db>` — it proves the file adopts safely under libsql (integrity check, per-table row-count parity, snapshot hydration spot check) without mutating the original file.

## Server and ports

| Variable                             | Purpose                    | Default                 |
| ------------------------------------ | -------------------------- | ----------------------- |
| `NEOTOMA_HTTP_PORT` (or `HTTP_PORT`) | HTTP API and HTTP MCP port | `3080` dev, `3180` prod |
| `WS_PORT`                            | WebSocket MCP bridge port  | `8280`                  |

See [Running the Server](running_the_server.md) for transports and processes.

## Auth and access

| Variable                              | Purpose                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEOTOMA_REQUIRE_KEY_FOR_OAUTH`       | Require a key for OAuth connections                                                                                                                                         |
| `NEOTOMA_OAUTH_CLIENT_ID`             | MCP OAuth client id (hosted mode)                                                                                                                                           |
| `NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS` | Comma-separated **exact** callback URLs additionally trusted to receive an authorization code when the authorize request arrives via a tunnel. Empty by default. See below. |
| `NEOTOMA_SANDBOX_MODE`                | Opt into the public hosted-sandbox profile                                                                                                                                  |
| `NEOTOMA_REFUSE_MODE`                 | `warn` or `enforce` when a no-auth, non-loopback topology is detected                                                                                                       |

### Trusted OAuth callback URLs

When an authorize request reaches a local-backend instance over a tunnel, the `redirect_uri` must be on an allowlist, so an authorization code is never handed to a third-party site. Built in are the `cursor:`/`vscode:`/`app:` schemes, localhost and loopback, this instance's own origin, and the ChatGPT and Claude callbacks.

To let a **self-hosted first-party app** complete sign-in against a hosted instance, set its callback URL:

```bash
NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS=https://app.example.com/auth/callback
```

Several entries are comma-separated. Rules worth knowing before you set it:

- **Exact full URLs, not origins.** The example above authorises `https://app.example.com/auth/callback` and **not** `https://app.example.com/anything-else`. Configure every callback path you need.
- **https only**, unless the host is loopback. A plaintext `http://` entry to any other host is rejected rather than honoured.
- **A bad entry rejects the whole list, and the server will not start.** See below.

#### What the server compares

A redirect is accepted when the request's callback and a configured entry agree on **scheme, host, port and path** — all four. In detail:

| Part               | How it is compared                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheme             | Must match. `https` does not authorise its `http` twin.                                                                                                                                                                                                                   |
| Host               | Case-**insensitive**. `APP.EXAMPLE.COM` matches `app.example.com`.                                                                                                                                                                                                        |
| Port               | Must match, but a default port is equivalent to none: `https://app.example.com` = `https://app.example.com:443`.                                                                                                                                                          |
| Path               | Case-**sensitive**. `/Auth/Callback` does **not** match `/auth/callback`. A trailing slash is insignificant in either direction. Dot segments resolve first, so `/auth/callback/../admin` is compared as `/auth/admin`. An encoded slash (`%2F`) is not a path separator. |
| Query and fragment | **Ignored on both sides**, so the usual `?code=...&state=...` callback matches.                                                                                                                                                                                           |
| Userinfo           | Any URL carrying `user:password@` is rejected.                                                                                                                                                                                                                            |

If a redirect is refused, the `400` response names the callback URL the server actually compared (scheme, host and path — query and fragment are stripped) and says how many entries are configured. That is usually enough to tell a near miss — a trailing slash, a port, a case difference — from a typo or an unset variable, without needing server logs.

#### A malformed entry fails the whole list, loudly

If **any** entry cannot be used as a trusted callback URL, the entire list is rejected and **the server fails to start** with an error naming the offending entry by position and value. Entries 1 and 3 do not quietly survive a bad entry 2.

This is deliberate. The friendlier alternative — skip the bad entry, honour the rest — makes the allowlist enforce something other than what you wrote, with no signal that it did: the refusal a dropped entry produces looks exactly like an exact-match miss. A startup failure is noisy, but it happens immediately and before any sign-in is served, rather than surfacing weeks later as an unexplained OAuth failure.

Entries are rejected when they are unparseable, use a scheme other than `https:`/`http:`, are plaintext `http:` to a non-loopback host, or carry `user:password@` userinfo. To recover, either fix the entry the error names, or unset the variable entirely to fall back to the built-in allowlist.

> The variable is `NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS`. Early planning notes for this feature called it `NEOTOMA_TRUSTED_OAUTH_CALLBACKS`; that name was never implemented and setting it has no effect.

See [Deployment Modes](deployment.md) and [Agent Access Control](agent_access_control.md).

## Encryption

| Variable                                           | Purpose                                       |
| -------------------------------------------------- | --------------------------------------------- |
| `NEOTOMA_ENCRYPTION_ENABLED`                       | Turn on AES-256-GCM at-rest column encryption |
| `NEOTOMA_KEY_FILE_PATH`                            | Path to a 32-byte key file                    |
| `NEOTOMA_MNEMONIC` / `NEOTOMA_MNEMONIC_PASSPHRASE` | BIP-39 mnemonic key source                    |
| `NEOTOMA_LOG_ENCRYPTION_ENABLED`                   | Encrypt the event log                         |
| `NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY`                 | Encrypt stored MCP OAuth tokens               |

See [Encryption and Key Management](encryption.md).

## Search, inspector, and docs

| Variable                                                                                     | Purpose                                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                                                                             | Enables semantic vector search (embeddings); keyword search works without it |
| `NEOTOMA_INSPECTOR_DISABLE` / `NEOTOMA_PUBLIC_INSPECTOR_URL` / `NEOTOMA_INSPECTOR_BASE_PATH` | Control the bundled Inspector                                                |
| `NEOTOMA_DOCS_SHOW_INTERNAL`                                                                 | Show `visibility: internal` docs in the in-app `/docs` browser               |

## Limits and mirror

`NEOTOMA_MIRROR_ENABLED`, `NEOTOMA_MIRROR_PATH`, `NEOTOMA_MIRROR_KINDS`, and `NEOTOMA_MIRROR_GIT_ENABLED` control the canonical Markdown mirror (see [the mirror](../subsystems/markdown_mirror.md)). Per-user limits such as max peers and max subscriptions are configurable; see the federation docs.

## Verify

Run `neotoma doctor` to validate the resolved configuration, database, and security posture. For the exhaustive variable list with inline notes, read `.env.example` in the repository root.
