# Health checks

Neotoma exposes three public health routes. None needs sign-in. Each one proves less than its name suggests, so this page states what each proves and what it does not.

## What each check proves

| Route                | Status code decided by                              | Proves                                                                                                       | Does not prove                                                                                                     |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `GET /health`        | Nothing (always 200 while the process answers)      | The process is up and serving HTTP.                                                                          | Anything about the database or the disk. It answers 200 through a total read outage.                               |
| `GET /ready`         | The database read probe (one bounded one-row read). | The database accepts a connection and completes a trivial indexed read within `NEOTOMA_READY_DB_TIMEOUT_MS`. | That heavier queries complete, or that writes succeed. It also does not prove the database file on disk is intact. |
| `GET /ready/storage` | The storage write probe.                            | The volume holding the database file has free space above the floor and accepts a small synced file write.   | That the database itself accepts writes. See below.                                                                |

## Storage write probe

The probe runs in two steps:

1. It reads free space on the volume that holds the database file and compares it with `NEOTOMA_READY_MIN_FREE_MB`.
2. If free space is above the floor, it writes and fsyncs one small fixed-name file, `.neotoma_ready_write_probe`, in the same directory. Each probe overwrites the same file, so nothing accumulates.

The probe writes a file, not a database row. Neotoma has no table that a probe could write without adding history, touching user data or needing a schema migration. **A passing probe does not prove the database accepts writes.** It does not prove SQLite can take its write lock, that the database file is writable, or that a store request will commit. It does catch the common case where every write fails: a full or read-only data volume.

`GET /ready` reports the probe result in its body as `checks.storage_write` (`ok`, `failed` or `skipped`), with a short `storage_write_reason` when the result is not `ok`. By default this does not change the status code. On a single-machine instance a failing traffic check removes the machine, which would also stop the reads that still work. Set `NEOTOMA_READY_REQUIRE_WRITE=1` to make a failed write also return 503 from `GET /ready`.

`GET /ready/storage` returns 503 when free space is below the floor, the free-space read fails, or the write fails or times out. It returns 200 otherwise, including when the probe is disabled (`skipped`). Use it for an alerting check that should not take the machine out of service.

Responses carry only a fixed reason code: `below_free_space_floor`, `free_space_check_failed`, `write_failed`, `write_timeout` or `disabled`. Paths, sizes and raw error text go to the server log.

## Load and caching

These routes are public, so the probe result is cached for `NEOTOMA_READY_WRITE_CACHE_MS`, and concurrent requests share one in-flight probe. Request volume cannot turn into write volume: at most one probe write happens per cache interval. Failures are cached too. If a previous probe write is still hung, a new probe reports `write_timeout` instead of starting another write.

## Configuration

| Variable                         | Default | Effect                                                                                                                     |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `NEOTOMA_READY_DB_TIMEOUT_MS`    | `20000` | Bound for the database read probe (floor 1000).                                                                            |
| `NEOTOMA_READY_MIN_FREE_MB`      | `64`    | Free-space floor for the storage probe. `0` disables the floor.                                                            |
| `NEOTOMA_READY_WRITE_TIMEOUT_MS` | `5000`  | Bound for the storage probe (floor 500).                                                                                   |
| `NEOTOMA_READY_WRITE_CACHE_MS`   | `30000` | How long a storage probe result is reused (floor 1000).                                                                    |
| `NEOTOMA_READY_REQUIRE_WRITE`    | off     | When `1`, a failed storage probe also fails `GET /ready`.                                                                  |
| `NEOTOMA_READY_WRITE_PROBE`      | on      | When `0`, the probe writes nothing and reports `skipped`. Use it for deployments that must not write to their data volume. |

Neotoma has no built-in read-only mode today, so the probe runs in every mode, the hosted sandbox included, unless `NEOTOMA_READY_WRITE_PROBE=0` is set.

The Fly health check in `fly.toml` still targets `GET /ready`.
